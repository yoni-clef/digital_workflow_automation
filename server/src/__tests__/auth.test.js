import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// We test the auth handlers by calling them directly with fake req/res objects.
// Store functions are mocked so tests don't need a live database.
// ---------------------------------------------------------------------------

vi.mock('../store.js', () => ({
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
}));

import { getUserByEmail, getUserById, createUser } from '../store.js';
import { register, login, clearSessionCookie, authenticate } from '../auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReqRes(body = {}) {
    const headers = {};
    const res = {
        statusCode: 200,
        body: null,
        headers,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
        setHeader(name, value) { headers[name] = value; },
    };
    const req = { body, headers: {}, ip: '127.0.0.1', get: () => 'test-agent' };
    const next = vi.fn();
    return { req, res, next };
}

function makeFakeUser(overrides = {}) {
    return {
        id: 'user-123',
        displayName: 'Test User',
        email: 'test@example.com',
        passwordHash: null,
        role: 'USER',
        department: '',
        isDepartmentHead: false,
        managerId: null,
        ...overrides,
    };
}

// Arbitraries that produce inputs valid per the Zod registerSchema
const validDisplayName = fc.stringMatching(/^[A-Za-z0-9]{2,20}$/);
const validEmail = fc.tuple(
    fc.stringMatching(/^[a-z]{3,8}$/),
    fc.stringMatching(/^[a-z]{3,8}$/),
    fc.constantFrom('com', 'org', 'net', 'io')
).map(([user, domain, tld]) => `${user}@${domain}.${tld}`);
const validPassword = fc.string({ minLength: 8, maxLength: 20 });

// ---------------------------------------------------------------------------
// 2.2 — Property 1: Registration produces a hashed password
// Feature: digital-approval-workflow, Property 1
// Validates: Requirements 1.1
// ---------------------------------------------------------------------------

describe('Property 1: Registration produces a hashed password', () => {
    // Use cost 4 for speed; spy is set up per-test and restored after
    let hashSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        const realHash = bcrypt.hash.bind(bcrypt);
        hashSpy = vi.spyOn(bcrypt, 'hash').mockImplementation((data, _cost) => realHash(data, 4));
    });

    afterEach(() => {
        hashSpy?.mockRestore();
    });

    it('for any valid registration input, passwordHash is a bcrypt hash of the original password', async () => {
        // Feature: digital-approval-workflow, Property 1
        // Validates: Requirements 1.1
        await fc.assert(
            fc.asyncProperty(
                fc.record({ displayName: validDisplayName, email: validEmail, password: validPassword }),
                async ({ displayName, email, password }) => {
                    getUserByEmail.mockResolvedValue(null);

                    let capturedHash = null;
                    createUser.mockImplementation(async ({ passwordHash, ...rest }) => {
                        capturedHash = passwordHash;
                        return makeFakeUser({ displayName, email, passwordHash, ...rest });
                    });

                    const { req, res, next } = makeReqRes({ displayName, email, password });
                    await register(req, res, next);

                    // Registration must succeed
                    expect(res.statusCode).toBe(200);
                    expect(next).not.toHaveBeenCalled();

                    // passwordHash must be a valid bcrypt hash
                    expect(capturedHash).toBeTruthy();
                    expect(capturedHash).toMatch(/^\$2[ab]\$/);

                    // The hash must verify against the original password
                    const matches = await bcrypt.compare(password, capturedHash);
                    expect(matches).toBe(true);

                    // Raw password must NOT be stored
                    expect(capturedHash).not.toBe(password);
                }
            ),
            { numRuns: 100 }
        );
    }, 60000);

    it('session cookie contains HttpOnly and SameSite=Lax', async () => {
        getUserByEmail.mockResolvedValue(null);
        createUser.mockResolvedValue(makeFakeUser());

        const { req, res, next } = makeReqRes({
            displayName: 'Alice',
            email: 'alice@example.com',
            password: 'password123',
        });
        await register(req, res, next);

        expect(res.statusCode).toBe(200);
        const cookie = res.headers['Set-Cookie'];
        expect(cookie).toBeTruthy();
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
    });
});

