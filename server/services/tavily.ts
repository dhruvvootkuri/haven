import type { Client } from "@shared/schema";
import {
  classifyRelevance,
  extractHousingProgramData,
  buildClientContext,
  type ExtractedProgramData,
  type RelevanceScore,
} from "./fastino";

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface ScoredHousingResult {
  name: string;
  provider: string;
  description: string;
  url: string;
  location: string;
  programType: string;
  relevanceScore: number;
  requirements: string;
  contactInfo: string;
  fastinoRelevance: RelevanceScore | null;
  extractedData: ExtractedProgramData | null;
  tavilyScore: number;
}

export async function searchHousingPrograms(client: Client): Promise<ScoredHousingResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");

  const searchTerms: string[] = [];
  if (client.location) searchTerms.push(client.location);
  if (client.veteranStatus) searchTerms.push("veteran");
  if (client.hasDisability) searchTerms.push("disability accessible");
  if (client.hasDependents) searchTerms.push("family");

  const query = `homeless housing assistance programs ${searchTerms.join(" ")} shelter transitional housing apply`;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 8,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.statusText}`);
  }

  const data = await response.json();
  const results: TavilySearchResult[] = data.results || [];

  const clientContext = buildClientContext(client);
  const hasFastinoKey = !!process.env.FASTINO_API_KEY;

  const scoredResults = await Promise.all(
    results.map(async (r) => {
      const combinedText = `${r.title}. ${r.content}`;
      let fastinoRelevance: RelevanceScore | null = null;
      let extractedData: ExtractedProgramData | null = null;

      if (hasFastinoKey) {
        try {
          const [relevance, extracted] = await Promise.all([
            classifyRelevance(combinedText, clientContext),
            extractHousingProgramData(combinedText),
          ]);
          fastinoRelevance = relevance;
          extractedData = extracted;
        } catch (error) {
          console.warn("Fastino scoring failed for result:", r.title, error);
        }
      }

      const tavilyScore = r.score;
      const fastinoScore = fastinoRelevance?.score ?? 0.5;
      const combinedScore = hasFastinoKey && fastinoRelevance
        ? fastinoScore * 0.6 + tavilyScore * 0.4
        : tavilyScore;

      return {
        name: extractedData?.organization || r.title.substring(0, 120),
        provider: extractProvider(r.url),
        description: r.content.substring(0, 500),
        url: r.url,
        location: extractedData?.location || client.location || "Unknown",
        programType: extractedData?.programType || detectProgramType(combinedText),
        relevanceScore: Math.round(combinedScore * 100) / 100,
        requirements: extractedData?.requirements?.join(", ") || extractRequirements(r.content),
        contactInfo: extractedData?.phone || extractContact(r.content),
        fastinoRelevance,
        extractedData,
        tavilyScore,
      };
    })
  );

  scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scoredResults;
}

function detectProgramType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("emergency") || lower.includes("shelter")) return "emergency_shelter";
  if (lower.includes("transitional")) return "transitional_housing";
  if (lower.includes("permanent") || lower.includes("supportive")) return "permanent_supportive";
  if (lower.includes("rapid re-housing") || lower.includes("rapid rehousing")) return "rapid_rehousing";
  if (lower.includes("voucher") || lower.includes("section 8")) return "housing_voucher";
  if (lower.includes("veteran") || lower.includes("va ")) return "veteran_housing";
  return "general_assistance";
}

function extractProvider(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    return hostname.split(".")[0].charAt(0).toUpperCase() + hostname.split(".")[0].slice(1);
  } catch {
    return "Unknown Provider";
  }
}

function extractRequirements(content: string): string {
  const lower = content.toLowerCase();
  const reqs: string[] = [];
  if (lower.includes("id") || lower.includes("identification")) reqs.push("Photo ID");
  if (lower.includes("income") || lower.includes("proof of income")) reqs.push("Proof of income");
  if (lower.includes("social security") || lower.includes("ssn")) reqs.push("SSN");
  if (lower.includes("background check")) reqs.push("Background check");
  if (lower.includes("referral")) reqs.push("Agency referral");
  return reqs.length > 0 ? reqs.join(", ") : "Contact for requirements";
}

function extractContact(content: string): string {
  const phoneMatch = content.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) return phoneMatch[0];
  const emailMatch = content.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) return emailMatch[0];
  return "See website for contact info";
}
