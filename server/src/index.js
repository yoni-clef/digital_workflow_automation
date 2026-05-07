import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import {
  createRequest,
  delegateRequest,
  getRequestById,
  listRequests,
  transitionRequest,
  updateUser,
  createManagerRequest,
  listManagerRequests,
  approveManagerRequest,
  rejectManagerRequest
} from './store.js';
import { authenticate, clearSessionCookie, register, login } from './auth.js';
import uploadRouter from './upload.js';
import { initCronJobs } from './cron.js';
import path from 'path';

const prisma = new PrismaClient();

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
      role: z.enum(['USER', 'ADMIN']).default('USER'),
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

// Admin-only user management endpoints
app.put('/api/admin/users/:id/role', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const schema = z.object({
      role: z.enum(['USER', 'ADMIN'])
    });

    const body = schema.parse(req.body);
    
    // Prevent removing the last admin
    if (body.role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'CANNOT_REMOVE_LAST_ADMIN' });
      }
    }

    const updatedUser = await updateUser(req.params.id, { role: body.role });
    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
});

app.put('/api/admin/users/:id/manager', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const schema = z.object({
      managerId: z.string().nullable()
    });

    const body = schema.parse(req.body);
    
    // Validate manager exists and is not creating circular relationship
    if (body.managerId) {
      const manager = await prisma.user.findUnique({ where: { id: body.managerId } });
      if (!manager) {
        return res.status(400).json({ error: 'MANAGER_NOT_FOUND' });
      }
      
      // Prevent circular manager relationships
      if (body.managerId === req.params.id) {
        return res.status(400).json({ error: 'CANNOT_BE_OWN_MANAGER' });
      }
      
      // Check for potential circular relationships
      let currentManager = manager;
      while (currentManager.managerId) {
        if (currentManager.managerId === req.params.id) {
          return res.status(400).json({ error: 'CIRCULAR_MANAGER_RELATIONSHIP' });
        }
        currentManager = await prisma.user.findUnique({ where: { id: currentManager.managerId } });
        if (!currentManager) break;
      }
    }

    const updatedUser = await updateUser(req.params.id, { managerId: body.managerId });
    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
});

app.put('/api/admin/users/:id/department-head', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const schema = z.object({
      isDepartmentHead: z.boolean(),
      department: z.string().optional()
    });

    const body = schema.parse(req.body);
    
    // Get user to validate department
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    
    // If making department head, ensure they have a department
    if (body.isDepartmentHead && !user.department && !body.department) {
      return res.status(400).json({ error: 'DEPARTMENT_REQUIRED_FOR_DEPT_HEAD' });
    }

    const updatedUser = await updateUser(req.params.id, { 
      isDepartmentHead: body.isDepartmentHead,
      ...(body.department && { department: body.department })
    });
    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/users', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const users = await prisma.user.findMany({
      include: {
        manager: {
          select: { id: true, displayName: true, email: true }
        },
        subordinates: {
          select: { id: true, displayName: true, email: true }
        }
      },
      orderBy: { displayName: 'asc' }
    });

    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// Manager Request endpoints
app.post('/api/manager-requests', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      requestedManagerId: z.string().optional(),
      reason: z.string().min(1).max(500)
    });

    const body = schema.parse(req.body);
    
    const request = await createManagerRequest({
      userId: req.user.id,
      requestedManagerId: body.requestedManagerId || null,
      reason: body.reason
    });

    res.json({ request });
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/manager-requests', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const requests = await listManagerRequests();
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

app.put('/api/admin/manager-requests/:id/approve', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const schema = z.object({
      managerId: z.string()
    });

    const body = schema.parse(req.body);
    
    const request = await approveManagerRequest(
      req.params.id,
      req.user.id,
      body.managerId
    );

    res.json({ request });
  } catch (err) {
    next(err);
  }
});

app.put('/api/admin/manager-requests/:id/reject', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const schema = z.object({
      reason: z.string().min(1).max(500)
    });

    const body = schema.parse(req.body);
    
    const request = await rejectManagerRequest(
      req.params.id,
      req.user.id,
      body.reason
    );

    res.json({ request });
  } catch (err) {
    next(err);
  }
});

app.put('/api/users/:id', authenticate, async (req, res, next) => {
  try {
    const id = req.params.id;
    const schema = z.object({
      managerId: z.string().nullish(),
      department: z.string().nullish(),
      isDepartmentHead: z.boolean().nullish()
    });

    const body = schema.parse(req.body);
    
    // Only admins can update other users, users can only update themselves
    if (req.user.role !== 'ADMIN' && req.user.id !== id) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const updatedUser = await updateUser(id, body);
    res.json({ user: updatedUser });
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
