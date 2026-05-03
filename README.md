# Digital Workflow Automation

> Request -> Review -> Approve -> Archive, with rejected requests as a terminal path.

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

- Create a request with `title`, `description`, and `createdBy`
- Advance it through the workflow:
  `REQUEST` -> `REVIEW` -> `APPROVE` -> `ARCHIVE`
- Reject active requests into terminal `REJECTED`
- Persist users, workflow requests, and append-only audit logs in PostgreSQL through Prisma

---

## API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/requests` | List all requests |
| `POST` | `/api/requests` | Create a request |
| `POST` | `/api/requests/:id/transition` | Advance or reject a request |

### Request bodies

```json
{
  "title": "string",
  "description": "string?",
  "createdBy": "string"
}
```

```json
{
  "action": "REVIEW | APPROVE | ARCHIVE | REJECT",
  "by": "string",
  "note": "string?"
}
```

---

## Diagrams

- Mermaid source: `docs/workflow.mmd`
- Visio drawing notes: `docs/visio-notes.md`
