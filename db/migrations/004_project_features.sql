BEGIN;

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

UPDATE incidents
SET search_vector = to_tsvector(
  'english',
  coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(location, '')
)
WHERE search_vector IS NULL;

CREATE OR REPLACE FUNCTION maintain_incident_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.location, '')
  );
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incidents_search_vector_update ON incidents;
CREATE TRIGGER incidents_search_vector_update
BEFORE INSERT OR UPDATE OF title, description, location ON incidents
FOR EACH ROW
EXECUTE FUNCTION maintain_incident_search_vector();

CREATE INDEX IF NOT EXISTS incidents_search_vector_gin
  ON incidents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS incidents_status_created_at_idx
  ON incidents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS assignments_officer_id_idx
  ON assignments (officer_id);
CREATE INDEX IF NOT EXISTS status_history_incident_changed_at_idx
  ON status_history (incident_id, changed_at DESC);

CREATE OR REPLACE VIEW department_incident_summary AS
SELECT
  d.department_id,
  d.department_name,
  COUNT(i.incident_id)::BIGINT AS total_incidents,
  COUNT(i.incident_id) FILTER (
    WHERE i.status NOT IN ('resolved', 'rejected')
  )::BIGINT AS open_incidents,
  COUNT(i.incident_id) FILTER (
    WHERE i.status = 'resolved'
  )::BIGINT AS resolved_incidents
FROM departments d
LEFT JOIN categories c ON c.department_id = d.department_id
LEFT JOIN incidents i ON i.category_id = c.category_id
GROUP BY d.department_id, d.department_name;

COMMIT;
