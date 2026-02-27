import type { Client, HousingProgram } from "@shared/schema";
import * as fs from "fs";

const PIONEER_API_URL = "https://api.pioneer.ai";

let trainedModelId: string | null = null;

const MODEL_CONFIG_PATH = "/tmp/haven-active-model.json";

function loadPersistedModelId(): string | null {
  try {
    if (fs.existsSync(MODEL_CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(MODEL_CONFIG_PATH, "utf8"));
      return data.modelId || null;
    }
  } catch (e) {}
  return null;
}

function persistModelId(modelId: string | null) {
  try {
    fs.writeFileSync(MODEL_CONFIG_PATH, JSON.stringify({ modelId }));
  } catch (e) {
    console.warn("Could not persist model ID:", e);
  }
}

trainedModelId = loadPersistedModelId();

function getApiKey(): string {
  const key = process.env.FASTINO_API_KEY;
  if (!key) throw new Error("FASTINO_API_KEY not configured");
  return key;
}

async function pioneerRequest(path: string, body: any, method: string = "POST"): Promise<any> {
  const response = await fetch(`${PIONEER_API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pioneer API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function pioneerGet(path: string): Promise<any> {
  const response = await fetch(`${PIONEER_API_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pioneer API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

function buildNERTrainingData(): Array<{ text: string; entities: Array<{ start: number; end: number; label: string }> }> {
  return [
    {
      text: "I've been homeless for about 3 months now. I lost my job at the warehouse in downtown Portland and couldn't pay rent anymore.",
      entities: [
        { start: 57, end: 60, label: "employment_detail" },
        { start: 68, end: 77, label: "employment_detail" },
        { start: 81, end: 99, label: "location_preference" },
      ]
    },
    {
      text: "I'm a veteran who served in Iraq. I have PTSD and need mental health services. My wife and two kids are staying with family right now.",
      entities: [
        { start: 6, end: 13, label: "document_type" },
        { start: 40, end: 44, label: "health_condition" },
        { start: 54, end: 76, label: "service_need" },
        { start: 81, end: 85, label: "family_situation" },
        { start: 90, end: 98, label: "family_situation" },
      ]
    },
    {
      text: "I need emergency shelter tonight. I've been sleeping in my car for two weeks near the freeway overpass.",
      entities: [
        { start: 7, end: 24, label: "housing_need" },
        { start: 26, end: 33, label: "urgency_indicator" },
        { start: 55, end: 61, label: "location_preference" },
        { start: 81, end: 99, label: "location_preference" },
      ]
    },
    {
      text: "I'm diabetic and I need insulin regularly. I also have high blood pressure. I'm looking for a place in the Seattle area.",
      entities: [
        { start: 4, end: 12, label: "health_condition" },
        { start: 24, end: 31, label: "service_need" },
        { start: 55, end: 74, label: "health_condition" },
        { start: 102, end: 114, label: "location_preference" },
      ]
    },
    {
      text: "I have my birth certificate and social security card but no photo ID. I was working part-time at McDonald's until last month.",
      entities: [
        { start: 10, end: 27, label: "document_type" },
        { start: 32, end: 52, label: "document_type" },
        { start: 60, end: 68, label: "document_type" },
        { start: 78, end: 87, label: "employment_detail" },
        { start: 91, end: 101, label: "employment_detail" },
      ]
    },
    {
      text: "I'm 62 years old and disabled. I get SSI benefits of $800 a month. I need permanent supportive housing with wheelchair access.",
      entities: [
        { start: 21, end: 29, label: "health_condition" },
        { start: 36, end: 48, label: "employment_detail" },
        { start: 68, end: 97, label: "housing_need" },
        { start: 103, end: 121, label: "service_need" },
      ]
    },
    {
      text: "I just got out of jail last week and have nowhere to go. I need transitional housing and help finding a job.",
      entities: [
        { start: 17, end: 21, label: "urgency_indicator" },
        { start: 63, end: 83, label: "housing_need" },
        { start: 92, end: 107, label: "service_need" },
      ]
    },
    {
      text: "My landlord evicted me because I couldn't afford the rent increase. I have three children under 10 and we're staying at the women's shelter.",
      entities: [
        { start: 13, end: 20, label: "urgency_indicator" },
        { start: 78, end: 92, label: "family_situation" },
        { start: 117, end: 132, label: "location_preference" },
      ]
    },
    {
      text: "I'm a single mother with a 5-year-old. I work at Walmart making $15 an hour but it's not enough for rent in this city.",
      entities: [
        { start: 6, end: 19, label: "family_situation" },
        { start: 27, end: 37, label: "family_situation" },
        { start: 45, end: 56, label: "employment_detail" },
        { start: 64, end: 77, label: "employment_detail" },
      ]
    },
    {
      text: "I need rapid rehousing assistance. I have a voucher from HUD but can't find a landlord who will accept it in the Denver metro area.",
      entities: [
        { start: 7, end: 25, label: "housing_need" },
        { start: 47, end: 54, label: "document_type" },
        { start: 60, end: 63, label: "document_type" },
        { start: 111, end: 127, label: "location_preference" },
      ]
    },
    {
      text: "I'm fleeing domestic violence. My husband was abusive and I had to leave with just the clothes on my back. I need safe housing immediately.",
      entities: [
        { start: 13, end: 30, label: "urgency_indicator" },
        { start: 35, end: 42, label: "family_situation" },
        { start: 112, end: 124, label: "housing_need" },
        { start: 125, end: 136, label: "urgency_indicator" },
      ]
    },
    {
      text: "I suffer from schizophrenia and bipolar disorder. I need medication management and a group home or assisted living facility.",
      entities: [
        { start: 14, end: 27, label: "health_condition" },
        { start: 32, end: 48, label: "health_condition" },
        { start: 57, end: 80, label: "service_need" },
        { start: 87, end: 97, label: "housing_need" },
        { start: 101, end: 124, label: "housing_need" },
      ]
    },
    {
      text: "I have my DD-214 discharge papers from the military. I need VA housing assistance in the Phoenix area.",
      entities: [
        { start: 10, end: 16, label: "document_type" },
        { start: 17, end: 34, label: "document_type" },
        { start: 59, end: 80, label: "housing_need" },
        { start: 88, end: 100, label: "location_preference" },
      ]
    },
    {
      text: "I'm recovering from substance abuse and just completed a 30-day rehab program. I need sober living housing near public transit.",
      entities: [
        { start: 21, end: 36, label: "health_condition" },
        { start: 57, end: 77, label: "service_need" },
        { start: 86, end: 106, label: "housing_need" },
        { start: 112, end: 126, label: "service_need" },
      ]
    },
    {
      text: "I lost everything in the fire. I have my driver's license and proof of income from disability payments. I need help finding affordable housing.",
      entities: [
        { start: 26, end: 30, label: "urgency_indicator" },
        { start: 41, end: 57, label: "document_type" },
        { start: 62, end: 77, label: "document_type" },
        { start: 83, end: 103, label: "employment_detail" },
        { start: 126, end: 144, label: "housing_need" },
      ]
    },
    {
      text: "I'm pregnant and due in 2 months. I need prenatal care and a stable place to live before the baby comes. I'm currently in a tent near the river.",
      entities: [
        { start: 4, end: 12, label: "health_condition" },
        { start: 40, end: 53, label: "service_need" },
        { start: 60, end: 81, label: "housing_need" },
        { start: 122, end: 126, label: "location_preference" },
        { start: 136, end: 141, label: "location_preference" },
      ]
    },
    {
      text: "I'm an undocumented immigrant and I'm afraid to go to a shelter. I work day labor construction jobs and need housing that doesn't require a background check.",
      entities: [
        { start: 6, end: 29, label: "document_type" },
        { start: 55, end: 62, label: "location_preference" },
        { start: 69, end: 78, label: "employment_detail" },
        { start: 79, end: 96, label: "employment_detail" },
        { start: 106, end: 113, label: "housing_need" },
      ]
    },
    {
      text: "My son is 17 and we've been couch surfing for months. He's about to age out of the system. We need family housing in the Chicago suburbs.",
      entities: [
        { start: 3, end: 6, label: "family_situation" },
        { start: 36, end: 50, label: "location_preference" },
        { start: 96, end: 110, label: "housing_need" },
        { start: 118, end: 134, label: "location_preference" },
      ]
    },
    {
      text: "I receive food stamps and Medicaid. I need case management services and help applying for Section 8 housing vouchers in this county.",
      entities: [
        { start: 10, end: 21, label: "document_type" },
        { start: 26, end: 34, label: "document_type" },
        { start: 42, end: 68, label: "service_need" },
        { start: 88, end: 115, label: "housing_need" },
      ]
    },
    {
      text: "I was discharged from the hospital yesterday after a mental health crisis. I have no place to go and need immediate housing placement.",
      entities: [
        { start: 25, end: 33, label: "urgency_indicator" },
        { start: 55, end: 73, label: "health_condition" },
        { start: 96, end: 105, label: "urgency_indicator" },
        { start: 106, end: 123, label: "housing_need" },
      ]
    },
  ];
}

function buildClassificationTrainingData(): Array<{ text: string; label: string }> {
  return [
    { text: "Emergency shelter providing beds, meals, and basic necessities for individuals experiencing homelessness. Open 24/7 with no income requirements. Walk-ins welcome.", label: "highly_relevant" },
    { text: "Transitional housing program for veterans with substance abuse issues. 6-month program includes counseling, job training, and gradual transition to permanent housing.", label: "highly_relevant" },
    { text: "Permanent supportive housing for individuals with chronic disabilities. Includes on-site case management, medication assistance, and life skills training.", label: "highly_relevant" },
    { text: "Rapid rehousing program providing rental assistance and move-in costs. Helps families transition from shelters to permanent housing within 90 days.", label: "highly_relevant" },
    { text: "Women's shelter providing safe housing for survivors of domestic violence. Includes counseling, legal advocacy, and children's programs.", label: "highly_relevant" },
    { text: "Family housing program requiring proof of income and employment. Must earn between 30-60% of area median income. Background check required.", label: "moderately_relevant" },
    { text: "Senior living community for adults 55 and older. Amenities include fitness center, pool, and social activities. Monthly rent starts at $1,200.", label: "slightly_relevant" },
    { text: "Luxury apartment complex in downtown area. Studio units starting at $2,500/month. No assistance programs accepted. Credit score 700+ required.", label: "not_relevant" },
    { text: "Commercial office space for lease. 5,000 sq ft available in business district. Zoned for commercial use only.", label: "not_relevant" },
    { text: "Affordable housing lottery for low-income families. Section 8 vouchers accepted. Must provide documentation of income, family size, and residency.", label: "highly_relevant" },
    { text: "Youth shelter for ages 18-24 experiencing homelessness. No ID required for first night. Connects residents with education and employment resources.", label: "highly_relevant" },
    { text: "Sober living facility with shared rooms. Requires 30 days of sobriety and participation in recovery program. Sliding scale fees.", label: "moderately_relevant" },
    { text: "Market-rate townhomes in suburban community. Three bedrooms, two baths. HOA fees $300/month. Mortgage pre-approval required.", label: "not_relevant" },
    { text: "Hotel offering weekly rates for extended stays. No credit check. $350/week includes utilities and WiFi.", label: "slightly_relevant" },
    { text: "HUD-funded housing project accepting applications for 1-3 bedroom units. Income-restricted to below 50% AMI. Waitlist currently 6 months.", label: "highly_relevant" },
    { text: "Group home for adults with developmental disabilities. 24-hour staff support. Medicaid accepted. Structured daily programming.", label: "moderately_relevant" },
    { text: "Vacation rental cabin in mountain resort area. Sleeps 6. Available for short-term stays only. $250/night minimum.", label: "not_relevant" },
    { text: "Warming center open during winter months. Hot meals and blankets provided. No intake process required. Open 6pm to 8am.", label: "highly_relevant" },
    { text: "Student housing near university campus. Must be enrolled full-time. Shared rooms $600/month. Academic year lease only.", label: "not_relevant" },
    { text: "Faith-based transitional housing. 90-day program with chapel services. Provides meals, clothing, and job placement assistance.", label: "moderately_relevant" },
  ];
}

export async function getOrCreateTrainingDataset(): Promise<{ id: string; name: string }> {
  try {
    const datasets = await pioneerGet("/felix/datasets");
    const existing = (datasets.datasets || datasets).find?.((d: any) =>
      (d.name?.startsWith("haven-housing-ner") || d.dataset_name?.startsWith("haven-housing-ner")) &&
      d.dataset_type === "ner" &&
      d.status === "ready"
    );
    if (existing) {
      const dsName = existing.dataset_name || existing.name;
      console.log("Found existing ready NER dataset:", existing.id, "name:", dsName);
      return { id: existing.id || existing.dataset_id, name: dsName };
    }
  } catch (e) {
    console.warn("Could not list datasets:", e);
  }

  console.log("Creating NER training dataset...");
  const trainingData = buildNERTrainingData();

  const jsonlContent = trainingData.map(item => JSON.stringify({
    text: item.text,
    entities: item.entities.map(e => [
      item.text.substring(e.start, e.end),
      e.label,
    ]),
  })).join("\n");

  const version = Date.now();
  const datasetName = `haven-housing-ner-${version}`;
  const uploadUrlResponse = await pioneerRequest("/felix/datasets/upload/url", {
    dataset_name: datasetName,
    dataset_type: "ner",
    format: "jsonl",
    filename: `${datasetName}.jsonl`,
    type: "training",
  });

  const presignedUrl = uploadUrlResponse.upload_url || uploadUrlResponse.presigned_url;
  const datasetId = uploadUrlResponse.dataset_id;

  if (!presignedUrl) {
    throw new Error("No presigned URL returned: " + JSON.stringify(uploadUrlResponse));
  }

  const uploadResponse = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: jsonlContent,
  });

  if (!uploadResponse.ok) {
    throw new Error(`S3 upload failed: ${uploadResponse.status}`);
  }

  await pioneerRequest("/felix/datasets/upload/process", {
    dataset_id: datasetId,
  });

  console.log("NER Dataset created:", datasetId, "name:", datasetName);
  return { id: datasetId, name: datasetName };
}

export async function getOrCreateClassificationDataset(): Promise<{ id: string; name: string }> {
  try {
    const datasets = await pioneerGet("/felix/datasets");
    const existing = (datasets.datasets || datasets).find?.((d: any) =>
      (d.name?.startsWith("haven-housing-relevance") || d.dataset_name?.startsWith("haven-housing-relevance")) &&
      d.dataset_type === "classification" &&
      d.status === "ready"
    );
    if (existing) {
      const dsName = existing.dataset_name || existing.name;
      console.log("Found existing classification dataset:", existing.id, "name:", dsName);
      return { id: existing.id || existing.dataset_id, name: dsName };
    }
  } catch (e) {
    console.warn("Could not list datasets:", e);
  }

  console.log("Creating classification training dataset...");
  const trainingData = buildClassificationTrainingData();

  const jsonlContent = trainingData.map(item => JSON.stringify({
    text: item.text,
    label: item.label,
  })).join("\n");

  const classVersion = Date.now();
  const classDatasetName = `haven-housing-relevance-${classVersion}`;
  const uploadUrlResponse = await pioneerRequest("/felix/datasets/upload/url", {
    dataset_name: classDatasetName,
    dataset_type: "classification",
    format: "jsonl",
    filename: `${classDatasetName}.jsonl`,
    type: "training",
  });

  const presignedUrl = uploadUrlResponse.upload_url || uploadUrlResponse.presigned_url;
  const datasetId = uploadUrlResponse.dataset_id;

  if (!presignedUrl) throw new Error("No presigned URL: " + JSON.stringify(uploadUrlResponse));

  await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: jsonlContent,
  });

  await pioneerRequest("/felix/datasets/upload/process", { dataset_id: datasetId });
  console.log("Classification dataset created:", datasetId, "name:", classDatasetName);
  return { id: datasetId, name: classDatasetName };
}

