import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertClientSchema } from "@shared/schema";
import { searchHousingPrograms } from "./services/tavily";
import { analyzeEmotions } from "./services/modulate";
import { classifyEligibility, extractClientEntities, classifyMultiDimensionalRelevance } from "./services/fastino";
import { submitApplication } from "./services/yutori";
import * as neo4jService from "./services/neo4j";
import { setupWebSocket, broadcastTranscriptSegment, broadcastCallEvent } from "./websocket";
import { generateNextResponse, generateInitialGreeting, summarizeIntakeCall } from "./services/llm-conversation";
import * as callState from "./call-state";
import { textToSpeechSimple } from "./services/elevenlabs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  setupWebSocket(httpServer);

  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clients", async (_req, res) => {
    try {
      const clients = await storage.getClients();
      res.json(clients);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clients/:id", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ error: "Client not found" });
      res.json(client);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const data = insertClientSchema.parse(req.body);
      const client = await storage.createClient(data);
      try {
        await neo4jService.createClientNode(client.id, client.name, client);
      } catch (e) {
        console.warn("Neo4j node creation failed:", e);
      }
      res.status(201).json(client);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/clients/:id", async (req, res) => {
    try {
      const client = await storage.updateClient(req.params.id, req.body);
      if (!client) return res.status(404).json({ error: "Client not found" });
      res.json(client);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/clients/:id/calls", async (req, res) => {
    try {
      const calls = await storage.getCalls(req.params.id);
      res.json(calls);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients/:id/call", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const callSid = `web-${Date.now()}`;

      const call = await storage.createCall({
        clientId: client.id,
        twilioCallSid: callSid,
        status: "in-progress",
        startedAt: new Date(),
      });

      callState.createActiveCall(call.id, client.id, callSid);
      await storage.updateClient(client.id, { status: "in-call" });

      broadcastCallEvent(call.id, client.id, "call_started", {
        callId: call.id,
        clientId: client.id,
        clientName: client.name,
      });

      const greeting = await generateInitialGreeting();

      callState.addConversationTurn(call.id, "assistant", greeting);
      callState.addTranscriptSegment(call.id, "agent", greeting, "neutral", 0.8);

      broadcastTranscriptSegment({
        callId: call.id,
        clientId: client.id,
        speaker: "agent",
        text: greeting,
        emotion: "neutral",
        confidence: 0.8,
        timestamp: Date.now(),
        turnIndex: 0,
      });

      res.status(201).json({ ...call, greetingText: greeting });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/calls/:callId/voice-turn", async (req, res) => {
    try {
      const { callId } = req.params;
      const activeCall = callState.getActiveCall(callId);
      if (!activeCall) return res.status(404).json({ error: "No active call found" });

      const callerText = req.body?.text;
      if (!callerText || !callerText.trim()) {
        return res.json({ agentText: "", sentenceEmotions: [], isComplete: false });
      }

      const sentences = callerText.split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      const sentenceEmotions: Array<{ text: string; emotion: string; confidence: number }> = [];

      const emotionResults = await Promise.all(
        sentences.map(sentence => analyzeEmotions(sentence))
      );

      for (let i = 0; i < sentences.length; i++) {
        const primary = emotionResults[i].emotions[0] || { emotion: "neutral", confidence: 0.5 };
        sentenceEmotions.push({
          text: sentences[i],
          emotion: primary.emotion,
          confidence: primary.confidence,
        });
      }

      const overallEmotion = await analyzeEmotions(callerText);
      const primaryEmotion = overallEmotion.emotions[0]?.emotion || "neutral";
      const emotionConfidence = overallEmotion.emotions[0]?.confidence || 0.5;

      callState.addConversationTurn(activeCall.callId, "user", callerText);
      callState.addTranscriptSegment(activeCall.callId, "caller", callerText, primaryEmotion, emotionConfidence);

      broadcastTranscriptSegment({
        callId: activeCall.callId,
        clientId: activeCall.clientId,
        speaker: "caller",
        text: callerText,
        emotion: primaryEmotion,
        confidence: emotionConfidence,
        timestamp: Date.now(),
        turnIndex: activeCall.turnIndex,
        sentenceEmotions,
      });

      const { response, isComplete } = await generateNextResponse(
        activeCall.conversationHistory,
        callerText
      );

      callState.addConversationTurn(activeCall.callId, "assistant", response);
      callState.addTranscriptSegment(activeCall.callId, "agent", response, "neutral", 0.8);

      broadcastTranscriptSegment({
        callId: activeCall.callId,
        clientId: activeCall.clientId,
        speaker: "agent",
        text: response,
        emotion: "neutral",
        confidence: 0.8,
        timestamp: Date.now(),
        turnIndex: activeCall.turnIndex,
      });

      if (isComplete) {
        await finalizeCall(activeCall.callId);
      }

      res.json({
        agentText: response,
        sentenceEmotions,
        isComplete,
      });
    } catch (error: any) {
      console.error("Voice turn error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "Text is required" });

      const audioBuffer = await textToSpeechSimple(text);
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
      });
      res.send(audioBuffer);
    } catch (error: any) {
      console.warn("ElevenLabs TTS failed:", error.message);
      res.status(503).json({ error: "TTS unavailable", fallback: true });
    }
  });

  app.post("/api/calls/:callId/end", async (req, res) => {
    try {
      const { callId } = req.params;
      const activeCall = callState.getActiveCall(callId);
      if (!activeCall) return res.status(404).json({ error: "No active call found" });
      await finalizeCall(callId);
      res.json({ status: "completed" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  app.post("/api/calls/:id/complete", async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript) return res.status(400).json({ error: "Transcript required" });

      const call = await storage.getCall(req.params.id);
      if (!call) return res.status(404).json({ error: "Call not found" });

      const emotionResult = await analyzeEmotions(transcript);

      const updatedCall = await storage.updateCall(call.id, {
        status: "completed",
        endedAt: new Date(),
        transcript,
        emotionData: emotionResult.emotions,
        sentimentScore: emotionResult.sentimentScore,
        summary: `Call completed. Detected primary emotions: ${Object.entries(emotionResult.profile).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, s]) => `${e} (${Math.round(s * 100)}%)`).join(", ")}`,
      });

      await storage.updateClient(call.clientId, {
        status: "assessed",
        emotionProfile: emotionResult.profile,
      });

      try {
        await neo4jService.createCallNode(call.id, call.clientId, {
          status: "completed",
          sentimentScore: emotionResult.sentimentScore,
        });
      } catch (e) {
        console.warn("Neo4j call node creation failed:", e);
      }

      callState.removeActiveCall(call.id);
      broadcastCallEvent(call.id, call.clientId, "call_ended", { status: "completed" });

      res.json(updatedCall);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/calls/:id/live-transcript", async (req, res) => {
    const activeCall = callState.getActiveCall(req.params.id);
    if (!activeCall) {
      return res.json({ segments: [], active: false });
    }
    res.json({
      segments: activeCall.transcriptSegments,
      active: true,
      turnIndex: activeCall.turnIndex,
    });
  });

  app.post("/api/clients/:id/search-housing", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const results = await searchHousingPrograms(client);

      const programs = [];
      for (const r of results) {
        const program = await storage.createHousingProgram({
          clientId: client.id,
          name: r.name,
          provider: r.provider,
          description: r.description,
          url: r.url,
          location: r.location,
          programType: r.programType,
          relevanceScore: r.relevanceScore,
          requirements: r.requirements,
          contactInfo: r.contactInfo,
        });
        programs.push(program);

        try {
          await neo4jService.createProgramNode(program.id, client.id, program);
        } catch (e) {
          console.warn("Neo4j program node creation failed:", e);
        }
      }

      res.json(programs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clients/:id/housing", async (req, res) => {
    try {
      const programs = await storage.getHousingPrograms(req.params.id);
      res.json(programs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients/:id/extract-entities", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const calls = await storage.getCalls(req.params.id);
      const completedCalls = calls.filter(c => c.transcript);
      const fullTranscript = completedCalls.map(c => c.transcript).join("\n\n");

      if (!fullTranscript) {
        return res.json({ entities: {}, message: "No call transcripts available" });
      }

      const entities = await extractClientEntities(fullTranscript);
      res.json({ entities });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/housing/:programId/analyze", async (req, res) => {
    try {
      const { clientId } = req.body;
      if (!clientId) return res.status(400).json({ error: "clientId is required" });

      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const programs = await storage.getHousingPrograms(clientId);
      const program = programs.find(p => p.id === req.params.programId);
      if (!program) return res.status(404).json({ error: "Program not found" });

      const programText = `${program.name}: ${program.description || ""}. Requirements: ${program.requirements || ""}`;

      const calls = await storage.getCalls(clientId);
      const transcript = calls.filter(c => c.transcript).map(c => c.transcript).join("\n");
      const clientContext = transcript || `${client.location || ""}, ${client.employmentStatus || ""}, urgency: ${client.urgencyLevel || ""}`;

      const analysis = await classifyMultiDimensionalRelevance(programText, clientContext);

      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients/:clientId/eligibility/:programId", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const programs = await storage.getHousingPrograms(req.params.clientId);
      const program = programs.find(p => p.id === req.params.programId);
      if (!program) return res.status(404).json({ error: "Program not found" });

      const result = await classifyEligibility(client, program);

      const assessment = await storage.createEligibilityAssessment({
        clientId: client.id,
        programId: program.id,
        eligible: result.eligible,
        score: result.score,
        factors: result.factors,
        missingDocuments: result.missingDocuments,
        recommendation: result.recommendation,
      });

      try {
        await neo4jService.createEligibilityEdge(client.id, program.id, result.score, result.eligible);
      } catch (e) {
        console.warn("Neo4j eligibility edge creation failed:", e);
      }

      res.json(assessment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clients/:id/eligibility", async (req, res) => {
    try {
      const assessments = await storage.getEligibilityAssessments(req.params.id);
      res.json(assessments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients/:clientId/apply/:programId", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const programs = await storage.getHousingPrograms(req.params.clientId);
      const program = programs.find(p => p.id === req.params.programId);
      if (!program) return res.status(404).json({ error: "Program not found" });

      const submission = await submitApplication(client, program);

      const application = await storage.createApplication({
        clientId: client.id,
        programId: program.id,
        status: submission.status,
        submittedAt: new Date(),
        yutoriTaskId: submission.taskId,
        notes: submission.message,
      });

      try {
        await neo4jService.createApplicationEdge(client.id, program.id, application.id, submission.status);
      } catch (e) {
        console.warn("Neo4j application edge creation failed:", e);
      }

      res.status(201).json(application);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clients/:id/applications", async (req, res) => {
    try {
      const apps = await storage.getApplications(req.params.id);
      res.json(apps);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients/:id/run-pipeline", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const housingResults = await searchHousingPrograms(client);
      const programs = [];
      for (const r of housingResults) {
        const program = await storage.createHousingProgram({
          clientId: client.id,
          name: r.name,
          provider: r.provider,
          description: r.description,
          url: r.url,
          location: r.location,
          programType: r.programType,
          relevanceScore: r.relevanceScore,
          requirements: r.requirements,
          contactInfo: r.contactInfo,
        });
        programs.push(program);
        try { await neo4jService.createProgramNode(program.id, client.id, program); } catch (e) { console.warn("Neo4j:", e); }
      }

      const assessmentResults = [];
      for (const program of programs) {
        const result = await classifyEligibility(client, program);
        const assessment = await storage.createEligibilityAssessment({
          clientId: client.id, programId: program.id,
          eligible: result.eligible, score: result.score,
          factors: result.factors, missingDocuments: result.missingDocuments,
          recommendation: result.recommendation,
        });
        assessmentResults.push(assessment);
        try { await neo4jService.createEligibilityEdge(client.id, program.id, result.score, result.eligible); } catch (e) { console.warn("Neo4j:", e); }
      }

      await storage.updateClient(client.id, { status: "matched" });
      res.json({ programs, assessments: assessmentResults });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/referral-graph", async (req, res) => {
    try {
      const clientId = req.query.clientId as string | undefined;
      const graph = await neo4jService.getReferralGraph(clientId);
      res.json(graph);
    } catch (error: any) {
      const clientFilter = req.query.clientId as string | undefined;
      const allClients = clientFilter
        ? [await storage.getClient(clientFilter)].filter(Boolean)
        : await storage.getClients();
      const nodes: any[] = [];
      const edges: any[] = [];

      for (const client of allClients) {
        if (!client) continue;
        nodes.push({ id: client.id, label: client.name, type: "Client", data: { urgency: client.urgencyLevel, status: client.status } });

        const clientCalls = await storage.getCalls(client.id);
        for (const call of clientCalls) {
          if (call.status === "completed") {
            nodes.push({ id: call.id, label: `Call ${new Date(call.createdAt!).toLocaleDateString()}`, type: "Call", data: { sentiment: call.sentimentScore } });
            edges.push({ id: `${client.id}-call-${call.id}`, source: client.id, target: call.id, label: "HAD_CALL", data: {} });
          }
        }

        const programs = await storage.getHousingPrograms(client.id);
        for (const p of programs) {
          if (!nodes.find(n => n.id === p.id)) {
            nodes.push({ id: p.id, label: p.name, type: "Program", data: { type: p.programType, relevance: p.relevanceScore } });
          }
          edges.push({ id: `${client.id}-match-${p.id}`, source: client.id, target: p.id, label: "MATCHED_TO", data: { score: p.relevanceScore } });
        }

        const eligibility = await storage.getEligibilityAssessments(client.id);
        for (const e of eligibility) {
          if (e.programId) {
            edges.push({ id: `${client.id}-elig-${e.programId}`, source: client.id, target: e.programId, label: "ELIGIBLE_FOR", data: { score: e.score, eligible: e.eligible } });
          }
        }

        const apps = await storage.getApplications(client.id);
        for (const a of apps) {
          edges.push({ id: `${client.id}-apply-${a.programId}`, source: client.id, target: a.programId, label: "APPLIED_TO", data: { status: a.status } });
        }
      }

      res.json({ nodes, edges });
    }
  });

  return httpServer;
}

async function finalizeCall(callId: string) {
  const activeCall = callState.getActiveCall(callId);
  if (!activeCall) return;

  const fullTranscript = callState.getFullTranscript(callId);
  const emotionResult = await analyzeEmotions(fullTranscript);

  let summary = `Call completed. Detected primary emotions: ${Object.entries(emotionResult.profile).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, s]) => `${e} (${Math.round(s * 100)}%)`).join(", ")}`;

  let fastinoEntities: Record<string, string[]> = {};
  try {
    fastinoEntities = await extractClientEntities(fullTranscript);
  } catch (e) {
    console.warn("Fastino entity extraction during finalization failed:", e);
  }

  try {
    const intakeSummary = await summarizeIntakeCall(activeCall.conversationHistory);
    summary = intakeSummary.summary;

    const extractedData = intakeSummary.extractedData;
    const clientUpdate: Record<string, any> = { status: "assessed", emotionProfile: emotionResult.profile };
    if (extractedData.employmentStatus) clientUpdate.employmentStatus = extractedData.employmentStatus;
    if (extractedData.monthlyIncome !== null && extractedData.monthlyIncome !== undefined) clientUpdate.monthlyIncome = extractedData.monthlyIncome;
    if (extractedData.hasDependents !== null) clientUpdate.hasDependents = extractedData.hasDependents;
    if (extractedData.dependentCount !== null && extractedData.dependentCount !== undefined) clientUpdate.dependentCount = extractedData.dependentCount;
    if (extractedData.veteranStatus !== null) clientUpdate.veteranStatus = extractedData.veteranStatus;
    if (extractedData.hasDisability !== null) clientUpdate.hasDisability = extractedData.hasDisability;
    if (extractedData.hasId !== null) clientUpdate.hasId = extractedData.hasId;
    if (extractedData.hasSsn !== null) clientUpdate.hasSsn = extractedData.hasSsn;
    if (extractedData.hasProofOfIncome !== null) clientUpdate.hasProofOfIncome = extractedData.hasProofOfIncome;
    if (extractedData.preferredLocation) clientUpdate.location = extractedData.preferredLocation;
    if (extractedData.urgencyLevel) clientUpdate.urgencyLevel = extractedData.urgencyLevel;
    if (extractedData.notes) clientUpdate.notes = extractedData.notes;

    if (Object.keys(fastinoEntities).length > 0) {
      const entitySummary = Object.entries(fastinoEntities)
        .filter(([_, vals]) => vals.length > 0)
        .map(([key, vals]) => `${key}: ${vals.join(", ")}`)
        .join("; ");
      if (entitySummary) {
        clientUpdate.notes = (clientUpdate.notes || "") + `\n\nExtracted entities: ${entitySummary}`;
      }
    }

    await storage.updateClient(activeCall.clientId, clientUpdate);
  } catch (e) {
    console.warn("LLM summary failed, using basic summary:", e);
    const fallbackUpdate: Record<string, any> = {
      status: "assessed",
      emotionProfile: emotionResult.profile,
    };
    if (Object.keys(fastinoEntities).length > 0) {
      const entitySummary = Object.entries(fastinoEntities)
        .filter(([_, vals]) => vals.length > 0)
        .map(([key, vals]) => `${key}: ${vals.join(", ")}`)
        .join("; ");
      if (entitySummary) {
        fallbackUpdate.notes = `Extracted entities: ${entitySummary}`;
      }
    }
    await storage.updateClient(activeCall.clientId, fallbackUpdate);
  }

  await storage.updateCall(callId, {
    status: "completed",
    endedAt: new Date(),
    transcript: fullTranscript,
    emotionData: emotionResult.emotions,
    sentimentScore: emotionResult.sentimentScore,
    summary,
  });

  try {
    await neo4jService.createCallNode(callId, activeCall.clientId, {
      status: "completed",
      sentimentScore: emotionResult.sentimentScore,
    });
  } catch (e) {
    console.warn("Neo4j call node creation failed:", e);
  }

  broadcastCallEvent(callId, activeCall.clientId, "call_ended", {
    status: "completed",
    summary,
    emotionProfile: emotionResult.profile,
  });

  callState.removeActiveCall(callId);
}

