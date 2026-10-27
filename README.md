This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database and authentication setup

The dashboard and account signup/sign-in require PostgreSQL. Add the connection string and a strong session secret to `.env.local` in the project root:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters-long
```

Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Apply the account table migration to the same database:

```powershell
psql "$env:DATABASE_URL" -f db\migrations\001_create_auth_accounts.sql
psql "$env:DATABASE_URL" -f db\migrations\002_create_incident_relations.sql
```

Restart the app with `npm run dev`. The app provides two separate portals on the same Next.js server and shared PostgreSQL database:

- Civic users: [http://localhost:3000/civic/login](http://localhost:3000/civic/login) to create an account, report incidents, and track their own reports.
- Administrators: [http://localhost:3000/admin/login](http://localhost:3000/admin/login) to review incidents, assign department officers, update statuses, manage departments, and view activity history.

The general [http://localhost:3000/login](http://localhost:3000/login) page also lets users choose a portal. Passwords are hashed before storage; successful signup and sign-in create a secure, HTTP-only session cookie. Portal pages and API routes require a valid session, and administrative APIs require an administrator role.

New accounts are civic accounts by default; public signup cannot create administrator accounts. To grant administrator access to an account, first register it using the civic signup form, then run this SQL in the project database, replacing the email:

```sql
UPDATE users
SET role = 'admin'
WHERE auth_account_id = (
  SELECT account_id FROM auth_accounts WHERE email = 'admin@example.com'
);
```

The user must sign out and back in through the administrator portal. Civic accounts can submit and track their own reports. Administrator accounts can review all reports, assign officers from the incident's department, manage departments, update incident status, and view the full activity history.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
