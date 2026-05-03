import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import {
  createRequest,
  getRequestById,
  listRequests,
  transitionRequest
} from './store.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/requests', async (req, res, next) => {
  try {
    const items = await listRequests();
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

app.get('/api/requests/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'INVALID_ID' });

    const item = await getRequestById(id);
    if (!item) return res.status(404).json({ error: 'NOT_FOUND' });

    res.json({ item });
  } catch (err) {
    next(err);
  }
});

app.post('/api/requests', async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().min(0).max(5000).optional().default(''),
      createdBy: z.string().trim().min(2).max(80)
    });

    const body = schema.parse(req.body);
    const item = await createRequest({
      ...body,
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

app.post('/api/requests/:id/transition', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'INVALID_ID' });

    const schema = z.object({
      action: z.enum(['REVIEW', 'APPROVE', 'ARCHIVE', 'REJECT']),
      by: z.string().trim().min(2).max(80),
      note: z.string().trim().min(0).max(500).optional()
    });

    const body = schema.parse(req.body);

    const result = await transitionRequest({
      id,
      ...body,
      context: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null
      }
    });
    if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
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
