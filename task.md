# Execution Tasks

- [ ] **Phase 1.1: Authentication & Database Updates**
  - [x] Add `bcrypt` and `jsonwebtoken` dependencies to server.
  - [x] Update `schema.prisma` (Add `passwordHash` to `User`, soft delete flags, audit context, `Attachment` model).
  - [x] Apply Prisma migrations.
  - [x] Create `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` endpoints.
  - [x] Implement JWT verification middleware to secure API routes.
  - [x] Update client-side authentication to use the new endpoints.
- [x] **Phase 1.2: Local File Storage**
  - [x] Add `multer` dependency to server.
  - [x] Create `/api/upload` endpoint saving to local `uploads/` directory.
  - [x] Configure Express to serve the `uploads/` directory statically.
- [x] **Phase 2.1: Audit & Workflow Enhancements**
  - [x] Capture `ipAddress` and `userAgent` in transition endpoints.
  - [x] Implement conditional routing (e.g., auto-approve requests < $500).
- [x] **Phase 2.2: UI/UX Modernization**
  - [x] Install and configure Tailwind CSS + Shadcn UI in client.
  - [x] Implement robust login/register forms.
  - [x] Implement advanced tables with sorting/filtering for the dashboard.
  - [x] Add file upload support to the request creation form.
- [x] **Phase 3: Asynchronous Local Tasks**
  - [x] Add `node-cron` and `nodemailer` dependencies.
  - [x] Create an SLA Worker using `node-cron` to check for >7 day SLA breaches.
  - [x] Configure `nodemailer` with Ethereal Email for local notification testing.

