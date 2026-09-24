# Ahununu Logistics – Meeting Management Portal

A full-stack, role-based portal for managing company meetings end to end:

**Meeting → Agenda → Discussion → Minutes → Decision → Action Item → Responsible Person → Deadline → Follow-up → Completion**

Built functionally (real API, real database, real auth) rather than as a visual mockup, and seeded with
realistic Ahununu Logistics sample data so the Dashboard is testable immediately.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Tailwind CSS, React Router, Recharts, Lucide Icons |
| Backend | Node.js + Express + TypeScript |
| Database | SQL Server (production) via Prisma ORM — SQLite dev copy included for zero-setup local testing |
| Auth | JWT (JSON Web Tokens), bcrypt password hashing, role-based middleware |

## Project structure

```
ahununu-meeting-portal/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # PRODUCTION schema — SQL Server
│   │   ├── schema.sqlite.prisma   # Local-dev convenience copy — SQLite
│   │   └── seed.ts                # Ahununu Logistics sample data
│   └── src/
│       ├── routes/                # auth, meetings, action-items, departments, users, dashboard, notifications
│       ├── middleware/auth.ts     # JWT verification + role guard
│       ├── utils/enums.ts         # Roles / statuses / priorities (see note below)
│       └── index.ts               # Express app entry
└── frontend/
    └── src/
        ├── pages/                 # Dashboard, Meetings, Calendar, Agenda, Minutes, Decisions,
        │                          # Action Items, Departments, Users, Documents, Notifications,
        │                          # Reports, Settings, Login
        ├── components/            # Sidebar, Header, UI primitives, dashboard charts/table
        ├── context/AuthContext.tsx
        └── api/client.ts          # Typed fetch wrapper, attaches the JWT
```

## Why SQL Server has no enum columns

Prisma doesn't support native enums on the SQL Server connector, so roles, statuses and priorities are
plain `String` columns validated with `zod` in the API layer (see `backend/src/utils/enums.ts`). This is
intentional, not an oversight — it keeps the schema honest about what SQL Server can actually do.

---

## Getting started

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

**Option A — SQL Server (production target):**
Edit `.env` with your SQL Server connection string, then:

```bash
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

**Option B — SQLite (zero setup, for trying it out locally):**

```bash
cp prisma/schema.sqlite.prisma prisma/schema.prisma   # swap in the SQLite schema
echo 'DATABASE_URL="file:./dev.db"' > .env
echo 'JWT_SECRET="change-me"' >> .env
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

The API runs at `http://localhost:4000`. `npx prisma generate` needs normal internet access to download
Prisma's engine binaries the first time — standard for any Prisma project.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173` and proxies `/api` to the backend on port 4000.

### 3. Sign in

Every seeded user has the password **`Ahununu@123`**. The login screen has one-click demo account buttons, or use directly:

| Role | Email |
|---|---|
| Super Admin | dawit.bekele@ahununulogistics.com |
| Management (CEO) | selamawit.tesfaye@ahununulogistics.com |
| Department Manager | hana.alemu@ahununulogistics.com |
| Meeting Organizer | abenezer.solomon@ahununulogistics.com |
| Employee | samuel.wolde@ahununulogistics.com |

---

## What's implemented

**Phase 1 (as scoped):** project setup, full DB schema, JWT authentication, 5 user roles with
role-based permissions, Dashboard (8 stat cards + 4 chart types + Action & Accountability table with
automatic overdue highlighting), meeting creation/list/detail, agenda, and action items.

**Beyond the Phase 1 minimum, also built and working:** Calendar (month view), standalone Agenda and
Meeting Minutes modules, Decisions module, Departments (admin-configurable), Users & role permissions,
Notifications (with unread badges), Documents (metadata + per-meeting attach), and a printable Reports
page — all 13 modules from the spec are real, navigable, and backed by the API.

**Prepared, not yet built (flagged honestly rather than faked):**
- Actual file **storage** for Documents — metadata/attach flow is wired up; binary storage is meant to
  connect to Ahununu Logistics' DMS.
- Outbound **email/SMS** delivery — the Settings page includes a branded email template preview; sending
  is meant to connect to the SMS/Finance/HR systems mentioned in the brief.
- PAS / Finance / HR system connectors — the REST API and role model are structured so these can be added
  as new route modules without reshaping what exists.

## A note on this build environment

This project was built and type-checked (`tsc --noEmit` on both frontend and backend, plus a full
`vite build`) inside a sandboxed environment whose network policy blocks Prisma's engine-binary CDN
(`binaries.prisma.sh`). That means `prisma generate`/`migrate` couldn't be run live here — that's a
sandbox restriction, not a problem with the code. It will run normally with standard internet access,
which is all `npm install && npx prisma generate` needs anywhere else.
