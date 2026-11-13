# SmartCivic Project Documentation

This document describes the SmartCivic platform, its architecture, operational workflow, and configuration requirements. It complements the setup guidance in [README.md](./README.md).

## 1. Overview

SmartCivic is a civic incident management application that allows residents to report infrastructure and public service issues, while administrators and department staff triage, assign, investigate, and resolve them. The project is built with Next.js and uses PostgreSQL for transactional data and Qdrant for vector-based similarity search across incident text.

The system is designed around a role-based workflow:

- Residents can create, view, and manage their own reports.
- Residents can review their complaint and feedback history, submit a follow-up complaint after 24 hours without incident status progress, and complain immediately if an incident's status regresses.
- Administrators can review reports, assign one or more officers to pending incidents, manage departments, and track activity history.
- Administrators receive complaint and feedback alerts; marking an alert read removes it from the unread notification panel while the underlying record remains in the archive.
- Department officers/managers can search Qdrant-ranked similar incidents within their authorized scope, view assigned incidents, and update their status.
- Officers can review complaints and feedback for incidents assigned to them.

## 2. Product goals

The platform aims to:

- make incident reporting simple for citizens
- enable role-based triage and assignment by civic administration
- support department accountability with clear ownership and status updates
- provide a searchable, similar-incident experience to detect duplicate or related reports
- preserve operational continuity even when the vector indexing service is temporarily unavailable

## 3. Core features

### Resident portal

Residents can:

- sign up and log in securely
- submit new civic incidents with category, priority, location, title, and description
- view their own incidents and status history
- edit or delete reports before work begins
- find related issues using similarity search
- file complaints about unresolved reports, repeat a complaint after 24 hours without status progress, or complain immediately after a status regression
- review submitted complaints and feedback at any time

### Admin portal

Administrators can:

- review incoming reports
- assign one or more active officers from the incident's department to a pending incident
- search incidents by similarity across their titles, descriptions, and locations using Qdrant
- update incident status and maintenance notes
- manage departments and categories
- monitor activity history
- review resident complaints and feedback in the civic feedback page
- see unread alerts in Incident Management while keeping read items in the archive
- grant or review access for officers and managers

### Officer / department portal

Department users can:

- view their assigned incidents
- search similar incidents in the incidents they are authorized to view using Qdrant
- update statuses such as assigned, in_progress, resolved, and rejected
- work within the department-specific operational view
- review complaints and feedback for incidents assigned to them

### Similar-incident search

The system converts incident titles, descriptions, and locations into deterministic vector embeddings and compares them against previously indexed incidents using Qdrant cosine similarity. Residents, administrators, and department officers can search in the appropriate portal; officer results are restricted to incidents assigned to them or visible to their department manager role. This helps surface near-duplicate or adjacent reports that may already be active. Qdrant provides ranked results rather than replacing PostgreSQL as the source of truth for incident and assignment data.

## 4. Technology stack

- Next.js 16 using the App Router and React 19
- TypeScript throughout the application
- PostgreSQL for relational storage and transactional business logic
- Qdrant for vector storage and semantic/lexical similarity search
- bcryptjs for password hashing
- jose for JWT-style session token signing and verification
- Docker Compose for local Qdrant provisioning

## 5. Repository structure

```text
.
├── app/                     # Next.js app routes and portal pages
│   ├── admin/               # admin UI and API access points
│   ├── civic/               # resident-facing UI
│   ├── officer/             # officer/manager portal
│   ├── api/                 # REST API endpoints for auth, incidents, reports, and admin actions
│   └── ...                  # top-level app shell and landing pages
├── components/              # UI components used by the portals
├── db/
│   └── migrations/          # SQL migration scripts for schema creation and seeded baseline data
├── lib/                     # shared business logic and infrastructure helpers
│   ├── auth/                # session and authentication helpers
│   ├── db.ts                # PostgreSQL pool configuration
│   ├── incident-embeddings.ts  # 384D deterministic incident embedding logic
│   ├── incident-vector-sync.ts # sync/outbox handling for Qdrant updates
│   ├── qdrant.ts            # Qdrant client configuration and operations
│   └── ...
├── README.md                # quick-start and operational setup guide
├── PROJECT_DOCUMENTATION.md # project-level documentation
├── package.json             # scripts and dependencies
├── next.config.ts           # Next.js configuration
├── tsconfig.json            # TypeScript configuration
├── eslint.config.mjs        # lint configuration
└── .env.local               # local environment config (not committed)
```

