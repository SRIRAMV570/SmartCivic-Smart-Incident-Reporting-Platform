import {
  embedIncidentText,
  INCIDENT_EMBEDDING_DIMENSIONS,
  INCIDENT_EMBEDDING_MODEL,
} from "@/lib/incident-embeddings";

const COLLECTION = "smartcivic_incidents";

type IncidentText = {
  incident_id: string | number;
  title: string;
  description: string;
  location: string;
};

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
  await ensureCollection();
  const pointId = Number(incident.incident_id);
  if (!Number.isSafeInteger(pointId) || pointId < 1) {
    throw new Error("Incident ID cannot be represented as a Qdrant point ID.");
  }

  await qdrantRequest(`/collections/${COLLECTION}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({
      points: [
        {
          id: pointId,
          vector: embedIncidentText(
            `${incident.title} ${incident.description} ${incident.location}`
          ),
          payload: {
            incident_id: String(incident.incident_id),
            embedding_model: INCIDENT_EMBEDDING_MODEL,
          },
        },
      ],
    }),
  });
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

  return points.map((point: { id: number; score: number }) => ({
    id: point.id,
    score: point.score,
  }));
}
