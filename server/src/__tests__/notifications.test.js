import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @prisma/client
// ---------------------------------------------------------------------------
const mockPrisma = vi.hoisted(() => ({
    workflowRequest: {
        findFirst: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
    },
    user: {
        findFirst: vi.fn(),
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

// ---------------------------------------------------------------------------
// Mock notification.js so we can spy on sendNotification
// ---------------------------------------------------------------------------
const mockSendNotification = vi.hoisted(() => vi.fn());

vi.mock('../notification.js', () => ({
    sendNotification: mockSendNotification,
}));

import { transitionRequest } from '../store.js';

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
        manager: null,
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
        id: 'log-1',
        requestId: 1,
        actorId: 'user-1',
        actor: makeUser(),
        action: 'TRANSITION',
        fromStatus: 'PENDING_MANAGER',
        toStatus: 'PENDING_DEPARTMENT',
        note: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
        ...overrides,
    };
}

// Sets up the $transaction mock with a given existing request and updated request.
// Optionally accepts a deptHead user for PENDING_DEPARTMENT transitions.
function setupTransactionMock({ existingRequest, updatedRequest, deptHead = null }) {
    mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
            workflowRequest: {
                findFirst: vi.fn().mockResolvedValue(existingRequest),
                update: vi.fn().mockResolvedValue(updatedRequest),
                findUnique: vi.fn().mockResolvedValue(updatedRequest),
            },
            user: {
                findFirst: vi.fn().mockResolvedValue(deptHead),
            },
        };
        return fn(tx);
    });
}

// ---------------------------------------------------------------------------
// Task 14.2: Unit tests for notification triggers
// Validates: Requirements 12.1, 12.2, 12.3, 12.4
// ---------------------------------------------------------------------------

