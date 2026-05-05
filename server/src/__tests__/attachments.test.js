import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock @prisma/client so tests don't need a live database.
// ---------------------------------------------------------------------------

const mockPrisma = vi.hoisted(() => ({
    attachment: {
        create: vi.fn(),
        findFirst: vi.fn(),
    },
    workflowRequest: {
        findFirst: vi.fn(),
    },
}));

vi.mock('@prisma/client', () => ({
    PrismaClient: class {
        constructor() {
            return mockPrisma;
        }
    },
}));

import { addAttachmentToRequest } from '../store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttachmentRecord(overrides = {}) {
    return {
        id: `att-${Math.random().toString(36).slice(2)}`,
        requestId: 1,
        filename: 'test-file.pdf',
        path: '/uploads/test-file.pdf',
        mimetype: 'application/pdf',
        sizeBytes: 1024,
        createdAt: new Date(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Task 10.1 — Verify addAttachmentToRequest links attachment to request
// Validates: Requirements 8.1
// ---------------------------------------------------------------------------

describe('Task 10.1: addAttachmentToRequest creates Attachment record linked to request', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates an Attachment record with the correct requestId', async () => {
        const input = {
            requestId: 42,
            filename: 'document.pdf',
            path: '/uploads/document.pdf',
            mimetype: 'application/pdf',
            sizeBytes: 2048,
        };
        const expected = makeAttachmentRecord({ ...input });
        mockPrisma.attachment.create.mockResolvedValue(expected);

        const result = await addAttachmentToRequest(input);

        expect(mockPrisma.attachment.create).toHaveBeenCalledOnce();
        const createCall = mockPrisma.attachment.create.mock.calls[0][0];
        expect(createCall.data.requestId).toBe(42);
        expect(createCall.data.filename).toBe('document.pdf');
        expect(createCall.data.mimetype).toBe('application/pdf');
        expect(createCall.data.sizeBytes).toBe(2048);
        expect(result.id).toBe(expected.id);
    });

    it('passes all required fields to prisma.attachment.create', async () => {
        const input = {
            requestId: 7,
            filename: 'image.png',
            path: '/uploads/image.png',
            mimetype: 'image/png',
            sizeBytes: 512000,
        };
        mockPrisma.attachment.create.mockResolvedValue(makeAttachmentRecord(input));

        await addAttachmentToRequest(input);

        const createCall = mockPrisma.attachment.create.mock.calls[0][0];
        expect(createCall.data).toMatchObject({
            requestId: 7,
            filename: 'image.png',
            path: '/uploads/image.png',
            mimetype: 'image/png',
            sizeBytes: 512000,
        });
    });
});

// ---------------------------------------------------------------------------
// Property 12: Attachment creation links file to request
// Feature: digital-approval-workflow, Property 12
// Validates: Requirements 8.1
// ---------------------------------------------------------------------------

describe('Property 12: Attachment creation links file to request', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('for any valid file metadata, the created Attachment record has the correct requestId and fields', async () => {
        // Feature: digital-approval-workflow, Property 12
        // Validates: Requirements 8.1
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    requestId: fc.integer({ min: 1, max: 10000 }),
                    filename: fc.stringMatching(/^[a-z0-9_-]{4,20}\.(pdf|png|jpg|docx)$/),
                    mimetype: fc.constantFrom(
                        'application/pdf',
                        'image/png',
                        'image/jpeg',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    ),
                    sizeBytes: fc.integer({ min: 1, max: 10 * 1024 * 1024 }),
                }),
                async ({ requestId, filename, mimetype, sizeBytes }) => {
                    vi.clearAllMocks();

                    const filePath = `/uploads/${filename}`;
                    const attachmentRecord = makeAttachmentRecord({
                        requestId,
                        filename,
                        path: filePath,
                        mimetype,
                        sizeBytes,
                    });
                    mockPrisma.attachment.create.mockResolvedValue(attachmentRecord);

                    const result = await addAttachmentToRequest({
                        requestId,
                        filename,
                        path: filePath,
                        mimetype,
                        sizeBytes,
                    });

                    // The Attachment record must be linked to the correct request
                    const createCall = mockPrisma.attachment.create.mock.calls[0][0];
                    if (createCall.data.requestId !== requestId) return false;
                    if (createCall.data.filename !== filename) return false;
                    if (createCall.data.mimetype !== mimetype) return false;
                    if (createCall.data.sizeBytes !== sizeBytes) return false;

                    // The returned record must have the correct requestId
                    if (result.requestId !== requestId) return false;

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ---------------------------------------------------------------------------
// Task 10.3 — Unit test: GET /api/uploads/:filename returns 200 for existing file
// Validates: Requirements 8.3
// ---------------------------------------------------------------------------

import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Task 10.3: GET /api/uploads/:filename serves uploaded files', () => {
    let app;
    let tmpDir;

    beforeEach(() => {
        // Create a temp directory to act as the uploads folder
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-test-'));
        app = express();
        app.use('/api/uploads', express.static(tmpDir));
    });

    it('returns 200 for an existing file', async () => {
        // Write a test file to the temp uploads directory
        const filename = 'test-document.pdf';
        const filePath = path.join(tmpDir, filename);
        fs.writeFileSync(filePath, 'PDF content here');

        // Use supertest-style manual fetch via node http
        const { createServer } = await import('http');
        const server = createServer(app);

        await new Promise((resolve, reject) => {
            server.listen(0, () => {
                const port = server.address().port;
                import('http').then(({ default: http }) => {
                    http.get(`http://localhost:${port}/api/uploads/${filename}`, (res) => {
                        expect(res.statusCode).toBe(200);
                        server.close(resolve);
                    }).on('error', (err) => {
                        server.close(() => reject(err));
                    });
                });
            });
        });

        // Cleanup
        fs.unlinkSync(filePath);
    });

    it('returns 404 for a non-existent file', async () => {
        const { createServer } = await import('http');
        const server = createServer(app);

        await new Promise((resolve, reject) => {
            server.listen(0, () => {
                const port = server.address().port;
                import('http').then(({ default: http }) => {
                    http.get(`http://localhost:${port}/api/uploads/nonexistent.pdf`, (res) => {
                        expect(res.statusCode).toBe(404);
                        server.close(resolve);
                    }).on('error', (err) => {
                        server.close(() => reject(err));
                    });
                });
            });
        });
    });
});
