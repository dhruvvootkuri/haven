import {
  type Client, type InsertClient,
  type Call, type InsertCall,
  type HousingProgram, type InsertHousingProgram,
  type EligibilityAssessment, type InsertEligibility,
  type Application, type InsertApplication,
  clients, calls, housingPrograms, eligibilityAssessments, applications
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined>;

  getCalls(clientId: string): Promise<Call[]>;
  getCall(id: string): Promise<Call | undefined>;
  createCall(call: InsertCall): Promise<Call>;
  updateCall(id: string, data: Partial<InsertCall>): Promise<Call | undefined>;

  getHousingPrograms(clientId: string): Promise<HousingProgram[]>;
  createHousingProgram(program: InsertHousingProgram): Promise<HousingProgram>;

  getEligibilityAssessments(clientId: string): Promise<EligibilityAssessment[]>;
  createEligibilityAssessment(assessment: InsertEligibility): Promise<EligibilityAssessment>;

  getApplications(clientId: string): Promise<Application[]>;
  createApplication(app: InsertApplication): Promise<Application>;
  updateApplication(id: string, data: Partial<InsertApplication>): Promise<Application | undefined>;

  getDashboardStats(): Promise<{ totalClients: number; activeCalls: number; totalPrograms: number; totalApplications: number }>;
}

export class DatabaseStorage implements IStorage {
  async getClients(): Promise<Client[]> {
    return db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients).set(data).where(eq(clients.id, id)).returning();
    return updated;
  }

  async getCalls(clientId: string): Promise<Call[]> {
    return db.select().from(calls).where(eq(calls.clientId, clientId)).orderBy(desc(calls.createdAt));
  }

  async getCall(id: string): Promise<Call | undefined> {
    const [call] = await db.select().from(calls).where(eq(calls.id, id));
    return call;
  }

  async createCall(call: InsertCall): Promise<Call> {
    const [created] = await db.insert(calls).values(call).returning();
    return created;
  }

  async updateCall(id: string, data: Partial<InsertCall>): Promise<Call | undefined> {
    const [updated] = await db.update(calls).set(data).where(eq(calls.id, id)).returning();
    return updated;
  }

  async getHousingPrograms(clientId: string): Promise<HousingProgram[]> {
    return db.select().from(housingPrograms).where(eq(housingPrograms.clientId, clientId)).orderBy(desc(housingPrograms.relevanceScore));
  }

  async createHousingProgram(program: InsertHousingProgram): Promise<HousingProgram> {
    const [created] = await db.insert(housingPrograms).values(program).returning();
    return created;
  }

  async getEligibilityAssessments(clientId: string): Promise<EligibilityAssessment[]> {
    return db.select().from(eligibilityAssessments).where(eq(eligibilityAssessments.clientId, clientId)).orderBy(desc(eligibilityAssessments.createdAt));
  }

  async createEligibilityAssessment(assessment: InsertEligibility): Promise<EligibilityAssessment> {
    const [created] = await db.insert(eligibilityAssessments).values(assessment).returning();
    return created;
  }

  async getApplications(clientId: string): Promise<Application[]> {
    return db.select().from(applications).where(eq(applications.clientId, clientId)).orderBy(desc(applications.createdAt));
  }

  async createApplication(app: InsertApplication): Promise<Application> {
    const [created] = await db.insert(applications).values(app).returning();
    return created;
  }

  async updateApplication(id: string, data: Partial<InsertApplication>): Promise<Application | undefined> {
    const [updated] = await db.update(applications).set(data).where(eq(applications.id, id)).returning();
    return updated;
  }

  async getDashboardStats() {
    const allClients = await db.select().from(clients);
    const allCalls = await db.select().from(calls);
    const allPrograms = await db.select().from(housingPrograms);
    const allApps = await db.select().from(applications);
    return {
      totalClients: allClients.length,
      activeCalls: allCalls.filter(c => c.status === "in-progress").length,
      totalPrograms: allPrograms.length,
      totalApplications: allApps.length,
    };
  }
}

export const storage = new DatabaseStorage();
