// Persistenz. Für den Start SQLite (node:sqlite, keine Zusatzpakete).
// Für Produktion: gleiches Schema auf PostgreSQL (z. B. mit Drizzle/Kysely) übertragen.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED_CITIES, DEFAULT_SETTINGS } from '@ga/core';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS frontends (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, api_key TEXT UNIQUE NOT NULL,
  origins TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  ref TEXT UNIQUE NOT NULL,
  token_hash TEXT NOT NULL,
  frontend_id TEXT REFERENCES frontends(id),
  city_id TEXT,
  status TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  quote TEXT,
  payment TEXT,
  transmission TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, run_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(status, run_at);
`);

const J = (s) => (s == null ? null : JSON.parse(s));

// ---------- Seed ----------
if (!db.prepare('SELECT 1 FROM cities LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO cities (id, data) VALUES (?, ?)');
  for (const c of SEED_CITIES) ins.run(c.id, JSON.stringify(c));
}
if (!db.prepare("SELECT 1 FROM settings WHERE key='pricing'").get()) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('pricing', ?)").run(JSON.stringify(DEFAULT_SETTINGS));
}
if (!db.prepare('SELECT 1 FROM frontends LIMIT 1').get()) {
  db.prepare('INSERT INTO frontends (id, name, api_key, origins) VALUES (?, ?, ?, ?)')
    .run('web', 'gewerbe-anmelden.com', config.defaultFrontendKey, JSON.stringify(['*']));
}

// ---------- Repositories ----------
export const settings = {
  pricing: () => J(db.prepare("SELECT value FROM settings WHERE key='pricing'").get().value),
  setPricing: (v) => db.prepare("UPDATE settings SET value=? WHERE key='pricing'").run(JSON.stringify(v)),
};

export const frontends = {
  byKey: (key) => {
    const r = db.prepare('SELECT * FROM frontends WHERE api_key=?').get(key);
    return r ? { ...r, origins: J(r.origins) } : null;
  },
  list: () => db.prepare('SELECT id, name, origins, created_at FROM frontends').all()
    .map((r) => ({ ...r, origins: J(r.origins) })),
  create: (f) => db.prepare('INSERT INTO frontends (id, name, api_key, origins) VALUES (?, ?, ?, ?)')
    .run(f.id, f.name, f.apiKey, JSON.stringify(f.origins ?? [])),
};

export const cities = {
  list: () => db.prepare('SELECT data FROM cities ORDER BY id').all().map((r) => J(r.data)),
  get: (id) => J(db.prepare('SELECT data FROM cities WHERE id=?').get(id)?.data),
  upsert: (c) => db.prepare(
    `INSERT INTO cities (id, data) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=datetime('now')`,
  ).run(c.id, JSON.stringify(c)),
  remove: (id) => db.prepare('DELETE FROM cities WHERE id=?').run(id),
};

const appRow = (r) => r && ({
  id: r.id, ref: r.ref, frontendId: r.frontend_id, cityId: r.city_id, status: r.status,
  data: J(r.data), quote: J(r.quote), payment: J(r.payment), transmission: J(r.transmission),
  createdAt: r.created_at, updatedAt: r.updated_at, tokenHash: r.token_hash,
});

export const applications = {
  create: (a) => db.prepare(
    `INSERT INTO applications (id, ref, token_hash, frontend_id, city_id, status, data, quote)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(a.id, a.ref, a.tokenHash, a.frontendId, a.cityId ?? null, a.status, JSON.stringify(a.data ?? {}),
    a.quote ? JSON.stringify(a.quote) : null),
  get: (id) => appRow(db.prepare('SELECT * FROM applications WHERE id=?').get(id)),
  byRef: (ref) => appRow(db.prepare('SELECT * FROM applications WHERE ref=?').get(ref)),
  list: ({ status, cityId, limit = 100, offset = 0 } = {}) => {
    const where = [], args = [];
    if (status) { where.push('status=?'); args.push(status); }
    if (cityId) { where.push('city_id=?'); args.push(cityId); }
    const sql = `SELECT * FROM applications ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    return db.prepare(sql).all(...args, limit, offset).map(appRow);
  },
  update: (id, patch) => {
    const cols = { cityId: 'city_id', status: 'status', data: 'data', quote: 'quote', payment: 'payment', transmission: 'transmission' };
    const sets = [], args = [];
    for (const [k, col] of Object.entries(cols)) {
      if (k in patch) {
        sets.push(`${col}=?`);
        const v = patch[k];
        args.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
      }
    }
    if (!sets.length) return;
    db.prepare(`UPDATE applications SET ${sets.join(', ')}, updated_at=datetime('now') WHERE id=?`).run(...args, id);
  },
};

export const documents = {
  add: (d) => db.prepare(
    'INSERT INTO documents (id, application_id, kind, filename, mime, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(d.id, d.applicationId, d.kind, d.filename, d.mime, d.size, d.path),
  list: (applicationId) => db.prepare(
    'SELECT id, kind, filename, mime, size, path, created_at AS createdAt FROM documents WHERE application_id=?',
  ).all(applicationId),
  get: (id) => db.prepare('SELECT * FROM documents WHERE id=?').get(id),
  removeKind: (applicationId, kind) =>
    db.prepare('DELETE FROM documents WHERE application_id=? AND kind=?').run(applicationId, kind),
};

export const events = {
  add: (applicationId, type, payload = {}, actor = 'system') => db.prepare(
    'INSERT INTO events (application_id, type, payload, actor) VALUES (?, ?, ?, ?)',
  ).run(applicationId, type, JSON.stringify(payload), actor),
  list: (applicationId) => db.prepare(
    'SELECT type, payload, actor, created_at AS createdAt FROM events WHERE application_id=? ORDER BY id',
  ).all(applicationId).map((e) => ({ ...e, payload: J(e.payload) })),
};

export const jobs = {
  enqueue: (type, payload, delaySec = 0) => db.prepare(
    "INSERT INTO jobs (type, payload, run_at) VALUES (?, ?, datetime('now', ?))",
  ).run(type, JSON.stringify(payload), `+${delaySec} seconds`),
  claim: () => {
    const job = db.prepare(
      "SELECT * FROM jobs WHERE status='pending' AND run_at <= datetime('now') ORDER BY id LIMIT 1",
    ).get();
    if (!job) return null;
    const res = db.prepare("UPDATE jobs SET status='running', attempts=attempts+1 WHERE id=? AND status='pending'").run(job.id);
    return res.changes ? { ...job, payload: J(job.payload), attempts: job.attempts + 1 } : null;
  },
  done: (id) => db.prepare("UPDATE jobs SET status='done' WHERE id=?").run(id),
  retry: (id, err, delaySec) => db.prepare(
    "UPDATE jobs SET status='pending', last_error=?, run_at=datetime('now', ?) WHERE id=?",
  ).run(String(err), `+${delaySec} seconds`, id),
  fail: (id, err) => db.prepare("UPDATE jobs SET status='failed', last_error=? WHERE id=?").run(String(err), id),
  list: () => db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT 200').all(),
};
