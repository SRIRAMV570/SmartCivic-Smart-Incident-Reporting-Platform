BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_manager BOOLEAN NOT NULL DEFAULT false;

WITH departments_without_managers AS (
  SELECT d.department_id, MIN(u.user_id) AS user_id
  FROM departments d
  JOIN users u
    ON u.department_id = d.department_id
   AND u.role = 'officer'
  WHERE NOT EXISTS (
    SELECT 1
    FROM users manager
    WHERE manager.department_id = d.department_id
      AND manager.role = 'officer'
      AND manager.is_manager = true
  )
  GROUP BY d.department_id
)
UPDATE users u
SET is_manager = true
FROM departments_without_managers candidate
WHERE u.user_id = candidate.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS users_one_officer_manager_per_department
  ON users (department_id)
  WHERE role = 'officer' AND is_manager = true;

COMMIT;
