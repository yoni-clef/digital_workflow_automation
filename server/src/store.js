import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  nextId: 1,
  requests: []
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readDb() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULT_DB);
    if (!Array.isArray(parsed.requests)) parsed.requests = [];
    if (!Number.isInteger(parsed.nextId)) parsed.nextId = 1;
    return parsed;
  } catch (err) {
    if (err && err.code === 'ENOENT') return structuredClone(DEFAULT_DB);
    throw err;
  }
}

async function writeDb(db) {
  await ensureDataDir();
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmp, DB_PATH);
}

export async function listRequests() {
  const db = await readDb();
  return db.requests;
}

export async function getRequestById(id) {
  const db = await readDb();
  return db.requests.find((r) => r.id === id) ?? null;
}

export async function createRequest({ title, description, createdBy }) {
  const db = await readDb();
  const now = new Date().toISOString();

  const request = {
    id: db.nextId++,
    title,
    description,
    createdBy,
    status: 'REQUEST',
    createdAt: now,
    updatedAt: now,
    history: [
      {
        at: now,
        from: null,
        to: 'REQUEST',
        by: createdBy,
        note: 'Created'
      }
    ]
  };

  db.requests.unshift(request);
  await writeDb(db);
  return request;
}

export async function transitionRequest({ id, action, by, note }) {
  const db = await readDb();
  const idx = db.requests.findIndex((r) => r.id === id);
  if (idx === -1) return { error: 'NOT_FOUND' };

  const request = db.requests[idx];
  const from = request.status;

  const allowed = {
    REQUEST: { REVIEW: 'REVIEW' },
    REVIEW: { APPROVE: 'APPROVE' },
    APPROVE: { ARCHIVE: 'ARCHIVE' },
    ARCHIVE: {}
  };

  const to = allowed[from]?.[action] ?? null;
  if (!to) {
    return {
      error: 'INVALID_TRANSITION',
      details: { from, action }
    };
  }

  const now = new Date().toISOString();
  request.status = to;
  request.updatedAt = now;
  request.history.push({
    at: now,
    from,
    to,
    by,
    note: note ?? null
  });

  db.requests[idx] = request;
  await writeDb(db);
  return { request };
}
