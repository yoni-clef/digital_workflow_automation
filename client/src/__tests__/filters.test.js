import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterRequests, sortRequests } from '../utils.js';

// Feature: digital-approval-workflow, Property 13: Client-side filter and sort correctness
// Validates: Requirements 9.2, 9.3

const STATUSES = ['PENDING_MANAGER', 'PENDING_DEPARTMENT', 'NEEDS_INFO', 'APPROVED', 'ARCHIVED', 'REJECTED'];
const CATEGORIES = ['GENERAL', 'HARDWARE', 'SOFTWARE', 'FINANCE', 'HR'];

const arbRequest = fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    status: fc.constantFrom(...STATUSES),
    category: fc.constantFrom(...CATEGORIES),
    amountCents: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 1_000_000 })),
    updatedAt: fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ms => new Date(ms).toISOString()),
});

const arbRequestList = fc.array(arbRequest, { minLength: 0, maxLength: 30 });

describe('filterRequests', () => {
    it('Property 13a: all returned items match the status filter', () => {
        fc.assert(
            fc.property(arbRequestList, fc.constantFrom('ALL', ...STATUSES), (items, status) => {
                const result = filterRequests(items, { status });
                if (status === 'ALL') {
                    expect(result.length).toBe(items.length);
                } else {
                    expect(result.every(i => i.status === status)).toBe(true);
                }
            }),
            { numRuns: 100 }
        );
    });

    it('Property 13b: all returned items match the category filter', () => {
        fc.assert(
            fc.property(arbRequestList, fc.constantFrom('ALL', ...CATEGORIES), (items, category) => {
                const result = filterRequests(items, { category });
                if (category === 'ALL') {
                    expect(result.length).toBe(items.length);
                } else {
                    expect(result.every(i => i.category === category)).toBe(true);
                }
            }),
            { numRuns: 100 }
        );
    });

    it('Property 13c: combined status + category filter returns only matching items', () => {
        fc.assert(
            fc.property(
                arbRequestList,
                fc.constantFrom('ALL', ...STATUSES),
                fc.constantFrom('ALL', ...CATEGORIES),
                (items, status, category) => {
                    const result = filterRequests(items, { status, category });
                    for (const item of result) {
                        if (status !== 'ALL') expect(item.status).toBe(status);
                        if (category !== 'ALL') expect(item.category).toBe(category);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});

describe('sortRequests', () => {
    it('Property 13d: sortBy updatedAt produces descending order', () => {
        fc.assert(
            fc.property(arbRequestList, (items) => {
                const result = sortRequests(items, 'updatedAt');
                for (let i = 0; i < result.length - 1; i++) {
                    expect(new Date(result[i].updatedAt) >= new Date(result[i + 1].updatedAt)).toBe(true);
                }
            }),
            { numRuns: 100 }
        );
    });

    it('Property 13e: sortBy amountCents produces descending order', () => {
        fc.assert(
            fc.property(arbRequestList, (items) => {
                const result = sortRequests(items, 'amountCents');
                for (let i = 0; i < result.length - 1; i++) {
                    expect((result[i].amountCents || 0) >= (result[i + 1].amountCents || 0)).toBe(true);
                }
            }),
            { numRuns: 100 }
        );
    });

    it('Property 13f: sort does not mutate the input array', () => {
        fc.assert(
            fc.property(arbRequestList, fc.constantFrom('updatedAt', 'amountCents'), (items, sortBy) => {
                const original = [...items];
                sortRequests(items, sortBy);
                expect(items).toEqual(original);
            }),
            { numRuns: 100 }
        );
    });
});
