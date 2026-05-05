# Enterprise Digital Workflow Automation Platform
**Technical Documentation & Architecture Reference**

---

## 1. Executive Summary

The **Digital Workflow Automation Platform** is a scalable, full-stack enterprise application designed to manage, route, and audit organizational requests (e.g., Hardware, Software, Finance, HR approvals). Moving beyond simple linear state machines, this platform implements complex, real-world workflow logic including role-based routing, SLA tracking, task delegation, and strict security compliance.

The platform consists of a **React 19 (Vite) Frontend** heavily styled with Tailwind CSS, communicating with a robust **Node.js/Express Backend** backed by a **PostgreSQL** relational database using the **Prisma ORM**.

---

## 2. Architecture & Tech Stack

### 2.1 Frontend (Client)
- **Framework:** React 19 + Vite (for high-performance HMR and optimized builds)
- **Styling:** Tailwind CSS v4 + Lucide React (for iconography)
- **Routing:** React Router v7
- **Testing:** Vitest + React Testing Library + JSDOM

### 2.2 Backend (Server)
- **Framework:** Node.js + Express.js
- **Persistence Layer:** PostgreSQL accessed via Prisma ORM v6
- **Authentication:** JWT (JSON Web Tokens) with HTTP-only cookies and Bcrypt password hashing
- **File Uploads:** Multer (for attachments handling)
- **Task Scheduling:** `node-cron` for automated SLA monitoring and expiry logic
- **Emails/Notifications:** Nodemailer for outgoing transactional emails
- **Validation:** Zod for strict payload validation

### 2.3 DevOps & Containerization Ready
- Designed with separate environment configurations (`.env.development`, `.env.production`)
- Prepared for Docker containerization
- CI/CD hooks friendly via standard npm scripts (`npm run build`, `npm run test`)

---

## 3. Core Domain Features

### 3.1 Identity & Access Management (IAM)
The application enforces strict **Role-Based Access Control (RBAC)** across operations:
- **`USER`:** Generates requests, can re-submit if more info is needed, sees personal history.
- **`ADMIN`:** Complete oversight, can approve, override, or re-route requests system-wide.
- **Hierarchical Routing:** Includes concepts of Subordinates, Managers, and Department Heads ensuring requests correctly route upwards in the org-chart (e.g., `PENDING_MANAGER` → `PENDING_DEPARTMENT`).

### 3.2 Advanced Workflow Engine (State Machine)
The core logic manages transitions dynamically based on state and inputs, preventing illegal states:
- **Primary States:** `PENDING_MANAGER`, `PENDING_DEPARTMENT`, `NEEDS_INFO`, `APPROVED`, `REJECTED`, `ARCHIVED`.
- **Conditional Auto-Routing:** For example, hardware requests under a certain threshold (`$500`) can bypass department-level scrutiny.
- **Delegation/Reassignment:** Reviewers can delegate specific requests to alternate managers during absences.

### 3.3 Immutability & Audit Trails (Security focus)
In enterprise tools (SOX/GDPR compliances), logs must never be tampered with.
- **Append-Only History:** Uses `RequestAuditLog`.
- **Soft Deletions:** Requests are never fundamentally deleted (`isDeleted: true`).
- Every transition logs the `actorId`, `fromStatus`, `toStatus`, `action`, `ipAddress`, `userAgent`, and a timestamp.

### 3.4 Automated SLAs & Notifications
- **Cron Jobs (`cron.js`):** Periodically scan for requests trapped in a review state past their `dueAt` date, triggering escalations.
- **Notifications (`notification.js`):** Programmatic alerts via Nodemailer dispatch whenever significant transitions occur (Assignment, Rejection, Approval). 

### 3.5 Attachments & Evidentiary Data
- Support for physical evidence (e.g., Receipts, Quotes).
- Blobs referenced via the `Attachment` Prisma model utilizing strict `mimetype` and `sizeBytes` validation to prevent malicious uploads.

---

## 4. Database Schema (Prisma Data Model)

Our database is fully normalized. The major models and relationships include:

1. **`User`**
   - Managed via a self-relational mapping (`managerId` bounds to another `User`).
   - Identifies roles (`USER` vs `ADMIN`), departments, and hierarchical positions (`isDepartmentHead`).
2. **`WorkflowRequest`**
   - The central entity representing a ticket.
   - Holds meta-data (`title`, `amountCents`, `category`, `dueAt`, `status`).
   - Relates to the `submitter` (User) and explicitly tracks the `assignedTo` (User) creating specific Inbox queues.
3. **`RequestAuditLog`**
   - Belongs to a `WorkflowRequest` and tracks the historical footprint of *who* did *what* and *when*.
4. **`Attachment`**
   - Belongs to a `WorkflowRequest`, preserving the path and integrity of files uploaded during the initial request or information-gathering steps.

---

## 5. Security & Validation Practices

As a Senior Engineer, I've ensured this project includes multiple layers of defensive programming:
- **Helmet:** Sets secure HTTP headers on Express, preventing clickjacking and MIME-sniffing.
- **Zod:** Runtime schema validation ensures malicious payloads cannot poison the database (e.g. attempting to force an ID or status).
- **HTTP-Only Cookies:** Mitigates Cross-Site Scripting (XSS) risks by preventing JavaScript access to active JWT sessions.
- **Bcrypt:** Hashes passwords asynchronously with a salt iteration, neutralizing rainbow-table attacks.
- **CORS Mitigation:** Restricts origin access selectively to the client URL during cross-origin configurations.

---

## 6. Setup & Installation Guide

To run the application locally from scratch:

**Prerequisites:** 
- Node.js (v18+)
- PostgreSQL (v14+) running locally or accessible via URL.

**1. Clone & Install Dependencies**
```bash
# Install concurrently from root
npm install 
# Or individually
cd server && npm install
cd ../client && npm install
```

**2. Environment Configuration**
In the `/server` directory, create your `.env` file:
```env
PORT=4000
DATABASE_URL="postgresql://user:password@localhost:5432/workflow"
JWT_SECRET="YOUR_SUPER_SECRET_KEY_HERE"
```

**3. Database Initialization**
```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
```

**4. Start the Application**
We leverage workspaces or separate terminals:
```bash
# Terminal 1 - Backend Server
cd server
npm run dev

# Terminal 2 - Frontend Client
cd client
npm run dev
```
The Client will typically run at `http://localhost:5173` and the Server at `http://localhost:4000`.

---

## 7. Testing Strategy

The application adopts the Testing Pyramid utilizing **Vitest**:
- **Unit Tests:** Found in `server/src/__tests__`. Tests core transitions (`transitions.test.js`), RBAC compliance (`rbac.test.js`), and schema validation (`validation.test.js`) natively without requiring active DB connections.
- **Endpoint/Integration Tests:** Asserts route protection for unauthorized users.
- **Frontend Validation:** Logic encapsulated in `client/src/__tests__` evaluating component hooks and isolated rendering conditions. 

```bash
# Running Server Tests
cd server
npm test

# Running Client Tests
cd client
npm test
```

---
*Document prepared under Senior Software Engineering standards. Suitable for final project submission and architecture review.*