## 6. Runtime architecture

### Application layer

The application uses Next.js server-side and route handlers to manage requests. The app is organized by user role rather than a monolithic backend. Role-specific folders under `app/` separate civic, admin, and officer experiences while shared helpers govern access and business logic.

### Authentication and authorization

Authentication is implemented with HTTP-only cookies storing signed session tokens. The session logic in `lib/auth/session.ts` enforces:

- session cookie name: `smartcivic_session`
- token lifetime: 7 days
- role validation for `resident`, `officer`, and `admin`
- secure cookie settings in production

Password hashing uses bcrypt, ensuring user credentials are not stored in plain text.

### Data model

The primary relational schema includes:

- `auth_accounts` for login credentials and account metadata
- `users` for user profiles and role assignment
- `departments` and `categories` for operational classification
- `incidents` for report records, status, priority, and lifecycle fields
- `status_history` for change tracking across report states
- `assignments` for officer assignment metadata
- `feedback` for resident feedback on resolved incidents
- `complaints` for resident escalations about incident progress
- `notifications` for unread feedback and complaint alerts delivered to administrators and assigned officers

The SQL migrations in `db/migrations/` create and initialize these tables in order, with seeded default categories and departments.

## 7. Incident lifecycle workflow

The typical incident lifecycle follows this flow:

1. A resident submits an incident with category, urgency, location, and description.
2. The admin review stream evaluates the report.
3. The report can be assigned to a department officer.
4. The officer updates the case status as work proceeds.
5. Status changes are recorded in `status_history` for traceability.
6. A citizen may give feedback once the incident is resolved.
7. A citizen may complain about an unresolved incident. Repeat complaints are limited to once per 24 hours unless the incident status regresses, which permits an immediate complaint.

Important status values include:

- `pending`
- `assigned`
- `in_progress`
- `resolved`
- `rejected`

## 8. Vector-search design

SmartCivic includes a deterministic vector-search layer to help find similar incidents. This is a key differentiator from a purely relational workflow.

### Embedding approach

The project defines a 384-dimensional embedding model in `lib/incident-embeddings.ts`:

- `INCIDENT_EMBEDDING_DIMENSIONS = 384`
- `INCIDENT_EMBEDDING_MODEL = "smartcivic-feature-hash-v1"`

The algorithm uses a hash-based feature scheme that:

- lowercases the text
- extracts tokens and adjacent token pairs
- hashes lexical features into fixed-width positions
- normalizes the resulting vector to unit length for cosine-similarity comparisons

This produces a dependency-free lexical similarity representation instead of a pretrained semantic embedding.

### Storage and synchronization

The vector service uses Qdrant with an `smartcivic_incidents` collection for storing incident embeddings.

A SQL table called `incident_vector_sync` tracks whether an incident has been synced to Qdrant. The migration `005_vector_search_outbox.sql` creates this table and seeds it for current incidents. This provides a resilient sync/outbox pattern:

- incident create/edit writes a row in the SQL outbox before vector indexing
- Qdrant indexing is retried if the search service is unavailable
- the UI can surface that indexing is pending rather than losing incident data
- incident records remain available even when vector indexing fails temporarily

This is intentionally designed to meet the requirement that incident data persists even if vector indexing is unavailable.

## 9. Setup and environment configuration

See [README.md](./README.md) for the quick-start sequence. The most important environment variables are:

```env
DATABASE_URL=******HOST:5432/DATABASE
SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters-long
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=optional-for-cloud-or-secured-deployments
```

### Local database

The project expects a PostgreSQL instance configured through `DATABASE_URL`.

### Local Qdrant

