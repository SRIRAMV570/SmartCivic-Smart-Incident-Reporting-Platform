import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";
import { embedIncidentText, INCIDENT_EMBEDDING_MODEL } from "@/lib/incident-embeddings";
import { syncIncidentVector } from "@/lib/incident-vector-sync";
import { searchIncidentVectors } from "@/lib/qdrant";

type VisibleIncident = {
  incident_id: string;
  category_id: number;
  title: string;
  description: string;
  location: string;
  priority: string;
  status: string;
  created_at: string;
  category_name: string;
  department_name: string;
  reported_by: string;
  indexed_at: string | null;
};

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 300) {
    return NextResponse.json(
      { success: false, message: "Search text must be between 2 and 300 characters." },
      { status: 400 }
    );
  }
  if (!embedIncidentText(query).some((value) => value !== 0)) {
    return NextResponse.json(
      { success: false, message: "Search text must contain at least one word." },
      { status: 400 }
    );
  }

  try {
    const visibleIncidents: VisibleIncident[] =
      auth.role === "admin"
        ? (
            await pool.query(
              `SELECT incident.incident_id, incident.category_id, incident.title,
                      incident.description, incident.location, incident.priority,
                      incident.status, incident.created_at, category.category_name,
                      department.department_name, reporter.full_name AS reported_by,
                      vector_sync.indexed_at
               FROM incidents incident
               JOIN categories category ON category.category_id = incident.category_id
               JOIN departments department ON department.department_id = category.department_id
               JOIN users reporter ON reporter.user_id = incident.reported_by
               LEFT JOIN incident_vector_sync vector_sync
                 ON vector_sync.incident_id = incident.incident_id`
            )
          ).rows
        : auth.role === "officer"
          ? (
              await pool.query(
                `SELECT DISTINCT incident.incident_id, incident.category_id, incident.title,
                        incident.description, incident.location, incident.priority,
                        incident.status, incident.created_at, category.category_name,
                        department.department_name, reporter.full_name AS reported_by,
                        vector_sync.indexed_at
                 FROM incidents incident
                 JOIN categories category ON category.category_id = incident.category_id
                 JOIN departments department ON department.department_id = category.department_id
                 JOIN users reporter ON reporter.user_id = incident.reported_by
                 JOIN users viewer ON viewer.auth_account_id = $1 AND viewer.is_active = true
                 LEFT JOIN incident_vector_sync vector_sync
                   ON vector_sync.incident_id = incident.incident_id
                 WHERE department.department_id = viewer.department_id
                   AND (
                     viewer.is_manager = true
                     OR EXISTS (
                       SELECT 1 FROM assignments assignment
                       WHERE assignment.incident_id = incident.incident_id
                         AND assignment.officer_id = viewer.user_id
                     )
                   )`,
                [auth.userId]
              )
            ).rows
          : (
              await pool.query(
                `SELECT incident.incident_id, incident.category_id, incident.title,
                        incident.description, incident.location, incident.priority,
                        incident.status, incident.created_at, category.category_name,
                        department.department_name, reporter.full_name AS reported_by,
                        vector_sync.indexed_at
                 FROM incidents incident
                 JOIN categories category ON category.category_id = incident.category_id
                 JOIN departments department ON department.department_id = category.department_id
                 JOIN users reporter ON reporter.user_id = incident.reported_by
                 LEFT JOIN incident_vector_sync vector_sync
                   ON vector_sync.incident_id = incident.incident_id
                 WHERE reporter.auth_account_id = $1`,
                [auth.userId]
              )
            ).rows;

    for (const incident of visibleIncidents) {
      if (!incident.indexed_at) {
        await syncIncidentVector(incident);
      }
    }

    const matches = await searchIncidentVectors(
      query,
      visibleIncidents.map((incident) => Number(incident.incident_id))
    );
    const incidentsById = new Map(
      visibleIncidents.map((incident) => [String(incident.incident_id), incident])
    );
    const results = matches.flatMap((match) => {
      const incident = incidentsById.get(String(match.id));
      return incident
        ? [{ ...incident, indexed_at: undefined, similarity: match.score }]
        : [];
    });

    return NextResponse.json({
      success: true,
      query,
      count: results.length,
      results,
      similarity_metric: "cosine",
      embedding_model: INCIDENT_EMBEDDING_MODEL,
      vector_database: "Qdrant",
    });
  } catch (error) {
    console.error("Incident similarity search failed:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          "Similarity search is unavailable. Check QDRANT_URL, QDRANT_API_KEY, and the Qdrant service.",
      },
      { status: 503 }
    );
  }
}
