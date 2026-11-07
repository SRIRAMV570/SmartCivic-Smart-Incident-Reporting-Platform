BEGIN;

CREATE TABLE IF NOT EXISTS departments (
  department_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_name VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  department_id BIGINT REFERENCES departments(department_id) ON DELETE SET NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'resident'
    CHECK (role IN ('resident', 'officer', 'admin')),
  auth_account_id BIGINT UNIQUE
    REFERENCES auth_accounts(account_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_name VARCHAR(120) NOT NULL UNIQUE,
  department_id BIGINT NOT NULL
    REFERENCES departments(department_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incidents (
  incident_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(5000) NOT NULL,
  category_id BIGINT NOT NULL
    REFERENCES categories(category_id) ON DELETE RESTRICT,
  reported_by BIGINT NOT NULL
    REFERENCES users(user_id) ON DELETE RESTRICT,
  location VARCHAR(300) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'in_progress', 'resolved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS status_history (
  history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id BIGINT NOT NULL
    REFERENCES incidents(incident_id) ON DELETE CASCADE,
  old_status VARCHAR(20)
    CHECK (old_status IS NULL OR old_status IN ('pending', 'assigned', 'in_progress', 'resolved', 'rejected')),
  new_status VARCHAR(20) NOT NULL
    CHECK (new_status IN ('pending', 'assigned', 'in_progress', 'resolved', 'rejected')),
  changed_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  remarks VARCHAR(1000),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments (
  assignment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id BIGINT NOT NULL
    REFERENCES incidents(incident_id) ON DELETE CASCADE,
  officer_id BIGINT NOT NULL
    REFERENCES users(user_id) ON DELETE RESTRICT,
  assigned_by BIGINT NOT NULL
    REFERENCES users(user_id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assignments_incident_officer_unique UNIQUE (incident_id, officer_id)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_account_id BIGINT UNIQUE
  REFERENCES auth_accounts(account_id) ON DELETE SET NULL;

INSERT INTO departments (department_id, department_name)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'Public Works'),
  (2, 'Sanitation'),
  (3, 'Water Services'),
  (4, 'Electrical Services')
ON CONFLICT (department_id) DO UPDATE
SET department_name = EXCLUDED.department_name;

INSERT INTO categories (category_id, category_name, department_id)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'Pothole', 1),
  (2, 'Garbage Overflow', 2),
  (3, 'Water Leakage', 3),
  (4, 'Street Light Failure', 4)
ON CONFLICT (category_id) DO UPDATE
SET category_name = EXCLUDED.category_name,
    department_id = EXCLUDED.department_id;

INSERT INTO users (full_name, department_id, role)
SELECT seed.full_name, seed.department_id, 'officer'
FROM (VALUES
  ('Public Works Officer', 1::BIGINT),
  ('Sanitation Officer', 2::BIGINT),
  ('Water Services Officer', 3::BIGINT),
  ('Electrical Services Officer', 4::BIGINT)
) AS seed(full_name, department_id)
WHERE NOT EXISTS (
  SELECT 1
  FROM users existing
  WHERE existing.full_name = seed.full_name
    AND existing.department_id = seed.department_id
);

INSERT INTO users (full_name, auth_account_id)
SELECT account.full_name, account.account_id
FROM auth_accounts account
WHERE NOT EXISTS (
  SELECT 1
  FROM users existing
  WHERE existing.auth_account_id = account.account_id
);

SELECT setval(
  pg_get_serial_sequence('departments', 'department_id'),
  GREATEST(COALESCE((SELECT MAX(department_id) FROM departments), 1), 1),
  true
);

SELECT setval(
  pg_get_serial_sequence('categories', 'category_id'),
  GREATEST(COALESCE((SELECT MAX(category_id) FROM categories), 1), 1),
  true
);

SELECT setval(
  pg_get_serial_sequence('users', 'user_id'),
  GREATEST(COALESCE((SELECT MAX(user_id) FROM users), 1), 1),
  true
);

COMMIT;
