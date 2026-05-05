import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { allowedTransitions, getConditionalInitialStatus } from '../store.js';

// ---------------------------------------------------------------------------
// The full transition table from the design document — used as the oracle.
// ---------------------------------------------------------------------------
const TRANSITION_TABLE = {
    PENDING_MANAGER: { REVIEW: 'PENDING_DEPARTMENT', REQUEST_INFO: 'NEEDS_INFO', REJECT: 'REJECTED' },
    PENDING_DEPARTMENT: { APPROVE: 'APPROVED', REQUEST_INFO: 'NEEDS_INFO', REJECT: 'REJECTED' },
    NEEDS_INFO: { RESUBMIT: 'PENDING_MANAGER', REJECT: 'REJECTED' },
    APPROVED: { ARCHIVE: 'ARCHIVED', REQUEST_INFO: 'NEEDS_INFO', REJECT: 'REJECTED' },
    ARCHIVED: {},
    REJECTED: {},
};

const ALL_STATUSES = Object.keys(TRANSITION_TABLE);
const ALL_ACTIONS = ['REVIEW', 'APPROVE', 'ARCHIVE', 'REQUEST_INFO', 'RESUBMIT', 'REJECT', 'DELEGATE'];

// Build the complete set of valid (fromStatus, action) pairs from the oracle table.
const validPairs = [];
const invalidPairs = [];
for (const status of ALL_STATUSES) {
    for (const action of ALL_ACTIONS) {
        if (TRANSITION_TABLE[status][action]) {
            validPairs.push({ from: status, action, to: TRANSITION_TABLE[status][action] });
        } else {
            invalidPairs.push({ from: status, action });
        }
    }
}

// ---------------------------------------------------------------------------
// Property 7: State machine transitions are correct
// Feature: digital-approval-workflow, Property 7
// Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
// ---------------------------------------------------------------------------

describe('Property 7: State machine transitions are correct', () => {
    it('for any valid (fromStatus, action) pair, allowedTransitions returns the correct toStatus', () => {
        // Feature: digital-approval-workflow, Property 7
        // Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
        fc.assert(
            fc.property(
                fc.constantFrom(...validPairs),
                ({ from, action, to }) => {
                    const result = allowedTransitions[from]?.[action] ?? null;
                    return result === to;
                }
            ),
            { numRuns: Math.max(100, validPairs.length * 5) }
        );
    });

    it('for any invalid (fromStatus, action) pair, allowedTransitions returns undefined/null', () => {
        // Feature: digital-approval-workflow, Property 7
        // Validates: Requirements 3.9, 3.10
        fc.assert(
            fc.property(
                fc.constantFrom(...invalidPairs),
                ({ from, action }) => {
                    const result = allowedTransitions[from]?.[action] ?? null;
                    return result === null;
                }
            ),
            { numRuns: Math.max(100, invalidPairs.length * 5) }
        );
    });

    it('ARCHIVED and REJECTED are terminal — no transitions permitted', () => {
        for (const action of ALL_ACTIONS) {
            expect(allowedTransitions['ARCHIVED'][action]).toBeUndefined();
            expect(allowedTransitions['REJECTED'][action]).toBeUndefined();
        }
    });

    it('allowedTransitions table matches the design document exactly', () => {
        for (const [status, actions] of Object.entries(TRANSITION_TABLE)) {
            for (const [action, expectedTo] of Object.entries(actions)) {
                expect(allowedTransitions[status][action]).toBe(expectedTo);
            }
            // No extra entries in the implementation
            for (const action of Object.keys(allowedTransitions[status])) {
                expect(TRANSITION_TABLE[status][action]).toBeDefined();
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Property 6: Initial status follows creation rules
// Feature: digital-approval-workflow, Property 6
// Validates: Requirements 3.1, 3.2, 4.1
// ---------------------------------------------------------------------------

describe('Property 6: Initial status follows creation rules', () => {
    const categoryArb = fc.constantFrom('HARDWARE', 'GENERAL', 'SOFTWARE', 'FACILITIES');
    // amountCents: mix of values below, at, and above the 50000 threshold
    const amountArb = fc.oneof(
        fc.integer({ min: 0, max: 49999 }),   // below threshold
        fc.constant(50000),                        // at threshold (not auto-approved)
        fc.integer({ min: 50001, max: 500000 }),   // above threshold
        fc.constant(null)                          // no amount
    );

    it('for any user with a managerId, non-auto-approved request starts as PENDING_MANAGER', () => {
        // Feature: digital-approval-workflow, Property 6
        // Validates: Requirements 3.1
        fc.assert(
            fc.property(
                categoryArb,
                amountArb,
                (category, amountCents) => {
                    // Skip the auto-approve case
                    if (category === 'HARDWARE' && typeof amountCents === 'number' && amountCents < 50000) return true;

                    const submitter = { managerId: 'some-manager-id' };
                    const status = getConditionalInitialStatus({ category, amountCents, submitter });
                    return status === 'PENDING_MANAGER';
                }
            ),
            { numRuns: 200 }
        );
    });

    it('for any user without a managerId, non-auto-approved request starts as PENDING_DEPARTMENT', () => {
        // Feature: digital-approval-workflow, Property 6
        // Validates: Requirements 3.2
        fc.assert(
            fc.property(
                categoryArb,
                amountArb,
                (category, amountCents) => {
                    // Skip the auto-approve case
                    if (category === 'HARDWARE' && typeof amountCents === 'number' && amountCents < 50000) return true;

                    const submitter = { managerId: null };
                    const status = getConditionalInitialStatus({ category, amountCents, submitter });
                    return status === 'PENDING_DEPARTMENT';
                }
            ),
            { numRuns: 200 }
        );
    });

    it('HARDWARE requests with amountCents < 50000 are auto-approved regardless of managerId', () => {
        // Feature: digital-approval-workflow, Property 6
        // Validates: Requirements 4.1
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 49999 }),
                fc.option(fc.string({ minLength: 1 }), { nil: null }),
                (amountCents, managerId) => {
                    const submitter = { managerId };
                    const status = getConditionalInitialStatus({ category: 'HARDWARE', amountCents, submitter });
                    return status === 'APPROVED';
                }
            ),
            { numRuns: 200 }
        );
    });

    it('HARDWARE requests with amountCents >= 50000 are NOT auto-approved', () => {
        // Feature: digital-approval-workflow, Property 6
        // Validates: Requirements 4.1
        fc.assert(
            fc.property(
                fc.integer({ min: 50000, max: 1000000 }),
                fc.option(fc.string({ minLength: 1 }), { nil: null }),
                (amountCents, managerId) => {
                    const submitter = { managerId };
                    const status = getConditionalInitialStatus({ category: 'HARDWARE', amountCents, submitter });
                    return status !== 'APPROVED';
                }
            ),
            { numRuns: 200 }
        );
    });

    it('non-HARDWARE categories are never auto-approved', () => {
        // Feature: digital-approval-workflow, Property 6
        // Validates: Requirements 4.1
        fc.assert(
            fc.property(
                fc.constantFrom('GENERAL', 'SOFTWARE', 'FACILITIES'),
                amountArb,
                fc.option(fc.string({ minLength: 1 }), { nil: null }),
                (category, amountCents, managerId) => {
                    const submitter = { managerId };
                    const status = getConditionalInitialStatus({ category, amountCents, submitter });
                    return status !== 'APPROVED';
                }
            ),
            { numRuns: 200 }
        );
    });
});
