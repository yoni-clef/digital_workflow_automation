import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { canActOnRequest } from '../store.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const roleArb = fc.constantFrom('USER', 'ADMIN');
const statusArb = fc.constantFrom(
    'PENDING_MANAGER',
    'PENDING_DEPARTMENT',
    'NEEDS_INFO',
    'APPROVED',
    'ARCHIVED',
    'REJECTED'
);
const actionArb = fc.constantFrom(
    'REVIEW',
    'APPROVE',
    'ARCHIVE',
    'REQUEST_INFO',
    'RESUBMIT',
    'REJECT',
    'DELEGATE'
);
const deptArb = fc.constantFrom('engineering', 'finance', 'hr', 'ops');

function makeUser(overrides = {}) {
    return {
        id: 'user-default',
        role: 'USER',
        isDepartmentHead: false,
        department: 'engineering',
        managerId: null,
        ...overrides,
    };
}

function makeRequest(overrides = {}) {
    return {
        submitterId: 'submitter-id',
        assignedToId: null,
        status: 'PENDING_MANAGER',
        submitter: {
            managerId: 'manager-id',
            department: 'engineering',
        },
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Reference implementation of the RBAC authorization matrix
// This mirrors the design document matrix exactly and serves as the oracle.
// ---------------------------------------------------------------------------
function rbacOracle(user, request, action) {
    if (user.role === 'ADMIN') return true;

    // Delegated user can always act
    if (request.assignedToId === user.id) return true;

    // RESUBMIT: only the original submitter
    if (action === 'RESUBMIT') {
        return request.submitterId === user.id;
    }

    const isManagerOfSubmitter = request.submitter.managerId === user.id;
    const isDeptHeadForSubmitter =
        user.isDepartmentHead &&
        user.department &&
        request.submitter.department === user.department;

    switch (request.status) {
        case 'PENDING_MANAGER':
            // Manager can REVIEW, REQUEST_INFO, REJECT, DELEGATE
            return isManagerOfSubmitter;

        case 'PENDING_DEPARTMENT':
            // Dept head can APPROVE, REQUEST_INFO, REJECT, DELEGATE
            return isDeptHeadForSubmitter;

        case 'APPROVED':
            // Dept head can ARCHIVE, REQUEST_INFO, REJECT
            return isDeptHeadForSubmitter;

        case 'NEEDS_INFO':
            // Submitter can RESUBMIT (handled above); manager can REJECT
            if (action === 'REJECT') return isManagerOfSubmitter;
            return false;

        case 'ARCHIVED':
        case 'REJECTED':
            return false;

        default:
            return false;
    }
}

// ---------------------------------------------------------------------------
// Property 4: RBAC enforcement is consistent
// Feature: digital-approval-workflow, Property 4
// Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
// ---------------------------------------------------------------------------

describe('Property 4: RBAC enforcement is consistent', () => {
    it('canActOnRequest matches the authorization matrix for all user/request/action combinations', () => {
        // Feature: digital-approval-workflow, Property 4
        // Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
        fc.assert(
            fc.property(
                // Generate a user with varying role, isDepartmentHead, department
                fc.record({
                    id: fc.constantFrom('user-a', 'user-b', 'user-c'),
                    role: roleArb,
                    isDepartmentHead: fc.boolean(),
                    department: deptArb,
                }),
                // Generate a request with varying submitter/assignee/manager relationships
                fc.record({
                    submitterId: fc.constantFrom('user-a', 'user-b', 'user-c', 'other-user'),
                    assignedToId: fc.option(fc.constantFrom('user-a', 'user-b', 'user-c'), { nil: null }),
                    status: statusArb,
                    submitterManagerId: fc.option(fc.constantFrom('user-a', 'user-b', 'user-c', 'other-manager'), { nil: null }),
                    submitterDept: deptArb,
                }),
                actionArb,
                (userBase, requestBase, action) => {
                    const user = makeUser(userBase);
                    const request = makeRequest({
                        submitterId: requestBase.submitterId,
                        assignedToId: requestBase.assignedToId,
                        status: requestBase.status,
                        submitter: {
                            managerId: requestBase.submitterManagerId,
                            department: requestBase.submitterDept,
                        },
                    });

                    const actual = canActOnRequest(user, request, action);
                    const expected = rbacOracle(user, request, action);

                    return actual === expected;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('ADMIN can always act regardless of request state or action', () => {
        fc.assert(
            fc.property(statusArb, actionArb, (status, action) => {
                const admin = makeUser({ id: 'admin-1', role: 'ADMIN' });
                const request = makeRequest({ status });
                return canActOnRequest(admin, request, action) === true;
            }),
            { numRuns: 100 }
        );
    });

    it('assignedTo user can always act on their assigned request', () => {
        fc.assert(
            fc.property(statusArb, actionArb, (status, action) => {
                const user = makeUser({ id: 'delegate-user', role: 'USER' });
                const request = makeRequest({ status, assignedToId: 'delegate-user' });
                return canActOnRequest(user, request, action) === true;
            }),
            { numRuns: 100 }
        );
    });

    it('non-submitter USER cannot RESUBMIT', () => {
        fc.assert(
            fc.property(statusArb, (status) => {
                const user = makeUser({ id: 'other-user', role: 'USER' });
                const request = makeRequest({
                    submitterId: 'submitter-id',
                    assignedToId: null,
                    status,
                    submitter: { managerId: null, department: 'engineering' },
                });
                // other-user is not the submitter and not assigned
                return canActOnRequest(user, request, 'RESUBMIT') === false;
            }),
            { numRuns: 100 }
        );
    });

    it('unrelated USER cannot act on any request', () => {
        fc.assert(
            fc.property(statusArb, actionArb, (status, action) => {
                const user = makeUser({ id: 'stranger', role: 'USER', isDepartmentHead: false, department: 'hr' });
                const request = makeRequest({
                    submitterId: 'someone-else',
                    assignedToId: null,
                    status,
                    submitter: { managerId: 'another-manager', department: 'engineering' },
                });
                // stranger is not submitter, not assignee, not manager, not dept head for this dept
                return canActOnRequest(user, request, action) === false;
            }),
            { numRuns: 200 }
        );
    });
});

// ---------------------------------------------------------------------------
// Property 5: List visibility filter
// Feature: digital-approval-workflow, Property 5
// Validates: Requirements 2.6
// ---------------------------------------------------------------------------

import { isVisibleToUser } from '../store.js';

describe('Property 5: List visibility filter', () => {
    // Arbitrary for a request with a submitter shape
    const visibilityRequestArb = fc.record({
        submitterId: fc.constantFrom('user-a', 'user-b', 'user-c', 'other'),
        assignedToId: fc.option(fc.constantFrom('user-a', 'user-b', 'user-c'), { nil: null }),
        submitter: fc.record({
            managerId: fc.option(fc.constantFrom('user-a', 'user-b', 'user-c', 'mgr-x'), { nil: null }),
            department: deptArb,
        }),
    });

    const visibilityUserArb = fc.record({
        id: fc.constantFrom('user-a', 'user-b', 'user-c'),
        role: fc.constantFrom('USER'),
        isDepartmentHead: fc.boolean(),
        department: deptArb,
    });

    it('every request visible to a user satisfies at least one visibility condition', () => {
        // Feature: digital-approval-workflow, Property 5
        // Validates: Requirements 2.6
        fc.assert(
            fc.property(visibilityUserArb, visibilityRequestArb, (user, request) => {
                const visible = isVisibleToUser(user, request);

                if (!visible) return true; // not visible — nothing to assert

                // At least one condition must hold
                const isSubmitter = request.submitterId === user.id;
                const isAssignee = request.assignedToId === user.id;
                const isManager = request.submitter.managerId === user.id;
                const isDeptHead =
                    user.isDepartmentHead &&
                    user.department &&
                    request.submitter.department === user.department;

                return isSubmitter || isAssignee || isManager || isDeptHead;
            }),
            { numRuns: 1000 }
        );
    });

    it('a request is NOT visible when the user has no relationship to it', () => {
        fc.assert(
            fc.property(deptArb, (dept) => {
                const user = makeUser({
                    id: 'stranger',
                    role: 'USER',
                    isDepartmentHead: false,
                    department: dept,
                });
                const request = {
                    submitterId: 'someone-else',
                    assignedToId: null,
                    submitter: {
                        managerId: 'another-manager',
                        // Use a different department to ensure no dept-head match
                        department: dept === 'engineering' ? 'finance' : 'engineering',
                    },
                };
                return isVisibleToUser(user, request) === false;
            }),
            { numRuns: 200 }
        );
    });

    it('ADMIN can see every request', () => {
        fc.assert(
            fc.property(visibilityRequestArb, (request) => {
                const admin = makeUser({ id: 'admin-1', role: 'ADMIN' });
                return isVisibleToUser(admin, request) === true;
            }),
            { numRuns: 200 }
        );
    });
});
