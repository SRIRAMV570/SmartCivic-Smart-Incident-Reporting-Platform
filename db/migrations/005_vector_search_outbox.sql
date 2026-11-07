CREATE TABLE IF NOT EXISTS incident_vector_sync (
  incident_id BIGINT PRIMARY KEY
    REFERENCES incidents(incident_id) ON DELETE CASCADE,
  indexed_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO incident_vector_sync (incident_id)
SELECT incident_id
FROM incidents
ON CONFLICT (incident_id) DO NOTHING;
