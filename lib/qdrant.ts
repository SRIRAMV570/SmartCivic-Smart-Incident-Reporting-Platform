import {
  embedIncidentText,
  INCIDENT_EMBEDDING_DIMENSIONS,
  INCIDENT_EMBEDDING_MODEL,
} from "@/lib/incident-embeddings";

const COLLECTION = "smartcivic_incidents";
export const INCIDENT_SIMILARITY_THRESHOLD = 0.08;

type IncidentText = {
  incident_id: string | number;
  title: string;
  description: string;
  location: string;
};

function getPointId(incidentId: string | number) {
  const pointId = Number(incidentId);
  if (!Number.isSafeInteger(pointId) || pointId < 1) {
    throw new Error("Incident ID cannot be represented as a Qdrant point ID.");
  }
  return pointId;
}

function getQdrantConfig() {
  const url = process.env.QDRANT_URL ?? "http://localhost:6333";

  return {
    url: url.replace(/\/+$/, ""),
    apiKey: process.env.QDRANT_API_KEY,
  };
}

async function qdrantRequest(path: string, init?: RequestInit) {
  const { url, apiKey } = getQdrantConfig();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("api-key", apiKey);

  const response = await fetch(`${url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Qdrant request failed (${response.status}): ${detail}`);
  }

  return response.status === 204 ? null : response.json();
}

async function ensureCollection() {
  const { url, apiKey } = getQdrantConfig();
  const headers = new Headers();
  if (apiKey) headers.set("api-key", apiKey);
  const response = await fetch(`${url}/collections/${COLLECTION}`, {
    headers,
    cache: "no-store",
  });

  if (response.ok) return;
  if (response.status !== 404) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Qdrant collection check failed (${response.status}): ${detail}`);
  }

  try {
    await qdrantRequest(`/collections/${COLLECTION}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: INCIDENT_EMBEDDING_DIMENSIONS,
          distance: "Cosine",
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("(409)")) return;
    throw error;
  }
}

export async function upsertIncidentVector(incident: IncidentText) {
  await upsertIncidentVectors([incident]);
}

export async function upsertIncidentVectors(incidents: IncidentText[]) {
  if (incidents.length === 0) return;
  await ensureCollection();

  await qdrantRequest(`/collections/${COLLECTION}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({
      points: incidents.map((incident) => ({
        id: getPointId(incident.incident_id),
        vector: embedIncidentText(
          `${incident.title} ${incident.description} ${incident.location}`
        ),
        payload: {
          incident_id: String(incident.incident_id),
          embedding_model: INCIDENT_EMBEDDING_MODEL,
        },
      })),
    }),
  });
}

export async function getIndexedIncidentIds(incidentIds: number[]) {
  if (incidentIds.length === 0) return new Set<number>();
  await ensureCollection();

  const indexedIds = new Set<number>();
  const batchSize = 500;
  for (let offset = 0; offset < incidentIds.length; offset += batchSize) {
    const batch = incidentIds.slice(offset, offset + batchSize);
    const result = await qdrantRequest(
      `/collections/${COLLECTION}/points`,
      {
        method: "POST",
        body: JSON.stringify({
          ids: batch,
          with_payload: false,
          with_vector: false,
        }),
      }
    );

    const points =
      result && typeof result === "object" && "result" in result
        ? result.result
        : null;
    if (!Array.isArray(points)) {
      throw new Error("Qdrant returned an invalid point-lookup response.");
    }

    for (const point of points as Array<{ id: number }>) {
      indexedIds.add(Number(point.id));
    }
  }

  return indexedIds;
}

export async function deleteIncidentVector(incidentId: number) {
  await ensureCollection();
  await qdrantRequest(`/collections/${COLLECTION}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({ points: [incidentId] }),
  });
}

export async function searchIncidentVectors(
  query: string,
  incidentIds: number[],
  limit = 20
): Promise<Array<{ id: number; score: number }>> {
  if (!incidentIds.length) return [];
  await ensureCollection();

  const result = await qdrantRequest(
    `/collections/${COLLECTION}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector: embedIncidentText(query),
        filter: { must: [{ has_id: incidentIds }] },
        score_threshold: INCIDENT_SIMILARITY_THRESHOLD,
        limit,
        with_payload: true,
        with_vectors: false,
      }),
    }
  );

  const points =
    result && typeof result === "object" && "result" in result
      ? result.result
      : null;
  if (!Array.isArray(points)) {
    throw new Error("Qdrant returned an invalid similarity-search response.");
  }

  return points
    .filter(
      (point: { score: number }) =>
        Number.isFinite(point.score) &&
        point.score >= INCIDENT_SIMILARITY_THRESHOLD
    )
    .map((point: { id: number; score: number }) => ({
      id: point.id,
      score: point.score,
    }));
}
