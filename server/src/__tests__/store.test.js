import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock @prisma/client using vi.hoisted so the instance is available both
// inside the vi.mock factory (hoisted) and in the test body.
// ---------------------------------------------------------------------------

const mockPrisma = vi.hoisted(() => ({
    workflowRequest: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
    },
    $transaction: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
    PrismaClient: class {
        constructor() {
            return mockPrisma;
        }
    },
}));

import {
    createRequest,
    transitionRequest,
    delegateRequest,
    listRequests,
} from '../store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides = {}) {
    return {
        id: 'user-1',
        displayName: 'Alice',
        email: 'alice@example.com',
        role: 'USER',
        department: 'engineering',
        isDepartmentHead: false,
        managerId: null,
        ...overrides,
    };
}

function makeDbRequest(overrides = {}) {
    const submitter = overrides.submitter ?? makeUser({ id: 'submitter-1' });
    return {
        id: 1,
        title: 'Test Request',
        description: '',
        category: 'GENERAL',
        amountCents: null,
        status: 'PENDING_MANAGER',
        isDeleted: false,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
        submitterId: submitter.id,
        submitter,
        assignedToId: null,
        assignedTo: null,
        history: [],
        attachments: [],
        ...overrides,
    };
}

function makeHistoryEntry(overrides = {}) {
    return {
        id: `log-${Math.random().toString(36).slice(2)}`,
        requestId: 1,
        actorId: 'user-1',
        actor: makeUser(),
        action: 'TRANSITION',
        fromStatus: 'PENDING_MANAGER',
        toStatus: 'PENDING_DEPARTMENT',
        note: null,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Task 7.1 — Verify audit log fields in write paths
// Validates: Requirements 6.1
// ---------------------------------------------------------------------------

describe('Task 7.1: Audit log entries contain required fields', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('createRequest passes ipAddress and userAgent to history.create', async () => {
        const user = makeUser({ id: 'submitter-1', managerId: 'mgr-1' });
        const context = { ipAddress: '10.0.0.1', userAgent: 'Mozilla/5.0' };

        const createdRequest = makeDbRequest({
            submitter: user,
            status: 'PENDING_MANAGER',
            history: [
                makeHistoryEntry({
                    action: 'CREATE',
                    fromStatus: null,
                    toStatus: 'PENDING_MANAGER',
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                }),
            ],
        });

        mockPrisma.workflowRequest.create.mockResolvedValue(createdRequest);

        await createRequest({
            title: 'My Request',
            description: '',
            category: 'GENERAL',
            amountCents: null,
            user,
            context,
        });

        const createCall = mockPrisma.workflowRequest.create.mock.calls[0][0];
        const historyCreate = createCall.data.history.create[0];

        expect(historyCreate.ipAddress).toBe(context.ipAddress);
        expect(historyCreate.userAgent).toBe(context.userAgent);
        expect(historyCreate.action).toBe('CREATE');
        expect(historyCreate.actorId).toBe(user.id);
    });

    it('transitionRequest passes ipAddress and userAgent to history.create', async () => {
        const user = makeUser({ id: 'mgr-1' });
        const context = { ipAddress: '192.168.1.1', userAgent: 'curl/7.0' };
        const existingRequest = makeDbRequest({
            status: 'PENDING_MANAGER',
            submitter: makeUser({ id: 'submitter-1', managerId: 'mgr-1' }),
        });
        const updatedRequest = makeDbRequest({
            status: 'PENDING_DEPARTMENT',
            submitter: makeUser({ id: 'submitter-1', managerId: 'mgr-1' }),
            history: [makeHistoryEntry({ action: 'TRANSITION', fromStatus: 'PENDING_MANAGER', toStatus: 'PENDING_DEPARTMENT' })],
        });

        let capturedUpdateData = null;
        mockPrisma.$transaction.mockImplementation(async (fn) => {
            const tx = {
                workflowRequest: {
                    findFirst: vi.fn().mockResolvedValue(existingRequest),
                    update: vi.fn().mockImplementation(async (args) => {
                        capturedUpdateData = args;
                        return updatedRequest;
                    }),
                    findUnique: vi.fn().mockResolvedValue(updatedRequest),
                },
            };
            return fn(tx);
        });

        await transitionRequest({ id: 1, action: 'REVIEW', user, note: null, context });

        const historyCreate = capturedUpdateData.data.history.create;
        expect(historyCreate.ipAddress).toBe(context.ipAddress);
        expect(historyCreate.userAgent).toBe(context.userAgent);
        expect(historyCreate.action).toBe('TRANSITION');
        expect(historyCreate.actorId).toBe(user.id);
    });

    it('delegateRequest passes ipAddress and userAgent to history.create', async () => {
        const user = makeUser({ id: 'mgr-1' });
        const context = { ipAddress: '172.16.0.1', userAgent: 'PostmanRuntime/7.0' };
        const existingRequest = makeDbRequest({
            status: 'PENDING_MANAGER',
            submitter: makeUser({ id: 'submitter-1', managerId: 'mgr-1' }),
        });
        const targetUser = makeUser({ id: 'delegate-1', displayName: 'Bob', email: 'bob@example.com' });
        const updatedRequest = makeDbRequest({
            status: 'PENDING_MANAGER',
            assignedToId: 'delegate-1',
            assignedTo: targetUser,
            submitter: makeUser({ id: 'submitter-1', managerId: 'mgr-1' }),
            history: [makeHistoryEntry({ action: 'DELEGATE', fromStatus: 'PENDING_MANAGER', toStatus: 'PENDING_MANAGER' })],
        });

        let capturedUpdateData = null;
        mockPrisma.$transaction.mockImplementation(async (fn) => {
            const tx = {
                workflowRequest: {
                    findFirst: vi.fn().mockResolvedValue(existingRequest),
                    update: vi.fn().mockImplementation(async (args) => {
                        capturedUpdateData = args;
                        return updatedRequest;
                    }),
                    findUnique: vi.fn().mockResolvedValue(updatedRequest),
                },
                user: {
                    findUnique: vi.fn().mockResolvedValue(null),
                    findFirst: vi.fn().mockResolvedValue(null),
                    create: vi.fn().mockResolvedValue(targetUser),
                    update: vi.fn().mockResolvedValue(targetUser),
                },
            };
            return fn(tx);
        });

        await delegateRequest({
            id: 1,
            assignee: { displayName: 'Bob', email: 'bob@example.com', role: 'USER' },
            user,
            note: null,
            context,
        });

        const historyCreate = capturedUpdateData.data.history.create;
        expect(historyCreate.ipAddress).toBe(context.ipAddress);
        expect(historyCreate.userAgent).toBe(context.userAgent);
        expect(historyCreate.action).toBe('DELEGATE');
        expect(historyCreate.actorId).toBe(user.id);
    });
});

// ---------------------------------------------------------------------------
// Property 8: Audit log grows on every action
// Feature: digital-approval-workflow, Property 8
// Validates: Requirements 6.1, 6.3
// ---------------------------------------------------------------------------

describe('Property 8: Audit log grows on every action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('for any N history entries, the API response history has exactly N entries ordered by createdAt ascending', async () => {
        // Feature: digital-approval-workflow, Property 8
        // Validates: Requirements 6.1, 6.3
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 10 }),
                async (n) => {
                    vi.clearAllMocks();
                    const baseTime = Date.now();

                    // Build N history entries with strictly increasing createdAt timestamps
                    const historyEntries = Array.from({ length: n }, (_, i) =>
                        makeHistoryEntry({
                            id: `log-${i}`,
                            action: i === 0 ? 'CREATE' : 'TRANSITION',
                            fromStatus: i === 0 ? null : 'PENDING_MANAGER',
                            toStatus: i === 0 ? 'PENDING_MANAGER' : 'PENDING_DEPARTMENT',
                            createdAt: new Date(baseTime + i * 1000),
                        })
                    );

                    const dbRequest = makeDbRequest({ history: historyEntries });
                    mockPrisma.workflowRequest.findMany.mockResolvedValue([dbRequest]);

                    const user = makeUser({ id: 'admin-1', role: 'ADMIN' });
                    const results = await listRequests({ user });

                    // history.length must equal N
                    if (results[0].history.length !== n) return false;

                    // entries must be ordered by createdAt ascending
                    const history = results[0].history;
                    for (let i = 1; i < history.length; i++) {
                        if (new Date(history[i].at) < new Date(history[i - 1].at)) return false;
                    }

                    return true;
                }
            ),
            { numRuns: 200 }
        );
    });

    it('history entries contain correct action, fromStatus, toStatus fields', async () => {
        const user = makeUser({ id: 'admin-1', role: 'ADMIN' });
        const historyEntries = [
            makeHistoryEntry({ id: 'log-0', action: 'CREATE', fromStatus: null, toStatus: 'PENDING_MANAGER', actorId: 'submitter-1', actor: makeUser({ id: 'submitter-1', displayName: 'Submitter' }) }),
            makeHistoryEntry({ id: 'log-1', action: 'TRANSITION', fromStatus: 'PENDING_MANAGER', toStatus: 'PENDING_DEPARTMENT', actorId: 'mgr-1', actor: makeUser({ id: 'mgr-1', displayName: 'Manager' }) }),
        ];

        const dbRequest = makeDbRequest({ history: historyEntries });
        mockPrisma.workflowRequest.findMany.mockResolvedValue([dbRequest]);

        const results = await listRequests({ user });

        expect(results[0].history).toHaveLength(2);
        expect(results[0].history[0].action).toBe('CREATE');
        expect(results[0].history[0].from).toBeNull();
        expect(results[0].history[0].to).toBe('PENDING_MANAGER');
        expect(results[0].history[1].action).toBe('TRANSITION');
        expect(results[0].history[1].from).toBe('PENDING_MANAGER');
        expect(results[0].history[1].to).toBe('PENDING_DEPARTMENT');
    });
});