export async function trainModel(datasetName: string, modelName: string): Promise<string> {
  const response = await pioneerRequest("/felix/training-jobs", {
    model_name: modelName,
    datasets: [{ name: datasetName }],
    auto_select_model: true,
    nr_epochs: 5,
    training_type: "full",
    validation_data_percentage: 0.2,
  });

  const jobId = response.job_id || response.id;
  console.log("Training job started:", jobId);
  return jobId;
}

export async function getTrainingJobStatus(jobId: string): Promise<any> {
  return await pioneerGet(`/felix/training-jobs/${jobId}`);
}

export async function listTrainingJobs(): Promise<any[]> {
  const response = await pioneerGet("/felix/training-jobs");
  return response.training_jobs || response.jobs || response || [];
}

export async function listDatasets(): Promise<any[]> {
  const response = await pioneerGet("/felix/datasets");
  return response.datasets || response || [];
}

export async function setActiveModel(jobId: string | null) {
  trainedModelId = jobId;
  persistModelId(jobId);
  console.log("Active model set to:", jobId || "base (GLiNER-2)");
}

export function getActiveModelId(): string | null {
  return trainedModelId;
}

async function runInference(task: string, text: string, schema: any): Promise<any> {
  const modelId = trainedModelId;

  if (modelId) {
    try {
      const result = await pioneerRequest("/inference", {
        model_id: modelId,
        task,
        text: text.substring(0, 8000),
        schema,
      });
      console.log(`[Fastino] Custom model inference (${task}) via /inference with model ${modelId}`);
      return result;
    } catch (e: any) {
      console.warn(`[Fastino] Custom model inference failed, falling back to base: ${e.message}`);
    }
  }

  const result = await pioneerRequest("/gliner-2", {
    task,
    text: text.substring(0, 8000),
    schema,
  });
  console.log(`[Fastino] Base model inference (${task}) via /gliner-2`);
  return result;
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
    const data = await runInference("extract_json", text, {
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
      organization: "", location: "", address: "", phone: "",
      programType: "general_assistance", services: [], requirements: [], eligibilityDetails: [],
    };
  }
}

