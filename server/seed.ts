import { db } from "./db";
import { clients, calls, housingPrograms, eligibilityAssessments } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  const existing = await db.select().from(clients);
  if (existing.length > 0) return;

  console.log("Seeding database with sample data...");

  const [maria] = await db.insert(clients).values({
    name: "Maria Gonzalez",
    phoneNumber: "+1 (555) 234-5678",
    age: 34,
    gender: "female",
    location: "Los Angeles, CA",
    veteranStatus: false,
    hasDisability: false,
    hasDependents: true,
    dependentCount: 2,
    employmentStatus: "part-time",
    monthlyIncome: 1200,
    hasId: true,
    hasSsn: true,
    hasProofOfIncome: true,
    urgencyLevel: "high",
    status: "assessed",
    notes: "Single mother with two children, ages 4 and 7. Currently staying at a friend's apartment but needs to find permanent housing within 30 days.",
    emotionProfile: { anxiety: 0.35, urgency: 0.3, hope: 0.2, sadness: 0.15 },
  }).returning();

  const [james] = await db.insert(clients).values({
    name: "James Mitchell",
    phoneNumber: "+1 (555) 345-6789",
    age: 52,
    gender: "male",
    location: "San Francisco, CA",
    veteranStatus: true,
    hasDisability: true,
    hasDependents: false,
    dependentCount: 0,
    employmentStatus: "unemployed",
    monthlyIncome: 0,
    hasId: false,
    hasSsn: false,
    hasProofOfIncome: false,
    urgencyLevel: "critical",
    status: "new",
    notes: "Vietnam-era veteran with PTSD. Has been sleeping in his car for 3 weeks. Needs immediate shelter and VA benefits assistance.",
  }).returning();

  const [priya] = await db.insert(clients).values({
    name: "Priya Sharma",
    phoneNumber: "+1 (555) 456-7890",
    age: 28,
    gender: "female",
    location: "Oakland, CA",
    veteranStatus: false,
    hasDisability: false,
    hasDependents: false,
    dependentCount: 0,
    employmentStatus: "full-time",
    monthlyIncome: 2800,
    hasId: true,
    hasSsn: true,
    hasProofOfIncome: true,
    urgencyLevel: "medium",
    status: "matched",
    notes: "Recently lost apartment due to landlord selling building. Employed but struggling to find affordable housing in the area.",
  }).returning();

  const [david] = await db.insert(clients).values({
    name: "David Thompson",
    phoneNumber: "+1 (555) 567-8901",
    age: 41,
    gender: "male",
    location: "San Jose, CA",
    veteranStatus: false,
    hasDisability: true,
    hasDependents: true,
    dependentCount: 1,
    employmentStatus: "disabled",
    monthlyIncome: 800,
    hasId: true,
    hasSsn: true,
    hasProofOfIncome: false,
    urgencyLevel: "high",
    status: "assessed",
    notes: "Physical disability from work injury. Has one teenage child. Receiving SSI but not enough for market-rate housing.",
    emotionProfile: { frustration: 0.3, anxiety: 0.25, hope: 0.2, urgency: 0.15, sadness: 0.1 },
  }).returning();

  await db.insert(calls).values({
    clientId: maria.id,
    twilioCallSid: "sim-seed-001",
    status: "completed",
    startedAt: new Date(Date.now() - 86400000 * 2),
    endedAt: new Date(Date.now() - 86400000 * 2 + 600000),
    duration: 600,
    transcript: "I'm really worried about my kids. We've been staying with a friend but she says we need to leave by the end of the month. I work part-time at a grocery store but I can't afford rent anywhere around here. I just need a safe place for my children. I have my ID and documents ready. I'm hoping someone can help us find a place before we run out of time.",
    emotionData: [
      { timestamp: 0, emotion: "anxiety", confidence: 0.85, text: "I'm really worried about my kids" },
      { timestamp: 1, emotion: "urgency", confidence: 0.78, text: "We need to leave by the end of the month" },
      { timestamp: 2, emotion: "frustration", confidence: 0.65, text: "I can't afford rent anywhere around here" },
      { timestamp: 3, emotion: "urgency", confidence: 0.82, text: "I just need a safe place for my children" },
      { timestamp: 4, emotion: "hope", confidence: 0.72, text: "I'm hoping someone can help us find a place" },
    ],
    sentimentScore: -0.15,
    summary: "Call completed. Detected primary emotions: anxiety (35%), urgency (30%), hope (20%)",
  });

  const [program1] = await db.insert(housingPrograms).values({
    clientId: maria.id,
    name: "LA Family Housing - Rapid Re-Housing",
    provider: "LA Family Housing",
    description: "Provides short-term rental assistance and support services to help families quickly exit homelessness and return to stable housing.",
    url: "https://lafh.org",
    location: "Los Angeles, CA",
    programType: "Rapid Re-Housing",
    relevanceScore: 0.92,
    requirements: "Photo ID, Proof of income",
    contactInfo: "(818) 982-4091",
  }).returning();

  const [program2] = await db.insert(housingPrograms).values({
    clientId: maria.id,
    name: "PATH - Permanent Supportive Housing",
    provider: "People Assisting The Homeless",
    description: "Long-term housing with wraparound services for families experiencing homelessness.",
    url: "https://epath.org",
    location: "Los Angeles, CA",
    programType: "Permanent Supportive Housing",
    relevanceScore: 0.85,
    requirements: "Photo ID, SSN, Background check",
    contactInfo: "(323) 644-2200",
  }).returning();

  await db.insert(eligibilityAssessments).values({
    clientId: maria.id,
    programId: program1.id,
    eligible: true,
    score: 0.88,
    factors: [
      { factor: "Has photo ID", met: true, weight: 0.15 },
      { factor: "Has SSN documentation", met: true, weight: 0.1 },
      { factor: "Has proof of income", met: true, weight: 0.1 },
      { factor: "Has dependents", met: true, weight: 0.2 },
      { factor: "High urgency need", met: true, weight: 0.15 },
      { factor: "Location match", met: true, weight: 0.1 },
    ],
    missingDocuments: [],
    recommendation: "Strongly recommended. Client meets most eligibility criteria.",
  });

  console.log("Database seeded with 4 sample clients.");
}
