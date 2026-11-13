import pool from "@/lib/db";
import {
  getIndexedIncidentIds,
  upsertIncidentVector,
  upsertIncidentVectors,
} from "@/lib/qdrant";

export type IncidentVectorSource = {
  incident_id: string | number;
  title: string;
  description: string;
  location: string;
};

export async function syncIncidentVector(incident: IncidentVectorSource) {
  try {
    await upsertIncidentVector(incident);
    await pool.query(
      `INSERT INTO incident_vector_sync (incident_id, indexed_at, last_error, updated_at)
       VALUES ($1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT (incident_id)
       DO UPDATE SET indexed_at = CURRENT_TIMESTAMP,
                     last_error = NULL,
                     updated_at = CURRENT_TIMESTAMP`,
      [incident.incident_id]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vector sync failed.";
    try {
      await pool.query(
        `UPDATE incident_vector_sync
         SET last_error = $2, updated_at = CURRENT_TIMESTAMP
         WHERE incident_id = $1`,
        [incident.incident_id, message.slice(0, 1000)]
      );
    } catch (syncError) {
      console.error("Could not record incident vector sync failure:", syncError);
    }
    throw error;
  }
}

export async function syncMissingIncidentVectors(
  incidents: IncidentVectorSource[]
) {
  const indexedIds = await getIndexedIncidentIds(
    incidents.map((incident) => Number(incident.incident_id))
  );
  const missing = incidents.filter(
    (incident) => !indexedIds.has(Number(incident.incident_id))
  );
  if (missing.length === 0) return;

  const batchSize = 500;
  for (let offset = 0; offset < missing.length; offset += batchSize) {
    const batch = missing.slice(offset, offset + batchSize);
    try {
      await upsertIncidentVectors(batch);
      await pool.query(
        `INSERT INTO incident_vector_sync
           (incident_id, indexed_at, last_error, updated_at)
         SELECT incident_id, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP
         FROM unnest($1::bigint[]) AS ids(incident_id)
         ON CONFLICT (incident_id)
         DO UPDATE SET indexed_at = EXCLUDED.indexed_at,
                       last_error = NULL,
                       updated_at = EXCLUDED.updated_at`,
        [batch.map((incident) => incident.incident_id)]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vector sync failed.";
      try {
        await pool.query(
          `UPDATE incident_vector_sync
           SET last_error = $2, updated_at = CURRENT_TIMESTAMP
           WHERE incident_id = ANY($1::bigint[])`,
          [batch.map((incident) => incident.incident_id), message.slice(0, 1000)]
        );
      } catch (syncError) {
        console.error("Could not record incident vector sync failure:", syncError);
      }
      throw error;
    }
  }
}
