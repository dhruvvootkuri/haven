import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  age: integer("age"),
  gender: text("gender"),
  location: text("location"),
  veteranStatus: boolean("veteran_status").default(false),
  hasDisability: boolean("has_disability").default(false),
  hasDependents: boolean("has_dependents").default(false),
  dependentCount: integer("dependent_count").default(0),
  employmentStatus: text("employment_status"),
  monthlyIncome: real("monthly_income"),
  hasId: boolean("has_id").default(false),
  hasSsn: boolean("has_ssn").default(false),
  hasProofOfIncome: boolean("has_proof_of_income").default(false),
  urgencyLevel: text("urgency_level").default("medium"),
  notes: text("notes"),
  status: text("status").default("new"),
  emotionProfile: jsonb("emotion_profile").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  twilioCallSid: text("twilio_call_sid"),
  status: text("status").default("pending"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  duration: integer("duration"),
  transcript: text("transcript"),
  emotionData: jsonb("emotion_data").$type<Array<{ timestamp: number; emotion: string; confidence: number; text: string }>>(),
  sentimentScore: real("sentiment_score"),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const housingPrograms = pgTable("housing_programs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  provider: text("provider"),
  description: text("description"),
  url: text("url"),
  location: text("location"),
  programType: text("program_type"),
  relevanceScore: real("relevance_score"),
  requirements: text("requirements"),
  contactInfo: text("contact_info"),
  openSlots: integer("open_slots"),
  deadline: text("deadline"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const eligibilityAssessments = pgTable("eligibility_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  programId: varchar("program_id").references(() => housingPrograms.id),
  eligible: boolean("eligible"),
  score: real("score"),
  factors: jsonb("factors").$type<Array<{ factor: string; met: boolean; weight: number }>>(),
  missingDocuments: text("missing_documents").array(),
  recommendation: text("recommendation"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const applications = pgTable("applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  programId: varchar("program_id").notNull().references(() => housingPrograms.id),
  status: text("status").default("pending"),
  submittedAt: timestamp("submitted_at"),
  yutoriTaskId: text("yutori_task_id"),
  responseData: jsonb("response_data"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertCallSchema = createInsertSchema(calls).omit({ id: true, createdAt: true });
export const insertHousingProgramSchema = createInsertSchema(housingPrograms).omit({ id: true, createdAt: true });
export const insertEligibilitySchema = createInsertSchema(eligibilityAssessments).omit({ id: true, createdAt: true });
export const insertApplicationSchema = createInsertSchema(applications).omit({ id: true, createdAt: true });

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;
export type InsertHousingProgram = z.infer<typeof insertHousingProgramSchema>;
export type HousingProgram = typeof housingPrograms.$inferSelect;
export type InsertEligibility = z.infer<typeof insertEligibilitySchema>;
export type EligibilityAssessment = typeof eligibilityAssessments.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applications.$inferSelect;
