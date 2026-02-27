interface ConversationTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ActiveCall {
  callId: string;
  clientId: string;
  twilioCallSid: string;
  conversationHistory: ConversationTurn[];
  transcriptSegments: Array<{
    speaker: "caller" | "agent";
    text: string;
    emotion: string;
    confidence: number;
    timestamp: number;
    turnIndex: number;
  }>;
  turnIndex: number;
  startedAt: number;
}

const activeCalls = new Map<string, ActiveCall>();
const callSidToCallId = new Map<string, string>();

export function createActiveCall(callId: string, clientId: string, twilioCallSid: string): ActiveCall {
  const call: ActiveCall = {
    callId,
    clientId,
    twilioCallSid,
    conversationHistory: [],
    transcriptSegments: [],
    turnIndex: 0,
    startedAt: Date.now(),
  };
  activeCalls.set(callId, call);
  callSidToCallId.set(twilioCallSid, callId);
  return call;
}

export function getActiveCall(callId: string): ActiveCall | undefined {
  return activeCalls.get(callId);
}

export function getActiveCallBySid(twilioCallSid: string): ActiveCall | undefined {
  const callId = callSidToCallId.get(twilioCallSid);
  if (!callId) return undefined;
  return activeCalls.get(callId);
}

export function getActiveCallByClientId(clientId: string): ActiveCall | undefined {
  for (const call of activeCalls.values()) {
    if (call.clientId === clientId) return call;
  }
  return undefined;
}

export function addConversationTurn(callId: string, role: "user" | "assistant", content: string) {
  const call = activeCalls.get(callId);
  if (!call) return;
  call.conversationHistory.push({ role, content });
}

export function addTranscriptSegment(
  callId: string,
  speaker: "caller" | "agent",
  text: string,
  emotion: string,
  confidence: number
) {
  const call = activeCalls.get(callId);
  if (!call) return;
  call.transcriptSegments.push({
    speaker,
    text,
    emotion,
    confidence,
    timestamp: Date.now(),
    turnIndex: call.turnIndex,
  });
  call.turnIndex++;
}

export function removeActiveCall(callId: string) {
  const call = activeCalls.get(callId);
  if (call) {
    callSidToCallId.delete(call.twilioCallSid);
    activeCalls.delete(callId);
  }
}

export function getFullTranscript(callId: string): string {
  const call = activeCalls.get(callId);
  if (!call) return "";
  return call.transcriptSegments
    .map(s => `${s.speaker === "caller" ? "Caller" : "Agent"}: ${s.text}`)
    .join("\n");
}

export function getAllActiveCalls(): ActiveCall[] {
  return Array.from(activeCalls.values());
}