export async function extractClientEntities(text: string): Promise<Record<string, string[]>> {
  try {
    const data = await runInference("extract_entities", text, [
      "housing_need",
      "location_preference",
      "health_condition",
      "employment_detail",
      "family_situation",
      "document_type",
      "urgency_indicator",
      "service_need",
    ]);

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

    const data = await runInference("classify_text", combinedText, {
      categories: [
        "highly_relevant",
        "moderately_relevant",
        "slightly_relevant",
        "not_relevant",
      ],
    });

    const category = data.result?.category || "not_relevant";
    const scoreMap: Record<string, number> = {
      highly_relevant: 0.95,
      moderately_relevant: 0.7,
      slightly_relevant: 0.4,
      not_relevant: 0.1,
    };

    return { category, score: scoreMap[category] || 0.5 };
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
      factor: "AI Relevance Match (Fastino GLiNER)",
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

    const modelInfo = trainedModelId ? `Assessed using custom Fastino model (${trainedModelId}).` : "Assessed using Fastino GLiNER-2 base model.";
    recommendation = `${modelInfo} ${recommendation}`;

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
  if (normalizedScore >= 0.7) recommendation = "Strongly recommended. Client meets most eligibility criteria.";
  else if (normalizedScore >= 0.5) recommendation = "Likely eligible. Some documentation may need to be gathered.";
  else if (normalizedScore >= 0.3) recommendation = "Partial match. Client may qualify with additional documentation.";
  else recommendation = "Low match. Consider alternative programs that better fit client's profile.";

  if (missingDocuments.length > 0) recommendation += ` Missing: ${missingDocuments.join(", ")}.`;

  return { eligible, score: Math.round(normalizedScore * 100) / 100, factors, missingDocuments, recommendation };
}
