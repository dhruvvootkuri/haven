import neo4j, { Driver } from "neo4j-driver";

let driver: Driver | null = null;

function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI;
    const username = process.env.NEO4J_USERNAME;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !username || !password) {
      throw new Error("Neo4j credentials not configured");
    }

    driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }
  return driver;
}

export async function createClientNode(clientId: string, name: string, data: Record<string, any>) {
  const session = getDriver().session();
  try {
    await session.run(
      `MERGE (c:Client {id: $id})
       SET c.name = $name, c.urgency = $urgency, c.status = $status, c.location = $location`,
      { id: clientId, name, urgency: data.urgencyLevel || "medium", status: data.status || "new", location: data.location || "Unknown" }
    );
  } finally {
    await session.close();
  }
}

export async function createCallNode(callId: string, clientId: string, data: Record<string, any>) {
  const session = getDriver().session();
  try {
    await session.run(
      `MERGE (call:Call {id: $callId})
       SET call.status = $status, call.sentiment = $sentiment
       WITH call
       MATCH (c:Client {id: $clientId})
       MERGE (c)-[:HAD_CALL]->(call)`,
      { callId, clientId, status: data.status || "completed", sentiment: data.sentimentScore || 0 }
    );
  } finally {
    await session.close();
  }
}

export async function createProgramNode(programId: string, clientId: string, data: Record<string, any>) {
  const session = getDriver().session();
  try {
    await session.run(
      `MERGE (p:Program {id: $programId})
       SET p.name = $name, p.type = $type, p.relevance = $relevance
       WITH p
       MATCH (c:Client {id: $clientId})
       MERGE (c)-[:MATCHED_TO {score: $relevance}]->(p)`,
      { programId, clientId, name: data.name || "", type: data.programType || "", relevance: data.relevanceScore || 0 }
    );
  } finally {
    await session.close();
  }
}

export async function createApplicationEdge(clientId: string, programId: string, appId: string, status: string) {
  const session = getDriver().session();
  try {
    await session.run(
      `MATCH (c:Client {id: $clientId}), (p:Program {id: $programId})
       MERGE (c)-[a:APPLIED_TO {appId: $appId}]->(p)
       SET a.status = $status`,
      { clientId, programId, appId, status }
    );
  } finally {
    await session.close();
  }
}

export async function createEligibilityEdge(clientId: string, programId: string, score: number, eligible: boolean) {
  const session = getDriver().session();
  try {
    await session.run(
      `MATCH (c:Client {id: $clientId}), (p:Program {id: $programId})
       MERGE (c)-[e:ELIGIBLE_FOR]->(p)
       SET e.score = $score, e.eligible = $eligible`,
      { clientId, programId, score, eligible }
    );
  } finally {
    await session.close();
  }
}

export async function getReferralGraph(clientId?: string) {
  const session = getDriver().session();
  try {
    const query = clientId
      ? `MATCH (c:Client {id: $clientId})-[r]-(n)
         RETURN c, r, n
         UNION
         MATCH (c:Client {id: $clientId})
         RETURN c, null as r, null as n`
      : `MATCH (n)
         OPTIONAL MATCH (n)-[r]-(m)
         RETURN n, r, m
         LIMIT 200`;

    const result = await session.run(query, clientId ? { clientId } : {});

    const nodes: Array<{ id: string; label: string; type: string; data: Record<string, any> }> = [];
    const edges: Array<{ id: string; source: string; target: string; label: string; data: Record<string, any> }> = [];
    const nodeIds = new Set<string>();
    const internalIdToAppId = new Map<string, string>();

    for (const record of result.records) {
      for (const key of record.keys) {
        const val = record.get(key);
        if (!val) continue;

        if (val.labels) {
          const appId = val.properties.id || val.identity.toString();
          const internalId = val.identity.toString();
          internalIdToAppId.set(internalId, appId);
          if (!nodeIds.has(appId)) {
            nodeIds.add(appId);
            nodes.push({
              id: appId,
              label: val.properties.name || val.labels[0],
              type: val.labels[0],
              data: val.properties,
            });
          }
        }
      }
    }

    const edgeIds = new Set<string>();
    for (const record of result.records) {
      for (const key of record.keys) {
        const val = record.get(key);
        if (!val) continue;

        if (val.type && val.start !== undefined && val.end !== undefined) {
          const srcInternal = val.start.toString();
          const tgtInternal = val.end.toString();
          const src = internalIdToAppId.get(srcInternal) || srcInternal;
          const tgt = internalIdToAppId.get(tgtInternal) || tgtInternal;
          const edgeId = `${src}-${val.type}-${tgt}`;
          if (!edgeIds.has(edgeId)) {
            edgeIds.add(edgeId);
            edges.push({
              id: edgeId,
              source: src,
              target: tgt,
              label: val.type,
              data: val.properties || {},
            });
          }
        }
      }
    }

    return { nodes, edges };
  } finally {
    await session.close();
  }
}

export async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
