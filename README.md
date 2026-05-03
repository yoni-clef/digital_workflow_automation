# Digital Workflow Automation

> Request -> Review -> Approve -> Archive, with rejection and needs-info paths.

A full-stack workflow automation prototype being evolved toward an enterprise-ready architecture.

- **React (Vite)** client
- **Node.js (Express)** server
- **PostgreSQL + Prisma** persistence layer

---

## Getting Started

### Run the app

Create `server/.env` from `server/.env.example`, then run from the repository root:

```powershell
npm install
npm -w server run prisma:generate
npm -w server run prisma:migrate
npm run dev
```

### Access the app

- **Server:** http://localhost:4000
- **Client:** the URL printed by Vite (usually http://localhost:5173)

The client proxies `/api/*` to the server during development.

---

## Features

- Create a request with `title`, `description`, `category`, and optional amount
- Sign in through the development identity provider and receive an HTTP-only session cookie
- Create requests as the authenticated user, without typing a spoofable submitter name
- Advance it through the workflow:
  `REQUEST` -> `REVIEW` -> `APPROVE` -> `ARCHIVE`
- Send active requests back to `NEEDS_INFO`, then let the submitter resubmit
- Reject active requests into terminal `REJECTED`
- Auto-approve hardware requests under 500.00 into `APPROVE`
- Delegate active requests to another reviewer or approver
- Track a seven-day SLA due date while requests are in `REVIEW`
- Enforce role-aware workflow transitions:
  `REVIEWER` can review, `APPROVER` can approve/archive, and `ADMIN` can do both
- Persist users, workflow requests, and append-only audit logs in PostgreSQL through Prisma

---

## API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/dev-login` | Create a development session |
| `POST` | `/api/auth/logout` | Clear the active session |
| `GET` | `/api/session` | Read the current authenticated user |
| `GET` | `/api/requests` | List all requests |
| `POST` | `/api/requests` | Create a request |
| `POST` | `/api/requests/:id/transition` | Advance or reject a request |
| `POST` | `/api/requests/:id/delegate` | Delegate an active request |

### Request bodies

```json
{
  "title": "string",
  "description": "string?",
  "category": "GENERAL | HARDWARE | SOFTWARE | FINANCE | HR",
  "amountCents": 10000
}
```

```json
{
  "action": "REVIEW | APPROVE | ARCHIVE | REQUEST_INFO | RESUBMIT | REJECT",
  "note": "string?"
}
```

Delegate body:

```json
{
  "displayName": "string",
  "email": "delegate@company.com",
  "role": "REVIEWER | APPROVER",
  "department": "string?",
  "note": "string?"
}
```

Development login body:

```json
{
  "displayName": "string",
  "email": "user@company.com",
  "role": "USER | REVIEWER | APPROVER | ADMIN",
  "department": "string?"
}
```

---

## Diagrams

- Mermaid source: `docs/workflow.mmd`
- Visio drawing notes: `docs/visio-notes.md`
