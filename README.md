# SmartCivic — Civic Incident Management Platform

SmartCivic is a role-based civic incident reporting and management platform. It connects residents who report local infrastructure issues with administrators and department officers who review, assign, track, and resolve those reports.

The application combines a Next.js web interface, PostgreSQL-backed transactional workflows, and Qdrant-powered similar-incident search.

## Table of contents

- [Key capabilities](#key-capabilities)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Database setup](#database-setup)
- [Qdrant setup](#qdrant-setup)
- [Run the application](#run-the-application)
- [User portals](#user-portals)
- [How similar-incident search works](#how-similar-incident-search-works)
- [Validation](#validation)
- [Documentation](#documentation)

## Key capabilities

- **Resident reporting:** Submit civic issues, track status history, and manage reports before work begins.
- **Incident administration:** Review reports, search for related incidents, assign eligible officers, and manage departments.
- **Officer workflows:** View authorized or assigned incidents and update their progress.
- **Feedback and complaints:** Residents can provide feedback on resolved incidents and raise complaints about eligible unresolved reports.
- **Notifications:** Complaint and feedback alerts are surfaced to administrators and relevant officers.
- **Similar-incident search:** Find related reports using Qdrant-backed vector similarity.
- **Resilient indexing:** PostgreSQL remains the source of truth; vector indexing can be retried if Qdrant is temporarily unavailable.

## Technology stack

| Layer | Technology |
| --- | --- |
| Web framework | Next.js App Router |
| UI | React |
| Language | TypeScript |
| Relational database | PostgreSQL |
| Vector database | Qdrant |
| Authentication | HTTP-only signed sessions with jose |
| Password hashing | bcryptjs |
| Local vector service | Docker Compose |

## Repository structure

~~~text
.
├── app/                      # App Router pages, portals, and API routes
│   ├── admin/                # Administrator portal
│   ├── civic/                # Resident portal
│   ├── officer/              # Officer and manager portal
│   └── api/                  # Application API routes
├── components/               # Shared UI components
├── db/
│   └── migrations/           # Ordered PostgreSQL migrations
├── lib/                      # Shared authentication, database, and service logic
├── public/                   # Static assets
├── docker-compose.yml        # Local Qdrant service
├── PROJECT_DOCUMENTATION.md  # Architecture and implementation details
└── package.json              # Dependencies and npm scripts
~~~

## Getting started

### Prerequisites

Install the following before running the project:

- Node.js and npm
- PostgreSQL
- Docker Desktop or Docker Engine (for local Qdrant)

Clone the repository and install the dependencies:

~~~bash
git clone https://github.com/SRIRAMV570/SmartCivic-Smart-Incident-Reporting-Platform.git
cd SmartCivic-Smart-Incident-Reporting-Platform
npm ci
~~~

Create an .env.local file in the project root:

~~~env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters-long
# Optional for local Qdrant; configure for secured or cloud deployments.
QDRANT_API_KEY=
# Optional when Qdrant is not running at the local default.
QDRANT_URL=http://localhost:6333
~~~

Generate a session secret:

~~~bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
~~~

Keep real credentials in your local environment file. Do not commit secrets to the repository.

## Database setup

Create a PostgreSQL database and set its connection string in DATABASE_URL. Apply the migrations in numerical order from the repository root:

~~~bash
psql "$DATABASE_URL" -f db/migrations/001_create_auth_accounts.sql
psql "$DATABASE_URL" -f db/migrations/002_create_incident_relations.sql
psql "$DATABASE_URL" -f db/migrations/003_department_officer_managers.sql
psql "$DATABASE_URL" -f db/migrations/004_project_features.sql
psql "$DATABASE_URL" -f db/migrations/005_vector_search_outbox.sql
psql "$DATABASE_URL" -f db/migrations/006_feedback.sql
psql "$DATABASE_URL" -f db/migrations/007_notifications.sql
psql "$DATABASE_URL" -f db/migrations/008_backfill_feedback_notifications.sql
psql "$DATABASE_URL" -f db/migrations/009_complaints.sql
~~~

Run each migration once, in sequence, against the intended database. The migration files define the schema changes and supporting data required by the application.

## Qdrant setup

For a local Qdrant instance, start the service from the repository root:

~~~bash
docker compose up -d qdrant
~~~

The application uses http://localhost:6333 by default. If you use Qdrant Cloud or another endpoint, set QDRANT_URL and configure QDRANT_API_KEY as required.

Migration 005_vector_search_outbox.sql creates the SQL synchronization/outbox table. The application provisions the 384-dimensional cosine-similarity collection in Qdrant when needed.

## Run the application

Start the development server:

~~~bash
npm run dev
~~~

Open [http://localhost:3000](http://localhost:3000).

To create and run a production build:

~~~bash
npm run build
npm run start
~~~

## User portals

| Role | Login route | Main responsibilities |
| --- | --- | --- |
| Resident | /civic/login | Submit and track reports, search similar incidents, and manage complaints and feedback |
| Administrator | /admin/login | Review reports, assign officers, manage departments, and monitor activity and alerts |
| Officer / manager | /officer/login | View authorized incidents, update statuses, and review related complaints and feedback |

New public accounts are created as civic accounts. To grant administrator access, register the account first and then update its role in PostgreSQL:

~~~sql
UPDATE users
SET role = 'admin'
WHERE auth_account_id = (
  SELECT account_id
  FROM auth_accounts
  WHERE email = 'admin@example.com'
);
~~~

Use the email address of the account you actually registered.

## How similar-incident search works

Incident titles, descriptions, and locations are converted into 384-dimensional vectors using the deterministic smartcivic-feature-hash-v1 implementation. It hashes words and adjacent-word features into a fixed-size vector and normalizes it for cosine-similarity comparison.

This is a lexical feature-based approach, not a pretrained language model. Qdrant stores and ranks the vectors in the smartcivic_incidents collection.

PostgreSQL remains the source of truth for incident records and assignments. Incident create/edit operations write a synchronization record to the SQL outbox before Qdrant indexing. If Qdrant is unavailable, the incident remains saved and indexing can be retried later. Search results are scoped according to the signed-in user's permissions.

## Validation

Run the available project checks:

~~~bash
npm run lint
npm run build
~~~

These commands run ESLint and create a Next.js production build. They do not replace testing the database connection, migrations, authentication, role permissions, or Qdrant integration in the target environment.

## Documentation

- [Project documentation](./PROJECT_DOCUMENTATION.md) — architecture, data model, workflows, security notes, and implementation details.
- [Database migrations](./db/migrations/) — ordered SQL schema and feature migrations.
- [Docker Compose configuration](./docker-compose.yml) — local Qdrant service configuration.