// ---------------------------------------------------------------------------
// Property 9: Soft-delete hides requests from list
// Feature: digital-approval-workflow, Property 9
// Validates: Requirements 6.4
// ---------------------------------------------------------------------------

describe('Property 9: Soft-delete hides requests from list', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('for any user (including ADMIN), listRequests always passes isDeleted: false to Prisma', () => {
        // Feature: digital-approval-workflow, Property 9
        // Validates: Requirements 6.4
        fc.assert(
            fc.property(
                fc.record({
                    id: fc.constantFrom('user-a', 'user-b', 'admin-1'),
                    role: fc.constantFrom('USER', 'ADMIN'),
                    isDepartmentHead: fc.boolean(),
                    department: fc.constantFrom('engineering', 'finance', 'hr'),
                }),
                (userBase) => {
                    vi.clearAllMocks();
                    const user = makeUser(userBase);
                    mockPrisma.workflowRequest.findMany.mockResolvedValue([]);

                    listRequests({ user });

                    const callArgs = mockPrisma.workflowRequest.findMany.mock.calls[0]?.[0];
                    if (!callArgs) return false;

                    return callArgs.where?.isDeleted === false;
                }
            ),
            { numRuns: 200 }
        );
    });

    it('ADMIN listRequests where clause includes isDeleted: false', async () => {
        const admin = makeUser({ id: 'admin-1', role: 'ADMIN' });
        mockPrisma.workflowRequest.findMany.mockResolvedValue([]);

        await listRequests({ user: admin });

        const callArgs = mockPrisma.workflowRequest.findMany.mock.calls[0][0];
        expect(callArgs.where.isDeleted).toBe(false);
    });

    it('regular user listRequests where clause includes isDeleted: false', async () => {
        const user = makeUser({ id: 'user-1', role: 'USER' });
        mockPrisma.workflowRequest.findMany.mockResolvedValue([]);

        await listRequests({ user });

        const callArgs = mockPrisma.workflowRequest.findMany.mock.calls[0][0];
        expect(callArgs.where.isDeleted).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Property 10: isOverdue flag is accurate
// Feature: digital-approval-workflow, Property 10
// Validates: Requirements 7.1
// ---------------------------------------------------------------------------

describe('Property 10: isOverdue flag is accurate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const ALL_STATUSES = ['PENDING_MANAGER', 'PENDING_DEPARTMENT', 'NEEDS_INFO', 'APPROVED', 'ARCHIVED', 'REJECTED'];
    const ACTIVE_STATUSES = ['PENDING_MANAGER', 'PENDING_DEPARTMENT'];

    it('for any request with dueAt in the past and an active status, isOverdue is true', async () => {
        // Feature: digital-approval-workflow, Property 10
        // Validates: Requirements 7.1
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...ACTIVE_STATUSES),
                async (status) => {
                    vi.clearAllMocks();
                    const pastDueAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
                    const dbRequest = makeDbRequest({ status, dueAt: pastDueAt });
                    mockPrisma.workflowRequest.findMany.mockResolvedValue([dbRequest]);

                    const user = makeUser({ id: 'admin-1', role: 'ADMIN' });
                    const results = await listRequests({ user });

                    return results[0].isOverdue === true;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('for any request with dueAt in the future, isOverdue is false regardless of status', async () => {
        // Feature: digital-approval-workflow, Property 10
        // Validates: Requirements 7.1
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...ALL_STATUSES),
                async (status) => {
                    vi.clearAllMocks();
                    const futureDueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
                    const dbRequest = makeDbRequest({ status, dueAt: futureDueAt });
                    mockPrisma.workflowRequest.findMany.mockResolvedValue([dbRequest]);

                    const user = makeUser({ id: 'admin-1', role: 'ADMIN' });
                    const results = await listRequests({ user });

                    return results[0].isOverdue === false;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('for any request with a non-active status and past dueAt, isOverdue is false', async () => {
        // Feature: digital-approval-workflow, Property 10
        // Validates: Requirements 7.1
        const nonActiveStatuses = ALL_STATUSES.filter(s => !ACTIVE_STATUSES.includes(s));
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...nonActiveStatuses),
                async (status) => {
                    vi.clearAllMocks();
                    const pastDueAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const dbRequest = makeDbRequest({ status, dueAt: pastDueAt });
                    mockPrisma.workflowRequest.findMany.mockResolvedValue([dbRequest]);

                    const user = makeUser({ id: 'admin-1', role: 'ADMIN' });
                    const results = await listRequests({ user });

                    return results[0].isOverdue === false;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('for any request with dueAt = null, isOverdue is false', async () => {
        // Feature: digital-approval-workflow, Property 10
        // Validates: Requirements 7.1
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...ALL_STATUSES),
                async (status) => {
                    vi.clearAllMocks();
                    const dbRequest = makeDbRequest({ status, dueAt: null });
                    mockPrisma.workflowRequest.findMany.mockResolvedValue([dbRequest]);

                    const user = makeUser({ id: 'admin-1', role: 'ADMIN' });
                    const results = await listRequests({ user });

                    return results[0].isOverdue === false;
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ---------------------------------------------------------------------------
// Property 11: Delegation sets assignedToId
// Feature: digital-approval-workflow, Property 11
// Validates: Requirements 5.1
// ---------------------------------------------------------------------------

describe('Property 11: Delegation sets assignedToId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const DELEGATABLE_STATUSES = ['PENDING_MANAGER', 'PENDING_DEPARTMENT', 'NEEDS_INFO', 'APPROVED'];
    const TERMINAL_STATUSES = ['ARCHIVED', 'REJECTED'];

    it('for any valid delegation, assignedToId equals the target user id after delegation', async () => {
        // Feature: digital-approval-workflow, Property 11
        // Validates: Requirements 5.1
        // Note: NEEDS_INFO is excluded here because only assignedTo/ADMIN can delegate it;
        // the RBAC matrix does not grant managers DELEGATE on NEEDS_INFO.
        const MANAGER_DELEGATABLE = ['PENDING_MANAGER'];
        const DEPTHEAD_DELEGATABLE = ['PENDING_DEPARTMENT', 'APPROVED'];

        await fc.assert(
            fc.asyncProperty(
                fc.oneof(
                    fc.record({ status: fc.constantFrom(...MANAGER_DELEGATABLE), actorType: fc.constant('manager') }),
                    fc.record({ status: fc.constantFrom(...DEPTHEAD_DELEGATABLE), actorType: fc.constant('depthead') }),
                ),
                fc.record({
                    displayName: fc.string({ minLength: 2, maxLength: 40 }),
                    email: fc.emailAddress(),
                }),
                async ({ status, actorType }, assigneeInput) => {
                    vi.clearAllMocks();

                    const isDeptHead = actorType === 'depthead';
                    const actor = makeUser({
                        id: 'actor-1',
                        department: 'engineering',
                        isDepartmentHead: isDeptHead,
                        managerId: null,
                    });
                    const submitter = makeUser({
                        id: 'submitter-1',
                        managerId: isDeptHead ? null : 'actor-1',
                        department: 'engineering',
                    });
                    const existingRequest = makeDbRequest({ status, submitter });

                    const targetUserId = `delegate-${Math.random().toString(36).slice(2)}`;
                    const targetUser = makeUser({
                        id: targetUserId,
                        displayName: assigneeInput.displayName,
                        email: assigneeInput.email,
                    });

                    const updatedRequest = makeDbRequest({
                        status,
                        submitter,
                        assignedToId: targetUserId,
                        assignedTo: targetUser,
                        history: [
                            makeHistoryEntry({
                                action: 'DELEGATE',
                                fromStatus: status,
                                toStatus: status,
                            }),
                        ],
                    });

                    mockPrisma.$transaction.mockImplementation(async (fn) => {
                        const tx = {
                            workflowRequest: {
                                findFirst: vi.fn().mockResolvedValue(existingRequest),
                                update: vi.fn().mockResolvedValue(updatedRequest),
                                findUnique: vi.fn().mockResolvedValue(updatedRequest),
                            },
                            user: {
                                findUnique: vi.fn().mockResolvedValue(null),
                                findFirst: vi.fn().mockResolvedValue(null),
                                create: vi.fn().mockResolvedValue(targetUser),
                                update: vi.fn().mockResolvedValue(targetUser),
                            },
                        };
                        return fn(tx);
                    });

                    const result = await delegateRequest({
                        id: 1,
                        assignee: {
                            displayName: assigneeInput.displayName,
                            email: assigneeInput.email,
                            role: 'USER',
                        },
                        user: actor,
                        note: null,
                        context: {},
                    });

                    // No error
                    if (result.error) return false;
                    // assignedTo must be set to the target user
                    if (!result.request.assignedTo) return false;
                    if (result.request.assignedTo.id !== targetUserId) return false;

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('delegation on ARCHIVED or REJECTED request returns INVALID_TRANSITION', async () => {
        // Feature: digital-approval-workflow, Property 11
        // Validates: Requirements 5.3
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...TERMINAL_STATUSES),
                async (status) => {
                    vi.clearAllMocks();

                    const actor = makeUser({ id: 'mgr-1' });
                    const submitter = makeUser({ id: 'submitter-1', managerId: 'mgr-1' });
                    const existingRequest = makeDbRequest({ status, submitter });

                    mockPrisma.$transaction.mockImplementation(async (fn) => {
                        const tx = {
                            workflowRequest: {
                                findFirst: vi.fn().mockResolvedValue(existingRequest),
                                update: vi.fn(),
                                findUnique: vi.fn(),
                            },
                            user: {
                                findUnique: vi.fn().mockResolvedValue(null),
                                findFirst: vi.fn().mockResolvedValue(null),
                                create: vi.fn(),
                                update: vi.fn(),
                            },
                        };
                        return fn(tx);
                    });

                    const result = await delegateRequest({
                        id: 1,
                        assignee: { displayName: 'Delegate', email: 'delegate@example.com', role: 'USER' },
                        user: actor,
                        note: null,
                        context: {},
                    });

                    return result.error === 'INVALID_TRANSITION';
                }
            ),
            { numRuns: 100 }
        );
    });
});
