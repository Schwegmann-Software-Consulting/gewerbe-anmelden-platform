// Admin-API (Backoffice, interne Tools, n8n). Authentifizierung: Authorization: Bearer <ADMIN_TOKEN>.
// Für mehrere Mitarbeiter später durch Login + Rollen (z. B. OIDC) ersetzen.
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { quote, cityConfigSchema, issues, STATUSES, CHANNELS, DEFAULT_COMPETITORS } from '@ga/core';
import { cities, settings, applications, documents, events, jobs, frontends } from '../db.js';
import { setStatus, queueTransmission, TransitionError } from '../services/workflow.js';
import { getFile } from '../services/storage.js';
import { newToken } from '../services/security.js';
import { config } from '../config.js';

export const admin = new Hono();

admin.onError((err, c) => {
  if (err instanceof TransitionError) return c.json({ error: 'invalid_transition', message: err.message }, 409);
  throw err;
});

// ---------- Preise & Städte ----------
admin.get('/settings', (c) => c.json({ data: { competitors: DEFAULT_COMPETITORS, ...settings.pricing() } }));
admin.put('/settings', async (c) => {
  const s = { ...settings.pricing(), ...(await c.req.json()) };
  settings.setPricing(s);
  return c.json({ data: s });
});

const adminCity = (x, s) => ({ ...x, quote: quote(x, s) });

admin.get('/cities', (c) => {
  const s = settings.pricing();
  return c.json({ data: cities.list().map((x) => adminCity(x, s)), channels: CHANNELS });
});

admin.put('/cities/:id', async (c) => {
  const id = c.req.param('id');
  const merged = { ...(cities.get(id) ?? {}), ...(await c.req.json()), id };
  const parsed = cityConfigSchema.safeParse(merged);
  if (!parsed.success) return c.json({ error: 'validation', fields: issues(parsed) }, 422);
  cities.upsert({ ...parsed.data, id });
  return c.json({ data: adminCity(cities.get(id), settings.pricing()) });
});

admin.delete('/cities/:id', (c) => {
  cities.remove(c.req.param('id'));
  return c.body(null, 204);
});

// Mehrere Städte auf einmal: { ids?: string[], feePercent?, feeMode? }
admin.post('/cities/bulk', async (c) => {
  const { ids, ...patch } = await c.req.json();
  const list = cities.list().filter((x) => !ids || ids.includes(x.id));
  for (const x of list) cities.upsert({ ...x, ...patch });
  return c.json({ data: { updated: list.length } });
});

// ---------- Anträge ----------
admin.get('/applications', (c) => {
  const { status, cityId, limit, offset } = c.req.query();
  const list = applications.list({ status, cityId, limit: Number(limit ?? 100), offset: Number(offset ?? 0) });
  return c.json({ data: list.map(({ tokenHash, ...a }) => ({ ...a, statusLabel: STATUSES[a.status].label })) });
});

admin.get('/applications/:id', (c) => {
  const app = applications.get(c.req.param('id'));
  if (!app) return c.json({ error: 'not_found' }, 404);
  const { tokenHash, ...rest } = app;
  return c.json({
    data: {
      ...rest,
      statusLabel: STATUSES[app.status].label,
      city: cities.get(app.cityId),
      documents: documents.list(app.id).map(({ path, ...d }) => d),
      events: events.list(app.id),
    },
  });
});

const load = (c) => {
  const app = applications.get(c.req.param('id'));
  if (!app) throw new Error('not_found');
  return app;
};

// Prüfung bestanden → Übermittlung einreihen
admin.post('/applications/:id/approve', (c) => {
  const app = queueTransmission(load(c), 'admin');
  return c.json({ data: { status: app.status } });
});

// Rückfrage an Kunden (öffnet den Antrag wieder zur Bearbeitung)
admin.post('/applications/:id/request-info', async (c) => {
  const { message } = await c.req.json();
  const app = setStatus(load(c), 'needs_info', { actor: 'admin', note: message, payload: { public: true } });
  return c.json({ data: { status: app.status } });
});

// Antworten des Amts erfassen: acknowledged / completed / rejected / transmitted (nach Portal-Eingabe)
admin.post('/applications/:id/status', async (c) => {
  const { status, note, reference, public: isPublic } = await c.req.json();
  let app = load(c);
  if (reference) applications.update(app.id, { transmission: { ...(app.transmission ?? {}), authorityReference: reference } });
  app = setStatus(app, status, { actor: 'admin', note, payload: { public: Boolean(isPublic), reference } });
  return c.json({ data: { status: app.status } });
});

admin.post('/applications/:id/retransmit', (c) => {
  const app = load(c);
  const next = app.status === 'queued' ? app : queueTransmission(setStatus(app, 'in_review', { actor: 'admin' }), 'admin');
  return c.json({ data: { status: next.status } });
});

admin.get('/applications/:id/packet.pdf', async (c) => {
  const app = load(c);
  const buf = await readFile(join(config.storageDir, app.id, 'packet.pdf')).catch(() => null);
  if (!buf) return c.json({ error: 'not_built' }, 404);
  return c.body(buf, 200, { 'content-type': 'application/pdf' });
});

admin.get('/documents/:docId', async (c) => {
  const d = documents.get(c.req.param('docId'));
  if (!d) return c.json({ error: 'not_found' }, 404);
  return c.body(await getFile(d.path), 200, { 'content-type': d.mime });
});

// ---------- Betrieb ----------
admin.get('/jobs', (c) => c.json({ data: jobs.list() }));

admin.get('/stats', (c) => {
  const all = applications.list({ limit: 100000 });
  const paid = all.filter((a) => a.payment?.amountCents);
  return c.json({
    data: {
      total: all.length,
      byStatus: Object.fromEntries(Object.keys(STATUSES).map((s) => [s, all.filter((a) => a.status === s).length])),
      revenueServiceCents: paid.reduce((n, a) => n + (a.quote?.serviceFeeCents ?? 0), 0),
      passThroughCents: paid.reduce((n, a) => n + (a.quote?.feeMode === 'included' ? a.quote.officeFeeCents : 0), 0),
    },
  });
});

// Weitere Frontends anlegen (eigener API-Key, eigene erlaubte Origins)
admin.get('/frontends', (c) => c.json({ data: frontends.list() }));
admin.post('/frontends', async (c) => {
  const { id, name, origins } = await c.req.json();
  const apiKey = `pk_${newToken()}`;
  frontends.create({ id, name, apiKey, origins });
  return c.json({ data: { id, name, apiKey, origins } }, 201);
});
