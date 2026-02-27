import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ConversationTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a compassionate housing intake specialist conducting a phone interview with someone experiencing homelessness or housing instability. Your goal is to gather the information needed to match them with appropriate housing programs.

You must gather the following information through natural, empathetic conversation:
1. Current living situation (shelter, street, couch surfing, car, etc.)
2. How long they've been without stable housing
3. Employment status and monthly income (if any)
4. Whether they have dependents (children/family members)
5. Veteran status
6. Any disabilities or health conditions
7. Whether they have identification documents (photo ID, SSN card, proof of income)
8. Their preferred location/area for housing
9. Any immediate safety concerns or urgency factors

Guidelines:
- Be warm, patient, and non-judgmental
- Ask one question at a time
- Acknowledge their responses before asking the next question
- If they share something emotional, validate their feelings briefly before continuing
- Keep responses concise (2-3 sentences max) since this is a phone call
- After gathering all key information (usually 8-12 turns), wrap up the call by thanking them and letting them know a caseworker will follow up
- When wrapping up, end your message with [CALL_COMPLETE] on its own line

IMPORTANT: You are speaking out loud on a phone call. Keep your language natural and conversational. Do not use bullet points, lists, or formatting.`;

export async function generateNextResponse(
  conversationHistory: ConversationTurn[],
  latestCallerText: string
): Promise<{ response: string; isComplete: boolean }> {
  const messages: ConversationTurn[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: "user", content: latestCallerText },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 300,
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content || "I appreciate you sharing that. Could you tell me a bit more?";

    const isComplete = responseText.includes("[CALL_COMPLETE]");
    const cleanedResponse = responseText.replace("[CALL_COMPLETE]", "").trim();

    return { response: cleanedResponse, isComplete };
  } catch (error) {
    console.error("LLM conversation error:", error);
    return {
      response: "Thank you for sharing that. Could you tell me a bit more about your situation?",
      isComplete: false,
    };
  }
}

export async function generateInitialGreeting(): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "[SYSTEM: Generate an opening greeting for the phone call. Be warm and brief.]" },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    return completion.choices[0]?.message?.content ||
      "Hello, thank you for calling Haven Housing Assistance. My name is Haven, and I'm here to help connect you with housing resources. Can you start by telling me about your current living situation?";
  } catch (error) {
    console.error("LLM greeting error:", error);
    return "Hello, thank you for calling Haven Housing Assistance. I'm here to help connect you with housing resources. Can you start by telling me about your current living situation?";
  }
}

export async function summarizeIntakeCall(conversationHistory: ConversationTurn[]): Promise<{
  summary: string;
  extractedData: Record<string, any>;
}> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Analyze this housing intake call transcript and extract structured information. Respond in JSON format with these fields:
{
  "summary": "Brief 2-3 sentence summary of the call",
  "livingSituation": "string or null",
  "employmentStatus": "employed/unemployed/part-time or null",
  "monthlyIncome": "number or null",
  "hasDependents": "boolean or null",
  "dependentCount": "number or null",
  "veteranStatus": "boolean or null",
  "hasDisability": "boolean or null",
  "hasId": "boolean or null",
  "hasSsn": "boolean or null",
  "hasProofOfIncome": "boolean or null",
  "preferredLocation": "string or null",
  "urgencyLevel": "low/medium/high/critical",
  "notes": "any additional relevant details"
}`
        },
        ...conversationHistory,
      ],
      max_tokens: 500,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || "Call completed",
      extractedData: parsed,
    };
  } catch (error) {
    console.error("LLM summary error:", error);
    return {
      summary: "Call completed - manual review needed",
      extractedData: {},
    };
  }
}