The project includes a Docker Compose-based local Qdrant process:

```powershell
docker compose up -d qdrant
```

The app defaults to `http://localhost:6333` for Qdrant, which is the expected local endpoint. Change the configuration if you run Qdrant elsewhere.

### Session secret

A strong `SESSION_SECRET` is required. The README provides a one-line command to generate a secure random value:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 10. Database migration sequence

The project expects migrations to be applied in order:

1. `001_create_auth_accounts.sql`
2. `002_create_incident_relations.sql`
3. `003_department_officer_managers.sql`
4. `004_project_features.sql`
5. `005_vector_search_outbox.sql`
6. `006_feedback.sql`
7. `007_notifications.sql`
8. `008_backfill_feedback_notifications.sql`
9. `009_complaints.sql`

Example:

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

These scripts create the data model and seed initial departments, categories, and officer identities. Migration 006 adds resident feedback; migrations 007 and 008 add notifications and backfill alerts for existing feedback; migration 009 adds complaints and extends notifications to support complaint alerts.

## 11. Roles and access model

The application distinguishes between three core user roles:

- `resident`: citizens who submit and own incidents
- `officer`: department staff responsible for handling assigned incidents
- `admin`: system administrators with broader control over assignments, departments, and administration

Role assignment is stored in the `users` table and mapped to `auth_accounts` by `auth_account_id`. A resident may be upgraded to admin by assigning the role in PostgreSQL after account registration.

## 12. Public routes and portal entry points

The app exposes role-specific login views:

- Civic login: `/civic/login`
- Admin login: `/admin/login`
- Officer login: `/officer/login`

The platform is designed so users reach the appropriate dashboard based on role and authorization. `PortalGuard` and related server-side checks help enforce access boundaries.

## 13. API exposure

The app includes API endpoints in `app/api/` for:

- authentication and session lifecycle
- incident creation, retrieval, and status updates
- search requests for similar incidents
- department and category management
- officer assignment
- activity history
- feedback submission
- complaint submission and history
- notification retrieval and read-state updates

This keeps the UI thin and centralizes business logic in route handlers and shared lib modules.

## 14. Development workflow

To start the application locally:

```powershell
npm ci
npm run dev
```

Then open:

```text
http://localhost:3000
```

For validation, use:

```powershell
npm run lint
npm run build
```

## 15. Security considerations

The application includes several important safeguards:

- bcrypt-based password hashing
- session tokens signed with a secret and scoped to a limited lifetime
- HTTP-only cookie storage to reduce browser-accessible token exposure
- role-based route separation and access checks
- database constraints to protect valid status and role values

## 16. Operational notes

- If Qdrant is unavailable, incident records remain persisted and the UI can indicate pending indexing.
- Similarity search is best-effort and can retry indexing automatically when the vector service becomes available.
- The project uses PostgreSQL as the source of truth for transactional reporting and uses Qdrant as a derived search index.

## 17. Sri Ram V implementation contributions

- Implemented the feedback flow for resolved incidents, including resident star ratings and optional comments, one-submission-per-incident enforcement, and administrator retrieval.
- Added migrations 006 through 009 for feedback, feedback notifications, notification backfill, and complaints.
- Implemented complaint submission with a 24-hour cooldown when incident status has not progressed; a status regression permits an immediate follow-up complaint, while resolved and rejected incidents remain closed.
- Added complaint and feedback history for residents and officers, with officer access limited to assigned incidents.
- Added notifications for administrators and assigned officers. The admin panel displays unread alerts, marks them read, and keeps feedback and complaints available in the archive.
- Added Qdrant-based incident search to administrator and officer workflows, and supported assigning multiple eligible officers to pending incidents.

## 18. Summary

SmartCivic is a practical civic operations platform that blends standard relational workflows with modern vector-based search. The system balances resident usability, administrative control, and operational traceability while preserving resilience when the vector store is temporarily unavailable.

For the quickest path to running the project, consult [README.md](./README.md). For lower-level schema and implementation detail, review the migrations and supporting modules under `db/` and `lib/`.
