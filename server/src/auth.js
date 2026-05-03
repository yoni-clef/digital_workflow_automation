import crypto from 'node:crypto';
import { z } from 'zod';
import { ensureUserByIdentity, getUserById } from './store.js';

const COOKIE_NAME = 'workflow_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

const loginSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(320).optional().or(z.literal('')),
  role: z.enum(['USER', 'REVIEWER', 'APPROVER', 'ADMIN']).default('USER'),
  department: z.string().trim().min(0).max(80).optional().default('')
});

function getSessionSecret() {
  return process.env.SESSION_SECRET ?? 'development-only-change-me';
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function createToken(user) {
  const payload = base64UrlEncode({
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  });
  return `${payload}.${sign(payload)}`;
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

    const [payloadPart, signature] = token.split('.');
    if (!payloadPart || !signature || signature !== sign(payloadPart)) {
      return res.status(401).json({ error: 'INVALID_SESSION' });
    }

    const payload = base64UrlDecode(payloadPart);
    if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }

    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'USER_NOT_FOUND' });

    req.user = user;
    next();
  } catch (err) {
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

export async function devLogin(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);
    const user = await ensureUserByIdentity({
      displayName: body.displayName,
      email: body.email || null,
      role: body.role,
      department: body.department || null
    });

    res.setHeader('Set-Cookie', sessionCookie(createToken(user)));
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
