import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import { frontends } from './db.js';
import { pub } from './routes/public.js';
import { admin } from './routes/admin.js';
import { safeEqual } from './services/security.js';
import { startWorker } from './worker.js';

const app = new Hono();
app.use('*', secureHeaders());

// CORS: erlaubte Origins kommen aus der Frontend-Registrierung
app.use('/v1/*', cors({
  origin: (origin) => origin,
  allowHeaders: ['content-type', 'x-api-key', 'x-application-token', 'authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
}));

app.get('/health', (c) => c.json({ ok: true }));
app.get('/v1/openapi.yaml', async (c) =>
  c.body(await readFile(new URL('../openapi.yaml', import.meta.url)), 200, { 'content-type': 'text/yaml' }));

// Frontend-Schlüssel prüfen (außer für Zahlungs-Webhooks und Admin)
app.use('/v1/*', async (c, next) => {
  const p = c.req.path;
  if (p.startsWith('/v1/admin') || p.startsWith('/v1/webhooks') || c.req.method === 'OPTIONS') return next();
  const fe = frontends.byKey(c.req.header('x-api-key') ?? '');
  if (!fe) return c.json({ error: 'invalid_api_key' }, 401);
  const origin = c.req.header('origin');
  if (origin && !fe.origins.includes('*') && !fe.origins.includes(origin)) return c.json({ error: 'origin_not_allowed' }, 403);
  c.set('frontend', fe);
  return next();
});

app.use('/v1/admin/*', async (c, next) => {
  const token = (c.req.header('authorization') ?? '').replace(/^Bearer /, '');
  if (!safeEqual(token, config.adminToken)) return c.json({ error: 'unauthorized' }, 401);
  return next();
});

app.route('/v1', pub);
app.route('/v1/admin', admin);

app.onError((err, c) => {
  if (err.message === 'not_found') return c.json({ error: 'not_found' }, 404);
  console.error(err);
  return c.json({ error: 'internal', message: 'Interner Fehler' }, 500);
});

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`API läuft auf http://localhost:${port} (Übermittlung: ${config.transmitMode})`);
});
startWorker();
