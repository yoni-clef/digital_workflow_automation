import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { getUserById, getUserByEmail, createUser } from './store.js';

const COOKIE_NAME = 'workflow_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(8),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  department: z.string().trim().min(0).max(80).optional().default(''),
  isDepartmentHead: z.boolean().optional().default(false),
  managerId: z.string().optional().nullable()
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string()
});

function getSessionSecret() {
  return process.env.SESSION_SECRET ?? 'development-only-change-me';
}

function createToken(user) {
  return jwt.sign({ sub: user.id }, getSessionSecret(), {
    expiresIn: SESSION_TTL_SECONDS
  });
}

function parseCookies(header) {
  return Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        return idx === -1 ? [part, ''] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function sessionCookie(value, maxAge = SESSION_TTL_SECONDS) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}

export async function authenticate(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    const payload = jwt.verify(token, getSessionSecret());
    if (!payload.sub) {
      return res.status(401).json({ error: 'INVALID_SESSION' });
    }

    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'USER_NOT_FOUND' });

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'INVALID_SESSION' });
    }
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
    next();
  };
}

export async function register(req, res, next) {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await getUserByEmail(body.email);
    if (existing) {
      return res.status(400).json({ error: 'EMAIL_IN_USE' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await createUser({
      displayName: body.displayName,
      email: body.email,
      passwordHash,
      role: body.role,
      department: body.department,
      isDepartmentHead: body.isDepartmentHead,
      managerId: body.managerId || null
    });

    res.setHeader('Set-Cookie', sessionCookie(createToken(user)));
    res.json({ user: { id: user.id, displayName: user.displayName, email: user.email, role: user.role, department: user.department, isDepartmentHead: user.isDepartmentHead, managerId: user.managerId } });
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(400).json({ error: 'INVALID_MANAGER_ID', message: 'The provided Manager ID does not exist.' });
    }
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);
    const user = await getUserByEmail(body.email);
    
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const isValid = await bcrypt.compare(body.password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    res.setHeader('Set-Cookie', sessionCookie(createToken(user)));
    res.json({ user: { id: user.id, displayName: user.displayName, email: user.email, role: user.role, department: user.department, isDepartmentHead: user.isDepartmentHead, managerId: user.managerId } });
  } catch (err) {
    next(err);
  }
}