describe('Task 14.2: Notification triggers on workflow transitions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSendNotification.mockResolvedValue(undefined);
    });

    // -------------------------------------------------------------------------
    // Requirement 12.1: PENDING_MANAGER → notify submitter's manager
    // -------------------------------------------------------------------------
    describe('Requirement 12.1: transition to PENDING_MANAGER notifies the submitter\'s manager', () => {
        it('sends email to manager when transitioning to PENDING_MANAGER and manager has an email', async () => {
            const manager = makeUser({ id: 'mgr-1', displayName: 'Manager Bob', email: 'manager@example.com' });
            const submitter = makeUser({ id: 'submitter-1', managerId: 'mgr-1', manager });
            // NEEDS_INFO → RESUBMIT → PENDING_MANAGER
            const existingRequest = makeDbRequest({ status: 'NEEDS_INFO', submitter });
            const updatedRequest = makeDbRequest({
                status: 'PENDING_MANAGER',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'NEEDS_INFO', toStatus: 'PENDING_MANAGER' })],
            });

            setupTransactionMock({ existingRequest, updatedRequest });

            const actor = makeUser({ id: 'submitter-1', ...submitter });
            await transitionRequest({ id: 1, action: 'RESUBMIT', user: actor, note: null, context: {} });

            expect(mockSendNotification).toHaveBeenCalledOnce();
            const [to, subject, text] = mockSendNotification.mock.calls[0];
            expect(to).toBe('manager@example.com');
            expect(subject).toBe('Action required: "Test Request" is pending your review');
            expect(text).toContain('Hi Manager Bob');
            expect(text).toContain('A request titled "Test Request"');
            expect(text).toContain('has been submitted by Alice');
            expect(text).toContain('awaiting your review');
        });

        it('does not send email when manager has no email address', async () => {
            const manager = makeUser({ id: 'mgr-1', displayName: 'Manager Bob', email: null });
            const submitter = makeUser({ id: 'submitter-1', managerId: 'mgr-1', manager });
            const existingRequest = makeDbRequest({ status: 'NEEDS_INFO', submitter });
            const updatedRequest = makeDbRequest({
                status: 'PENDING_MANAGER',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'NEEDS_INFO', toStatus: 'PENDING_MANAGER' })],
            });

            setupTransactionMock({ existingRequest, updatedRequest });

            const actor = makeUser({ id: 'submitter-1', ...submitter });
            await transitionRequest({ id: 1, action: 'RESUBMIT', user: actor, note: null, context: {} });

            expect(mockSendNotification).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // Requirement 12.2: PENDING_DEPARTMENT → notify department head
    // -------------------------------------------------------------------------
    describe('Requirement 12.2: transition to PENDING_DEPARTMENT notifies the department head', () => {
        it('sends email to department head when transitioning to PENDING_DEPARTMENT and dept head has an email', async () => {
            const manager = makeUser({ id: 'mgr-1', displayName: 'Manager', email: 'mgr@example.com' });
            const submitter = makeUser({ id: 'submitter-1', managerId: 'mgr-1', department: 'engineering', manager });
            const actor = makeUser({ id: 'mgr-1', ...manager });
            const existingRequest = makeDbRequest({ status: 'PENDING_MANAGER', submitter });
            const updatedRequest = makeDbRequest({
                status: 'PENDING_DEPARTMENT',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'PENDING_MANAGER', toStatus: 'PENDING_DEPARTMENT' })],
            });
            const deptHead = makeUser({ id: 'dh-1', displayName: 'Dept Head', email: 'depthead@example.com', isDepartmentHead: true, department: 'engineering' });

            setupTransactionMock({ existingRequest, updatedRequest, deptHead });

            await transitionRequest({ id: 1, action: 'REVIEW', user: actor, note: null, context: {} });

            expect(mockSendNotification).toHaveBeenCalledOnce();
            const [to, subject, text] = mockSendNotification.mock.calls[0];
            expect(to).toBe('depthead@example.com');
            expect(subject).toBe('Action required: "Test Request" is pending department approval');
            expect(text).toContain('Hi Dept Head');
            expect(text).toContain('A request titled "Test Request"');
            expect(text).toContain('requires department approval');
        });

        it('does not send email when no department head is found', async () => {
            const manager = makeUser({ id: 'mgr-1', displayName: 'Manager', email: 'mgr@example.com' });
            const submitter = makeUser({ id: 'submitter-1', managerId: 'mgr-1', department: 'engineering', manager });
            const actor = makeUser({ id: 'mgr-1', ...manager });
            const existingRequest = makeDbRequest({ status: 'PENDING_MANAGER', submitter });
            const updatedRequest = makeDbRequest({
                status: 'PENDING_DEPARTMENT',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'PENDING_MANAGER', toStatus: 'PENDING_DEPARTMENT' })],
            });

            setupTransactionMock({ existingRequest, updatedRequest, deptHead: null });

            await transitionRequest({ id: 1, action: 'REVIEW', user: actor, note: null, context: {} });

            expect(mockSendNotification).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // Requirement 12.3: APPROVED / REJECTED → notify submitter
    // -------------------------------------------------------------------------
    describe('Requirement 12.3: transition to APPROVED or REJECTED notifies the submitter', () => {
        it('sends email to submitter when request is APPROVED', async () => {
            const submitter = makeUser({ id: 'submitter-1', email: 'submitter@example.com', department: 'engineering', manager: null });
            const deptHead = makeUser({ id: 'dh-1', isDepartmentHead: true, department: 'engineering' });
            const actor = makeUser({ id: 'dh-1', ...deptHead });
            const existingRequest = makeDbRequest({ status: 'PENDING_DEPARTMENT', submitter });
            const updatedRequest = makeDbRequest({
                status: 'APPROVED',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'PENDING_DEPARTMENT', toStatus: 'APPROVED' })],
            });

            setupTransactionMock({ existingRequest, updatedRequest });

            await transitionRequest({ id: 1, action: 'APPROVE', user: actor, note: null, context: {} });

            expect(mockSendNotification).toHaveBeenCalledOnce();
            const [to, subject, text] = mockSendNotification.mock.calls[0];
            expect(to).toBe('submitter@example.com');
            expect(subject).toBe('Your request "Test Request" has been approved');
            expect(text).toContain('Hi Alice');
            expect(text).toContain('has been approved.');
            expect(text).toContain('Please log in to the workflow system for more details');
        });

        it('sends email to submitter when request is REJECTED', async () => {
            const manager = makeUser({ id: 'mgr-1', email: 'mgr@example.com' });
            const submitter = makeUser({ id: 'submitter-1', email: 'submitter@example.com', managerId: 'mgr-1', manager });
            const actor = makeUser({ id: 'mgr-1', ...manager });
            const existingRequest = makeDbRequest({ status: 'PENDING_MANAGER', submitter });
            const updatedRequest = makeDbRequest({
                status: 'REJECTED',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'PENDING_MANAGER', toStatus: 'REJECTED' })],
            });

            setupTransactionMock({ existingRequest, updatedRequest });

            await transitionRequest({ id: 1, action: 'REJECT', user: actor, note: null, context: {} });

            expect(mockSendNotification).toHaveBeenCalledOnce();
            const [to, subject, text] = mockSendNotification.mock.calls[0];
            expect(to).toBe('submitter@example.com');
            expect(subject).toBe('Your request "Test Request" has been rejected');
            expect(text).toContain('Hi Alice');
            expect(text).toContain('has been rejected.');
            expect(text).toContain('Please log in to the workflow system for more details');
        });

        it('does not send email when submitter has no email address', async () => {
            const submitter = makeUser({ id: 'submitter-1', email: null, department: 'engineering', manager: null });
            const deptHead = makeUser({ id: 'dh-1', isDepartmentHead: true, department: 'engineering' });
            const actor = makeUser({ id: 'dh-1', ...deptHead });
            const existingRequest = makeDbRequest({ status: 'PENDING_DEPARTMENT', submitter });
            const updatedRequest = makeDbRequest({
                status: 'APPROVED',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'PENDING_DEPARTMENT', toStatus: 'APPROVED' })],
            });

            setupTransactionMock({ existingRequest, updatedRequest });

            await transitionRequest({ id: 1, action: 'APPROVE', user: actor, note: null, context: {} });

            expect(mockSendNotification).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // Requirement 12.4: email failure does not prevent transition from completing
    // -------------------------------------------------------------------------
    describe('Requirement 12.4: email failure does not abort the workflow transition', () => {
        it('transition completes successfully even when sendNotification throws', async () => {
            mockSendNotification.mockRejectedValue(new Error('SMTP connection refused'));

            const submitter = makeUser({ id: 'submitter-1', email: 'submitter@example.com', department: 'engineering', manager: null });
            const deptHead = makeUser({ id: 'dh-1', isDepartmentHead: true, department: 'engineering' });
            const actor = makeUser({ id: 'dh-1', ...deptHead });
            const existingRequest = makeDbRequest({ status: 'PENDING_DEPARTMENT', submitter });
            const updatedRequest = makeDbRequest({
                status: 'APPROVED',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'PENDING_DEPARTMENT', toStatus: 'APPROVED' })],
            });

            setupTransactionMock({ existingRequest, updatedRequest });

            const result = await transitionRequest({ id: 1, action: 'APPROVE', user: actor, note: null, context: {} });

            // Transition must succeed despite the email error
            expect(result.error).toBeUndefined();
            expect(result.request).toBeDefined();
            expect(result.request.status).toBe('APPROVED');
        });

        it('transition to PENDING_DEPARTMENT completes even when sendNotification throws', async () => {
            mockSendNotification.mockRejectedValue(new Error('Network timeout'));

            const manager = makeUser({ id: 'mgr-1', email: 'mgr@example.com' });
            const submitter = makeUser({ id: 'submitter-1', managerId: 'mgr-1', department: 'engineering', manager });
            const actor = makeUser({ id: 'mgr-1', ...manager });
            const existingRequest = makeDbRequest({ status: 'PENDING_MANAGER', submitter });
            const updatedRequest = makeDbRequest({
                status: 'PENDING_DEPARTMENT',
                submitter,
                history: [makeHistoryEntry({ fromStatus: 'PENDING_MANAGER', toStatus: 'PENDING_DEPARTMENT' })],
            });
            const deptHead = makeUser({ id: 'dh-1', email: 'depthead@example.com', isDepartmentHead: true, department: 'engineering' });

            setupTransactionMock({ existingRequest, updatedRequest, deptHead });

            const result = await transitionRequest({ id: 1, action: 'REVIEW', user: actor, note: null, context: {} });

            expect(result.error).toBeUndefined();
            expect(result.request).toBeDefined();
            expect(result.request.status).toBe('PENDING_DEPARTMENT');
        });
    });
});
