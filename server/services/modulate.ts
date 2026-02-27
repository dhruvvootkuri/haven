import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface EmotionAnalysis {
  timestamp: number;
  emotion: string;
  confidence: number;
  text: string;
}

export interface EmotionProfile {
  [emotion: string]: number;
}

export async function analyzeEmotions(transcript: string): Promise<{
  emotions: EmotionAnalysis[];
  profile: EmotionProfile;
  sentimentScore: number;
}> {
  const modulateApiKey = process.env.MODULATE_API_KEY;
  if (modulateApiKey) {
    try {
      const response = await fetch("https://api.modulate.ai/v1/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${modulateApiKey}`,
        },
        body: JSON.stringify({
          text: transcript,
          features: ["emotion", "sentiment"],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          emotions: data.emotions || [],
          profile: data.profile || {},
          sentimentScore: data.sentiment_score || 0,
        };
      }
    } catch (error) {
    }
  }

  return llmEmotionAnalysis(transcript);
}

async function llmEmotionAnalysis(transcript: string): Promise<{
  emotions: EmotionAnalysis[];
  profile: EmotionProfile;
  sentimentScore: number;
}> {
  const segments = transcript.split(/[.!?]+/).filter(s => s.trim());
  if (segments.length === 0) {
    return { emotions: [{ timestamp: 0, emotion: "neutral", confidence: 0.5, text: transcript }], profile: { neutral: 1 }, sentimentScore: 0 };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an emotion analysis expert for a housing intake call with homeless individuals. Analyze the emotional tone of each sentence segment provided.

For each segment, classify the primary emotion as ONE of:
- anxiety (worried, scared, fearful, nervous)
- sadness (depressed, hopeless, grieving, lonely)
- frustration (angry, annoyed, fed up, exhausted)
- hope (optimistic, looking forward, encouraged)
- urgency (desperate, immediate need, time-critical, crisis)
- gratitude (thankful, appreciative, relieved)
- neutral (calm, matter-of-fact, informational)

Consider the CONTEXT of a homeless person in an intake call. "I'm doing pretty good" is neutral/hope, not urgency. "I need a place tonight" is urgency. "Thank you for helping" is gratitude.

Respond with a JSON object: {"segments": [{"emotion": "string", "confidence": 0.0-1.0}, ...]}
The segments array length must equal the number of input segments.`
        },
        {
          role: "user",
          content: `Segments to analyze:\n${segments.map((s, i) => `${i + 1}. "${s.trim()}"`).join("\n")}`
        }
      ],
      max_tokens: 300,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return simpleKeywordFallback(transcript, segments);
    }

    let results: any[] = [];
    if (Array.isArray(parsed)) {
      results = parsed;
    } else {
      const firstArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      results = firstArrayKey ? parsed[firstArrayKey] : [];
    }
    const emotions: EmotionAnalysis[] = [];
    const profile: EmotionProfile = {};
    let sentimentTotal = 0;

    for (let i = 0; i < segments.length; i++) {
      const result = results[i] || { emotion: "neutral", confidence: 0.5 };
      const emotion = result.emotion || "neutral";
      const confidence = Math.min(Math.max(result.confidence || 0.6, 0.3), 0.95);

      emotions.push({
        timestamp: i,
        emotion,
        confidence,
        text: segments[i].trim(),
      });

      profile[emotion] = (profile[emotion] || 0) + 1;

      if (["hope", "gratitude"].includes(emotion)) sentimentTotal += 0.3;
      else if (["anxiety", "sadness", "frustration", "urgency"].includes(emotion)) sentimentTotal -= 0.2;
    }

    const totalEmotions = Object.values(profile).reduce((a, b) => a + b, 0) || 1;
    for (const key of Object.keys(profile)) {
      profile[key] = Math.round((profile[key] / totalEmotions) * 100) / 100;
    }

    return {
      emotions,
      profile,
      sentimentScore: Math.max(-1, Math.min(1, sentimentTotal / segments.length)),
    };
  } catch (error) {
    console.warn("LLM emotion analysis failed, using simple fallback:", error);
    return simpleKeywordFallback(transcript, segments);
  }
}

function simpleKeywordFallback(transcript: string, segments: string[]) {
  const emotionPatterns: Record<string, RegExp> = {
    anxiety: /\b(worried|scared|afraid|nervous|anxious|fear|panic|stress|terrif)/i,
    sadness: /\b(sad|depressed|hopeless|lost everything|alone|lonely|cry|miss|devastat)/i,
    frustration: /\b(frustrated|angry|mad|unfair|tired of|sick of|annoyed|can't believe)/i,
    hope: /\b(hope|better|improving|looking forward|wish|dream|opportunity|optimist|good|great|fine|okay|alright)/i,
    urgency: /\b(tonight|emergency|desperate|asap|right now|immediately|kicked out|evicted|no where|nowhere)/i,
    gratitude: /\b(thank|grateful|appreciate|kind|blessing|relief)/i,
  };

  const emotions: EmotionAnalysis[] = [];
  const profile: EmotionProfile = {};
  let sentimentTotal = 0;

  segments.forEach((segment, i) => {
    let detected = "neutral";
    for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
      if (pattern.test(segment)) {
        detected = emotion;
        break;
      }
    }

    emotions.push({
      timestamp: i,
      emotion: detected,
      confidence: detected === "neutral" ? 0.5 : 0.6,
      text: segment.trim(),
    });

    profile[detected] = (profile[detected] || 0) + 1;

    if (["hope", "gratitude"].includes(detected)) sentimentTotal += 0.3;
    else if (["anxiety", "sadness", "frustration", "urgency"].includes(detected)) sentimentTotal -= 0.2;
  });

  const totalEmotions = Object.values(profile).reduce((a, b) => a + b, 0) || 1;
  for (const key of Object.keys(profile)) {
    profile[key] = Math.round((profile[key] / totalEmotions) * 100) / 100;
  }

  return {
    emotions,
    profile,
    sentimentScore: Math.max(-1, Math.min(1, sentimentTotal / segments.length)),
  };
}
