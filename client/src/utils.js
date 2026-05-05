/**
 * Filter a list of WorkflowRequests by status and/or category.
 *
 * @param {Array} items - Array of WorkflowRequest objects
 * @param {{ status?: string, category?: string }} filters
 *   - status: exact RequestStatus string, or 'ALL' / undefined to skip
 *   - category: exact category string, or 'ALL' / undefined to skip
 * @returns {Array} filtered array (original objects, no mutation)
 */
export function filterRequests(items, { status, category } = {}) {
    return items.filter((item) => {
        if (status && status !== 'ALL' && item.status !== status) return false;
        if (category && category !== 'ALL' && item.category !== category) return false;
        return true;
    });
}

/**
 * Sort a list of WorkflowRequests.
 *
 * @param {Array} items - Array of WorkflowRequest objects
 * @param {'updatedAt' | 'amountCents'} sortBy
 *   - 'updatedAt': descending by updatedAt date (most recent first)
 *   - 'amountCents': descending by amountCents (highest first)
 * @returns {Array} new sorted array (does not mutate input)
 */
export function sortRequests(items, sortBy) {
    const copy = [...items];
    copy.sort((a, b) => {
        if (sortBy === 'amountCents') {
            return (b.amountCents || 0) - (a.amountCents || 0);
        }
        // default: sort by updatedAt descending
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    return copy;
}
