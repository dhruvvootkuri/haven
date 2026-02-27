import type { Client, HousingProgram } from "@shared/schema";

const FASTINO_API_URL = "https://api.pioneer.ai/gliner-2";

async function fastinoRequest(body: any): Promise<any> {
  const apiKey = process.env.FASTINO_API_KEY;
  if (!apiKey) throw new Error("FASTINO_API_KEY not configured");

  const response = await fetch(FASTINO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fastino API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export interface ExtractedProgramData {
  organization: string;
  location: string;
  address: string;
  phone: string;
  programType: string;
  services: string[];
  requirements: string[];
  eligibilityDetails: string[];
}

export async function extractHousingProgramData(text: string): Promise<ExtractedProgramData> {
  try {
    const data = await fastinoRequest({
      task: "extract_json",
      text: text.substring(0, 8000),
      schema: {
        housing_program: [
          "organization::str::Name of the housing organization or program",
          "location::str::City and state",
          "address::str::Street address if available",
          "phone::str::Contact phone number",
          "program_type::[emergency_shelter|transitional_housing|permanent_supportive|rapid_rehousing|housing_voucher|veteran_housing|family_housing|disability_housing|general_assistance]::str::Type of housing program",
          "services::list::Services and amenities offered",
          "requirements::list::Eligibility requirements and documentation needed",
          "eligibility_details::list::Specific eligibility criteria like income limits age requirements veteran status",
        ],
      },
    });

    const program = data.result?.housing_program?.[0] || {};
    return {
      organization: program.organization || "",
      location: program.location || "",
      address: program.address || "",
      phone: program.phone || "",
      programType: program.program_type || "general_assistance",
      services: program.services || [],
      requirements: program.requirements || [],
      eligibilityDetails: program.eligibility_details || [],
    };
  } catch (error) {
    console.warn("Fastino extraction failed:", error);
    return {
      organization: "",
      location: "",
      address: "",
      phone: "",
      programType: "general_assistance",
      services: [],
      requirements: [],
      eligibilityDetails: [],
    };
  }
}

export async function extractClientEntities(text: string): Promise<Record<string, string[]>> {
  try {
    const data = await fastinoRequest({
      task: "extract_entities",
      text: text.substring(0, 8000),
      schema: [
        "housing_need",
        "location_preference",
        "health_condition",
        "employment_detail",
        "family_situation",
        "document_type",
        "urgency_indicator",
        "service_need",
      ],
    });

    return data.result?.entities || {};
  } catch (error) {
    console.warn("Fastino entity extraction failed:", error);
    return {};
  }
}

export interface RelevanceScore {
  category: string;
  score: number;
}

export async function classifyRelevance(
  programText: string,
  clientContext: string
): Promise<RelevanceScore> {
  try {
    const combinedText = `Client needs: ${clientContext}\n\nProgram description: ${programText}`;

    const data = await fastinoRequest({
      task: "classify_text",
      text: combinedText.substring(0, 8000),
      schema: {
        categories: [
          "highly_relevant",
          "moderately_relevant",
          "slightly_relevant",
          "not_relevant",
        ],
      },
    });

    const category = data.result?.category || "not_relevant";
    const scoreMap: Record<string, number> = {
      highly_relevant: 0.95,
      moderately_relevant: 0.7,
      slightly_relevant: 0.4,
      not_relevant: 0.1,
    };

    return {
      category,
      score: scoreMap[category] || 0.5,
    };
  } catch (error) {
    console.warn("Fastino relevance classification failed:", error);
    return { category: "unknown", score: 0.5 };
  }
}

export async function classifyMultiDimensionalRelevance(
  programText: string,
  clientContext: string
): Promise<{
  overall: RelevanceScore;
  dimensions: Record<string, RelevanceScore>;
  extractedData: ExtractedProgramData;
  clientEntities: Record<string, string[]>;
}> {
  const [extractedData, clientEntities, overall] = await Promise.all([
    extractHousingProgramData(programText),
    extractClientEntities(clientContext),
    classifyRelevance(programText, clientContext),
  ]);

  const dimensions: Record<string, RelevanceScore> = {};

  const locationNeeds = clientEntities.location_preference || [];
  const programLocation = extractedData.location.toLowerCase();
  if (locationNeeds.length > 0 && locationNeeds.some(l => programLocation.includes(l.toLowerCase()))) {
    dimensions.location = { category: "highly_relevant", score: 0.95 };
  } else if (programLocation) {
    dimensions.location = { category: "moderately_relevant", score: 0.6 };
  } else {
    dimensions.location = { category: "slightly_relevant", score: 0.3 };
  }

  const urgencyIndicators = clientEntities.urgency_indicator || [];
  const isEmergency = extractedData.programType === "emergency_shelter";
  if (urgencyIndicators.length > 0 && isEmergency) {
    dimensions.urgency = { category: "highly_relevant", score: 0.95 };
  } else if (urgencyIndicators.length > 0 || isEmergency) {
    dimensions.urgency = { category: "moderately_relevant", score: 0.65 };
  } else {
    dimensions.urgency = { category: "slightly_relevant", score: 0.4 };
  }

  const serviceNeeds = clientEntities.service_need || [];
  const offeredServices = extractedData.services.map(s => s.toLowerCase());
  const matchedServices = serviceNeeds.filter(need =>
    offeredServices.some(svc => svc.includes(need.toLowerCase()) || need.toLowerCase().includes(svc))
  );
  if (matchedServices.length > 0) {
    dimensions.services = { category: "highly_relevant", score: 0.85 };
  } else if (offeredServices.length > 0) {
    dimensions.services = { category: "moderately_relevant", score: 0.55 };
  } else {
    dimensions.services = { category: "slightly_relevant", score: 0.3 };
  }

  return { overall, dimensions, extractedData, clientEntities };
}

export interface EligibilityResult {
  eligible: boolean;
  score: number;
  factors: Array<{ factor: string; met: boolean; weight: number }>;
  missingDocuments: string[];
  recommendation: string;
}

export async function classifyEligibility(
  client: Client,
  program: HousingProgram
): Promise<EligibilityResult> {
  const apiKey = process.env.FASTINO_API_KEY;
  if (!apiKey) {
    return fallbackClassifier(client, program);
  }

  try {
    const clientContext = buildClientContext(client);
    const programText = `${program.name}: ${program.description || ""}. Requirements: ${program.requirements || ""}. Type: ${program.programType || ""}. Location: ${program.location || ""}`;

    const [relevance, extractedData] = await Promise.all([
      classifyRelevance(programText, clientContext),
      extractHousingProgramData(programText),
    ]);

    const factors: Array<{ factor: string; met: boolean; weight: number }> = [];
    const missingDocuments: string[] = [];

    factors.push({
      factor: "AI Relevance Match",
      met: relevance.score >= 0.6,
      weight: 0.25,
    });

    factors.push({ factor: "Has photo ID", met: !!client.hasId, weight: 0.12 });
    if (!client.hasId) missingDocuments.push("Photo ID");

    factors.push({ factor: "Has SSN documentation", met: !!client.hasSsn, weight: 0.08 });
    if (!client.hasSsn) missingDocuments.push("Social Security documentation");

    factors.push({ factor: "Has proof of income", met: !!client.hasProofOfIncome, weight: 0.08 });
    if (!client.hasProofOfIncome) missingDocuments.push("Proof of income");

    const programType = (extractedData.programType || program.programType || "").toLowerCase();

    if (programType.includes("veteran")) {
      factors.push({ factor: "Veteran status required", met: !!client.veteranStatus, weight: 0.2 });
    }

    if (programType.includes("family") || programType.includes("dependent")) {
      factors.push({ factor: "Has dependents", met: !!client.hasDependents, weight: 0.15 });
    }

    if (programType.includes("disability") || programType.includes("supportive")) {
      factors.push({ factor: "Has disability", met: !!client.hasDisability, weight: 0.15 });
    }

    const urgencyMet = client.urgencyLevel === "high" || client.urgencyLevel === "critical";
    factors.push({ factor: "High urgency need", met: urgencyMet, weight: 0.12 });

    const locationMatch = client.location && program.location &&
      client.location.toLowerCase().includes(program.location.toLowerCase().split(",")[0]);
    factors.push({ factor: "Location match", met: !!locationMatch, weight: 0.1 });

    let totalScore = 0;
    let totalWeight = 0;
    for (const f of factors) {
      totalScore += f.met ? f.weight : 0;
      totalWeight += f.weight;
    }

    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;
    const eligible = normalizedScore >= 0.4;

    let recommendation = "";
    if (normalizedScore >= 0.7) {
      recommendation = "Strongly recommended. Client profile closely matches program criteria.";
    } else if (normalizedScore >= 0.5) {
      recommendation = "Likely eligible. Some documentation may need to be gathered.";
    } else if (normalizedScore >= 0.3) {
      recommendation = "Partial match. Client may qualify with additional documentation.";
    } else {
      recommendation = "Low match. Consider alternative programs that better fit client's profile.";
    }

    if (missingDocuments.length > 0) {
      recommendation += ` Missing: ${missingDocuments.join(", ")}.`;
    }

    return {
      eligible,
      score: Math.round(normalizedScore * 100) / 100,
      factors,
      missingDocuments,
      recommendation,
    };
  } catch (error) {
    console.warn("Fastino eligibility classification failed, using fallback:", error);
    return fallbackClassifier(client, program);
  }
}

export function buildClientContext(client: Client): string {
  const parts: string[] = [];

  if (client.location) parts.push(`Location: ${client.location}`);
  if (client.age) parts.push(`Age: ${client.age}`);
  if (client.gender) parts.push(`Gender: ${client.gender}`);
  if (client.veteranStatus) parts.push("Veteran");
  if (client.hasDisability) parts.push("Has disability");
  if (client.hasDependents) parts.push(`Has ${client.dependentCount || ""} dependent(s)`);
  if (client.employmentStatus) parts.push(`Employment: ${client.employmentStatus}`);
  if (client.monthlyIncome) parts.push(`Monthly income: $${client.monthlyIncome}`);
  if (client.urgencyLevel) parts.push(`Urgency: ${client.urgencyLevel}`);
  if (client.notes) parts.push(`Notes: ${client.notes}`);

  return parts.join(". ");
}

function fallbackClassifier(client: Client, program: HousingProgram): EligibilityResult {
  const factors: Array<{ factor: string; met: boolean; weight: number }> = [];
  const missingDocuments: string[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  factors.push({ factor: "Has photo ID", met: !!client.hasId, weight: 0.15 });
  if (!client.hasId) missingDocuments.push("Photo ID");
  totalScore += client.hasId ? 0.15 : 0;
  totalWeight += 0.15;

  factors.push({ factor: "Has SSN documentation", met: !!client.hasSsn, weight: 0.1 });
  if (!client.hasSsn) missingDocuments.push("Social Security documentation");
  totalScore += client.hasSsn ? 0.1 : 0;
  totalWeight += 0.1;

  factors.push({ factor: "Has proof of income", met: !!client.hasProofOfIncome, weight: 0.1 });
  if (!client.hasProofOfIncome) missingDocuments.push("Proof of income");
  totalScore += client.hasProofOfIncome ? 0.1 : 0;
  totalWeight += 0.1;

  const programType = (program.programType || "").toLowerCase();

  if (programType.includes("veteran")) {
    factors.push({ factor: "Veteran status required", met: !!client.veteranStatus, weight: 0.25 });
    totalScore += client.veteranStatus ? 0.25 : 0;
    totalWeight += 0.25;
  }

  if (programType.includes("family") || programType.includes("dependent")) {
    factors.push({ factor: "Has dependents", met: !!client.hasDependents, weight: 0.2 });
    totalScore += client.hasDependents ? 0.2 : 0;
    totalWeight += 0.2;
  }

  if (programType.includes("disability") || programType.includes("supportive")) {
    factors.push({ factor: "Has disability", met: !!client.hasDisability, weight: 0.2 });
    totalScore += client.hasDisability ? 0.2 : 0;
    totalWeight += 0.2;
  }

  const urgencyWeight = 0.15;
  const urgencyMet = client.urgencyLevel === "high" || client.urgencyLevel === "critical";
  factors.push({ factor: "High urgency need", met: urgencyMet, weight: urgencyWeight });
  totalScore += urgencyMet ? urgencyWeight : urgencyWeight * 0.3;
  totalWeight += urgencyWeight;

  const locationMatch = client.location && program.location &&
    client.location.toLowerCase().includes(program.location.toLowerCase().split(",")[0]);
  factors.push({ factor: "Location match", met: !!locationMatch, weight: 0.1 });
  totalScore += locationMatch ? 0.1 : 0.02;
  totalWeight += 0.1;

  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;
  const eligible = normalizedScore >= 0.4;

  let recommendation = "";
  if (normalizedScore >= 0.7) {
    recommendation = "Strongly recommended. Client meets most eligibility criteria.";
  } else if (normalizedScore >= 0.5) {
    recommendation = "Likely eligible. Some documentation may need to be gathered.";
  } else if (normalizedScore >= 0.3) {
    recommendation = "Partial match. Client may qualify with additional documentation.";
  } else {
    recommendation = "Low match. Consider alternative programs that better fit client's profile.";
  }

  if (missingDocuments.length > 0) {
    recommendation += ` Missing: ${missingDocuments.join(", ")}.`;
  }

  return {
    eligible,
    score: Math.round(normalizedScore * 100) / 100,
    factors,
    missingDocuments,
    recommendation,
  };
}
