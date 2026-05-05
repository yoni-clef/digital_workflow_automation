import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import {
  createRequest,
  delegateRequest,
  getRequestById,
  listRequests,
  transitionRequest
} from './store.js';
import { authenticate, clearSessionCookie, register, login } from './auth.js';
import uploadRouter from './upload.js';
import { initCronJobs } from './cron.js';
import path from 'path';

initCronJobs();

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', uploadRouter);
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
});

app.get('/api/session', authenticate, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/requests', authenticate, async (req, res, next) => {
  try {
    const items = await listRequests({ user: req.user });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

app.get('/api/requests/:id', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'INVALID_ID' });

    const item = await getRequestById(id, { user: req.user });
    if (!item) return res.status(404).json({ error: 'NOT_FOUND' });

    res.json({ item });
  } catch (err) {
    next(err);
  }
});

app.post('/api/requests', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().min(0).max(5000).optional().default(''),
      category: z.enum(['GENERAL', 'HARDWARE', 'SOFTWARE', 'FINANCE', 'HR']).default('GENERAL'),
      amountCents: z.number().int().nonnegative().max(100000000).optional()
    });

    const body = schema.parse(req.body);
    const item = await createRequest({
      ...body,
      user: req.user,
      context: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null
      }
    });
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

app.post('/api/requests/:id/transition', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'INVALID_ID' });

    const schema = z.object({
      action: z.enum(['REVIEW', 'APPROVE', 'ARCHIVE', 'REQUEST_INFO', 'RESUBMIT', 'REJECT']),
      note: z.string().trim().min(0).max(500).optional()
    });

    const body = schema.parse(req.body);

    const result = await transitionRequest({
      id,
      ...body,
      user: req.user,
      context: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null
      }
    });
    if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (result.error === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
    if (result.error === 'INVALID_TRANSITION') {
      return res.status(409).json({ error: 'INVALID_TRANSITION', ...result.details });
    }

    res.json({ item: result.request });
  } catch (err) {
    next(err);
  }
});

app.post('/api/requests/:id/delegate', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'INVALID_ID' });

    const schema = z.object({
      displayName: z.string().trim().min(2).max(80),
      email: z.string().trim().email().max(320).optional().or(z.literal('')),
      role: z.enum(['REVIEWER', 'APPROVER']).default('REVIEWER'),
      department: z.string().trim().min(0).max(80).optional().default(''),
      note: z.string().trim().min(0).max(500).optional()
    });

    const body = schema.parse(req.body);
    const result = await delegateRequest({
      id,
      assignee: {
        displayName: body.displayName,
        email: body.email || null,
        role: body.role,
        department: body.department || null
      },
      note: body.note,
      user: req.user,
      context: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null
      }
    });

    if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (result.error === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
    if (result.error === 'INVALID_TRANSITION') {
      return res.status(409).json({ error: 'INVALID_TRANSITION', ...result.details });
    }

    res.json({ item: result.request });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  if (err && err.name === 'ZodError') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', issues: err.issues });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`workflow-server listening on http://localhost:${port}`);
});
