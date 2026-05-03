# Digital Workflow Automation

> Request → Review → Approve → Archive

A minimal full-stack prototype built with:

- **React (Vite)** client
- **Node.js (Express)** server

---

## Getting Started

### Run the app

From the repository root:

```powershell
npm install
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
  `REQUEST` → `REVIEW` → `APPROVE` → `ARCHIVE`
- Local JSON persistence at `server/data/db.json`

---

## API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/requests` | List all requests |
| `POST` | `/api/requests` | Create a request |
| `POST` | `/api/requests/:id/transition` | Advance a request in the workflow |

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
  "action": "REVIEW | APPROVE | ARCHIVE",
  "by": "string",
  "note": "string?"
}
```

---

## Diagrams

- Mermaid source: `docs/workflow.mmd`
- Visio drawing notes: `docs/visio-notes.md`