// ---------------------------------------------------------------------------
// 2.4 — Property 2: Login round-trip
// Feature: digital-approval-workflow, Property 2
// Validates: Requirements 1.2, 1.3
// ---------------------------------------------------------------------------

describe('Property 2: Login round-trip', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('for any valid password, login with correct password succeeds and wrong password returns 401', async () => {
        // Feature: digital-approval-workflow, Property 2
        // Validates: Requirements 1.2, 1.3
        // Pre-compute hashes outside the property loop to avoid bcrypt cost in each iteration
        const passwords = await Promise.all(
            Array.from({ length: 50 }, (_, i) => `password${i}abcdef`)
                .map(p => bcrypt.hash(p, 4).then(h => ({ password: p, hash: h })))
        );

        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: 49 }),
                async (idx) => {
                    const { password, hash } = passwords[idx];
                    const fakeUser = makeFakeUser({ passwordHash: hash });

                    // correct password succeeds
                    getUserByEmail.mockResolvedValue(fakeUser);
                    const { req: reqOk, res: resOk } = makeReqRes({ email: fakeUser.email, password });
                    await login(reqOk, resOk, vi.fn());
                    expect(resOk.statusCode).toBe(200);
                    expect(resOk.body?.user?.id).toBe(fakeUser.id);

                    // wrong password returns 401 INVALID_CREDENTIALS
                    getUserByEmail.mockResolvedValue(fakeUser);
                    const { req: reqBad, res: resBad } = makeReqRes({ email: fakeUser.email, password: 'wrongpassword!' });
                    await login(reqBad, resBad, vi.fn());
                    expect(resBad.statusCode).toBe(401);
                    expect(resBad.body?.error).toBe('INVALID_CREDENTIALS');
                }
            ),
            { numRuns: 50 }
        );
    }, 60000);

    it('unknown email returns 401 INVALID_CREDENTIALS', async () => {
        getUserByEmail.mockResolvedValue(null);
        const { req, res, next } = makeReqRes({ email: 'nobody@example.com', password: 'somepassword' });
        await login(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body?.error).toBe('INVALID_CREDENTIALS');
    });
});

// ---------------------------------------------------------------------------
// 2.5 — Unit tests for auth edge cases
// Validates: Requirements 1.4, 1.7, 1.8
// ---------------------------------------------------------------------------

describe('Auth edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('duplicate email returns 400 EMAIL_IN_USE', async () => {
        getUserByEmail.mockResolvedValue(makeFakeUser());
        const { req, res, next } = makeReqRes({
            displayName: 'Bob',
            email: 'existing@example.com',
            password: 'password123',
        });
        await register(req, res, next);
        expect(res.statusCode).toBe(400);
        expect(res.body?.error).toBe('EMAIL_IN_USE');
    });

    it('invalid managerId returns 400 INVALID_MANAGER_ID', async () => {
        getUserByEmail.mockResolvedValue(null);
        // Simulate Prisma foreign key violation (P2003)
        const prismaError = new Error('Foreign key constraint failed');
        prismaError.code = 'P2003';
        createUser.mockRejectedValue(prismaError);

        const { req, res, next } = makeReqRes({
            displayName: 'Carol',
            email: 'carol@example.com',
            password: 'password123',
            managerId: 'nonexistent-id',
        });
        await register(req, res, next);
        expect(res.statusCode).toBe(400);
        expect(res.body?.error).toBe('INVALID_MANAGER_ID');
    });

    it('clearSessionCookie sets Max-Age=0', () => {
        const cookie = clearSessionCookie();
        expect(cookie).toContain('Max-Age=0');
    });
});

// ---------------------------------------------------------------------------
// 3.1 — Unit tests: authenticate middleware rejects invalid sessions
// Validates: Requirements 1.5, 1.6
// ---------------------------------------------------------------------------

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'development-only-change-me';

function makeAuthReqRes(cookieHeader = '') {
    const headers = {};
    const res = {
        statusCode: 200,
        body: null,
        headers,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
        setHeader(name, value) { headers[name] = value; },
    };
    const req = {
        headers: cookieHeader ? { cookie: cookieHeader } : {},
        ip: '127.0.0.1',
        get: () => 'test-agent',
    };
    const next = vi.fn();
    return { req, res, next };
}

