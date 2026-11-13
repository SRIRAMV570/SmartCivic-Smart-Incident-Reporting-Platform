# SmartCivic — Civic Incident Management Platform

SmartCivic connects residents reporting local infrastructure issues with administrators and department officers who triage, assign, and resolve reports. It demonstrates role-based workflows backed by PostgreSQL and vector similarity search with Qdrant.

## Technology

- Next.js App Router, React, TypeScript
- PostgreSQL for relational data and transactional workflows
- Qdrant for incident-vector storage and cosine-similarity search
- HTTP-only signed sessions and bcrypt password hashing

## Setup

Install dependencies:

```powershell
npm ci
```

Configure `.env.local` in the project root:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters-long
# QDRANT_API_KEY is optional for local Qdrant; configure it for secured/cloud deployments.
```

The app defaults to `http://localhost:6333` for local Qdrant. Set `QDRANT_URL` explicitly when using a different endpoint.

Generate a session secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Apply the SQL migrations in order to the configured PostgreSQL database:

```powershell
psql "$env:DATABASE_URL" -f db\migrations\001_create_auth_accounts.sql
psql "$env:DATABASE_URL" -f db\migrations\002_create_incident_relations.sql
psql "$env:DATABASE_URL" -f db\migrations\003_department_officer_managers.sql
psql "$env:DATABASE_URL" -f db\migrations\004_project_features.sql
psql "$env:DATABASE_URL" -f db\migrations\005_vector_search_outbox.sql
psql "$env:DATABASE_URL" -f db\migrations\006_feedback.sql
psql "$env:DATABASE_URL" -f db\migrations\007_notifications.sql
psql "$env:DATABASE_URL" -f db\migrations\008_backfill_feedback_notifications.sql
psql "$env:DATABASE_URL" -f db\migrations\009_complaints.sql
```

The vector service is Qdrant. Start the included local instance in another terminal:

```powershell
docker compose up -d qdrant
```

For Qdrant Cloud, set `QDRANT_URL` and `QDRANT_API_KEY` instead. Migration `005` creates the SQL sync/outbox table; Qdrant creates the 384-dimensional cosine collection automatically on first use.

Start the app:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Portals and capabilities

- Civic users: [http://localhost:3000/civic/login](http://localhost:3000/civic/login) to submit and track reports, edit/delete reports before work starts, find similar incidents, and file complaints. A repeat complaint is allowed after 24 hours without status progress; a status regression allows an immediate complaint during that cooldown. Complaints cannot be submitted for resolved or rejected incidents. Complaint and feedback history is available at `/civic/complaints-feedback`.
- Administrators: [http://localhost:3000/admin/login](http://localhost:3000/admin/login) to review reports, search similar incidents with Qdrant, assign one or more department officers to a pending incident, update status, manage departments and officer accounts, and view activity history. New complaint and feedback alerts appear in Incident Management until marked read; read notifications remain in Civic Feedback & Complaints.
- Department officers/managers: [http://localhost:3000/officer/login](http://localhost:3000/officer/login) to search Qdrant-ranked similar incidents within their authorized incident scope, view assigned incidents, update statuses, and review assigned-incident complaints and feedback at `/officer/complaints-feedback`.

New public accounts are civic accounts. To grant administrator access, register the account first, then update its role in PostgreSQL:

```sql
UPDATE users
SET role = 'admin'
WHERE auth_account_id = (
  SELECT account_id FROM auth_accounts WHERE email = 'admin@example.com'
);
```

## Vector-search design

Incident title, description, and location are converted into 384-dimensional vectors by the deterministic `smartcivic-feature-hash-v1` implementation. It uses hashed word and adjacent-word features, so it is dependency-free and provides lexical feature similarity rather than pretrained-language-model semantics. Vectors are stored in Qdrant's `smartcivic_incidents` collection and searched with cosine similarity. Residents, administrators, and department officers can use Qdrant-ranked incident search; results are scoped to the incidents visible to the signed-in role, so officer search cannot expose incidents outside their department or assignment access.

SQL incident create/edit operations commit a vector-sync outbox row before Qdrant synchronization. If Qdrant is unavailable, the incident remains saved, the UI reports that indexing is pending, and similarity searches retry indexing. Details are in [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md).

## Validation and submission

```powershell
npm run lint
npm run build
```