describe('authenticate middleware — unit tests (Requirements 1.5, 1.6)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 UNAUTHENTICATED when no cookie is present', async () => {
        const { req, res, next } = makeAuthReqRes();
        await authenticate(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body?.error).toBe('UNAUTHENTICATED');
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 INVALID_SESSION for a malformed token', async () => {
        const { req, res, next } = makeAuthReqRes('workflow_session=not.a.valid.jwt');
        await authenticate(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body?.error).toBe('INVALID_SESSION');
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 INVALID_SESSION for a token signed with the wrong secret', async () => {
        const badToken = jwt.sign({ sub: 'user-123' }, 'wrong-secret', { expiresIn: 3600 });
        const { req, res, next } = makeAuthReqRes(`workflow_session=${encodeURIComponent(badToken)}`);
        await authenticate(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body?.error).toBe('INVALID_SESSION');
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 INVALID_SESSION for an expired token', async () => {
        const expiredToken = jwt.sign({ sub: 'user-123' }, SESSION_SECRET, { expiresIn: -1 });
        const { req, res, next } = makeAuthReqRes(`workflow_session=${encodeURIComponent(expiredToken)}`);
        await authenticate(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body?.error).toBe('INVALID_SESSION');
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 USER_NOT_FOUND when user no longer exists in DB', async () => {
        const token = jwt.sign({ sub: 'deleted-user' }, SESSION_SECRET, { expiresIn: 3600 });
        getUserById.mockResolvedValue(null);
        const { req, res, next } = makeAuthReqRes(`workflow_session=${encodeURIComponent(token)}`);
        await authenticate(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body?.error).toBe('USER_NOT_FOUND');
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next() and attaches req.user for a valid token', async () => {
        const fakeUser = makeFakeUser({ id: 'user-abc' });
        const token = jwt.sign({ sub: 'user-abc' }, SESSION_SECRET, { expiresIn: 3600 });
        getUserById.mockResolvedValue(fakeUser);
        const { req, res, next } = makeAuthReqRes(`workflow_session=${encodeURIComponent(token)}`);
        await authenticate(req, res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(req.user).toEqual(fakeUser);
        expect(res.statusCode).toBe(200);
    });
});

// ---------------------------------------------------------------------------
// 3.2 — Property 3: Session authentication resolves to correct user
// Feature: digital-approval-workflow, Property 3
// Validates: Requirements 1.5, 1.6
// ---------------------------------------------------------------------------

describe('Property 3: Session authentication resolves to correct user', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('for any valid JWT, authenticate resolves req.user to the correct user; invalid tokens return 401', async () => {
        // Feature: digital-approval-workflow, Property 3
        // Validates: Requirements 1.5, 1.6
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    userId: fc.stringMatching(/^[a-z0-9]{8,16}$/),
                    displayName: fc.stringMatching(/^[A-Za-z]{2,12}$/),
                }),
                async ({ userId, displayName }) => {
                    vi.clearAllMocks();
                    const fakeUser = makeFakeUser({ id: userId, displayName });

                    // --- valid token: should resolve to correct user ---
                    const validToken = jwt.sign({ sub: userId }, SESSION_SECRET, { expiresIn: 3600 });
                    getUserById.mockResolvedValue(fakeUser);
                    const { req: reqValid, res: resValid, next: nextValid } = makeAuthReqRes(
                        `workflow_session=${encodeURIComponent(validToken)}`
                    );
                    await authenticate(reqValid, resValid, nextValid);
                    expect(nextValid).toHaveBeenCalledOnce();
                    expect(reqValid.user?.id).toBe(userId);

                    // --- invalid token (random garbage): should return 401 ---
                    vi.clearAllMocks();
                    const { req: reqBad, res: resBad, next: nextBad } = makeAuthReqRes(
                        `workflow_session=invalid.garbage.token`
                    );
                    await authenticate(reqBad, resBad, nextBad);
                    expect(resBad.statusCode).toBe(401);
                    expect(resBad.body?.error).toBe('INVALID_SESSION');
                    expect(nextBad).not.toHaveBeenCalled();
                }
            ),
            { numRuns: 100 }
        );
    }, 30000);
});
