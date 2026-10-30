// Öffentliche API für alle Frontends (Website, Landingpages, Partner, App).
// Authentifizierung: Header X-Api-Key (pro Frontend). Zugriff auf einen Antrag: Header X-Application-Token.
import { Hono } from 'hono';
import {
  quote, publicPrice, searchCities, findCityByZip, CHANNELS, STATUSES, PUBLIC_STEPS,
  applicationSchema, issues, COMPARISON_FEATURES, OUR_FEATURES, DEFAULT_COMPETITORS,
} from '@ga/core';
import { cities, settings, applications, documents, events } from '../db.js';
import { newId, newRef, newToken, hashToken, safeEqual } from '../services/security.js';
import { putFile } from '../services/storage.js';
import { createCheckout, verifyStripe, paymentsLive } from '../services/payments.js';
import { setStatus, onPaid } from '../services/workflow.js';
import { config } from '../config.js';

export const pub = new Hono();

const publicCity = (c, s) => ({
  id: c.id, name: c.name, state: c.state, zipRanges: c.zipRanges,
  authorityName: c.authority.name, channel: c.channel, channelLabel: CHANNELS[c.channel].label,
  price: publicPrice(quote(c, s)),
});

const DOC_KINDS = ['id_front', 'id_back', 'signature', 'permit', 'register_extract', 'other'];
const MIME = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_BYTES = 8 * 1024 * 1024;

// ---------- Städte & Preise ----------
pub.get('/cities', (c) => {
  const s = settings.pricing();
  const list = searchCities(cities.list().filter((x) => x.active), c.req.query('q'));
  return c.json({ data: list.map((x) => publicCity(x, s)) });
});

pub.get('/cities/resolve', (c) => {
  const city = findCityByZip(cities.list().filter((x) => x.active), c.req.query('zip') ?? '');
  if (!city) return c.json({ error: 'not_covered', message: 'Für diese Postleitzahl bieten wir die Anmeldung noch nicht an.' }, 404);
  return c.json({ data: publicCity(city, settings.pricing()) });
});

pub.get('/cities/:id', (c) => {
  const city = cities.get(c.req.param('id'));
  if (!city?.active) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: publicCity(city, settings.pricing()) });
});

// Anbietervergleich: unser Preis (Stadt oder "ab") gegen gepflegte Wettbewerberdaten
pub.get('/comparison', (c) => {
  const s = settings.pricing();
  const active = cities.list().filter((x) => x.active);
  const city = c.req.query('cityId') ? active.find((x) => x.id === c.req.query('cityId')) : null;
  const totals = active.map((x) => quote(x, s).totalDueCents);
  return c.json({
    data: {
      features: COMPARISON_FEATURES,
      ours: {
        name: 'gewerbe-anmelden.com',
        priceCents: city ? quote(city, s).totalDueCents : Math.min(...totals),
        priceIsFrom: !city,
        includesOfficeFee: city ? city.feeMode === 'included' : true,
        features: OUR_FEATURES,
      },
      competitors: (s.competitors ?? DEFAULT_COMPETITORS).filter((x) => x.active),
    },
  });
});

// ---------- Anträge ----------
pub.post('/applications', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const city = body.cityId ? cities.get(body.cityId) : null;
  if (body.cityId && !city?.active) return c.json({ error: 'city_unavailable' }, 422);
  const token = newToken();
  const app = {
    id: newId('app'), ref: newRef(), tokenHash: hashToken(token), frontendId: c.get('frontend').id,
    cityId: city?.id, status: 'draft', data: body.data ?? {}, quote: city ? quote(city, settings.pricing()) : null,
  };
  applications.create(app);
  events.add(app.id, 'created', { frontend: app.frontendId }, 'customer');
  return c.json({ data: { id: app.id, ref: app.ref, accessToken: token, status: app.status, price: publicPrice(app.quote) } }, 201);
});

// Middleware: Antrag laden und Token prüfen
const withApp = async (c, next) => {
  const app = applications.get(c.req.param('id'));
  const token = c.req.header('x-application-token') ?? '';
  if (!app || !safeEqual(app.tokenHash, hashToken(token))) return c.json({ error: 'not_found' }, 404);
  c.set('app', app);
  await next();
};

const publicView = (app) => ({
  id: app.id, ref: app.ref, status: app.status, statusLabel: STATUSES[app.status].label,
  progress: { steps: PUBLIC_STEPS, current: STATUSES[app.status].step },
  data: app.data, price: publicPrice(app.quote),
  documents: documents.list(app.id).map(({ id, kind, filename, size }) => ({ id, kind, filename, size })),
  timeline: events.list(app.id).filter((e) => e.type === 'status').map((e) => ({
    status: e.payload.to, label: STATUSES[e.payload.to].label, at: e.createdAt, note: e.payload.public ? e.payload.note : undefined,
  })),
  createdAt: app.createdAt,
});

pub.get('/applications/:id', withApp, (c) => c.json({ data: publicView(c.get('app')) }));

pub.patch('/applications/:id', withApp, async (c) => {
  const app = c.get('app');
  if (!['draft', 'needs_info'].includes(app.status)) return c.json({ error: 'locked', message: 'Der Antrag kann nicht mehr geändert werden.' }, 409);
  const body = await c.req.json();
  const data = deepMerge(app.data, body.data ?? {});
  const patch = { data };
  const cityId = data.business?.cityId;
  if (cityId && cityId !== app.cityId) {
    const city = cities.get(cityId);
    if (!city?.active) return c.json({ error: 'city_unavailable' }, 422);
    patch.cityId = city.id;
    patch.quote = quote(city, settings.pricing());
  }
  applications.update(app.id, patch);
  return c.json({ data: publicView(applications.get(app.id)) });
});

pub.post('/applications/:id/documents', withApp, async (c) => {
  const app = c.get('app');
  if (!['draft', 'needs_info'].includes(app.status)) return c.json({ error: 'locked' }, 409);
  const form = await c.req.formData();
  const kind = String(form.get('kind'));
  const file = form.get('file');
  if (!DOC_KINDS.includes(kind)) return c.json({ error: 'invalid_kind' }, 422);
  if (!(file instanceof File)) return c.json({ error: 'file_missing' }, 422);
  if (!MIME.includes(file.type)) return c.json({ error: 'invalid_type', message: 'Erlaubt sind JPG, PNG und PDF.' }, 422);
  if (file.size > MAX_BYTES) return c.json({ error: 'too_large', message: 'Maximal 8 MB pro Datei.' }, 413);
  if (kind !== 'other') documents.removeKind(app.id, kind);
  const id = newId('doc');
  const path = await putFile(app.id, id, Buffer.from(await file.arrayBuffer()));
  documents.add({ id, applicationId: app.id, kind, filename: file.name, mime: file.type, size: file.size, path });
  return c.json({ data: { id, kind, filename: file.name, size: file.size } }, 201);
});

// Verbindlich absenden → Zahlung starten
pub.post('/applications/:id/submit', withApp, async (c) => {
  let app = c.get('app');
  if (app.status !== 'draft') return c.json({ error: 'already_submitted' }, 409);
  const parsed = applicationSchema.safeParse(app.data);
  if (!parsed.success) return c.json({ error: 'validation', fields: issues(parsed) }, 422);
  const kinds = new Set(documents.list(app.id).map((d) => d.kind));
  const missing = ['id_front', 'signature'].filter((k) => !kinds.has(k));
  if (parsed.data.business.needsPermit && !kinds.has('permit')) missing.push('permit');
  if (missing.length) return c.json({ error: 'documents_missing', missing }, 422);

  // Preis zum Zeitpunkt der Bestellung festschreiben
  const city = cities.get(app.cityId);
  const q = quote(city, settings.pricing());
  applications.update(app.id, { data: parsed.data, quote: q });
  app = { ...applications.get(app.id) };

  const body = await c.req.json().catch(() => ({}));
  const base = body.returnUrl ?? config.publicBaseUrl;
  const checkout = await createCheckout(app, {
    successUrl: `${base}?ref=${app.ref}&paid=1`, cancelUrl: `${base}?ref=${app.ref}&cancelled=1`,
  });
  app = setStatus(app, 'awaiting_payment', { actor: 'customer' });
  applications.update(app.id, { payment: { provider: checkout.provider, sessionId: checkout.sessionId } });

  if (!paymentsLive()) app = onPaid(app, { provider: 'test', sessionId: checkout.sessionId, amountCents: q.totalDueCents });
  return c.json({ data: { checkoutUrl: checkout.url, status: app.status, price: publicPrice(q) } });
});

// ---------- Zahlungsanbieter ----------
pub.post('/webhooks/stripe', async (c) => {
  const raw = await c.req.text();
  if (!verifyStripe(raw, c.req.header('stripe-signature'))) return c.json({ error: 'bad_signature' }, 400);
  const evt = JSON.parse(raw);
  if (evt.type === 'checkout.session.completed') {
    const s = evt.data.object;
    const app = applications.get(s.client_reference_id);
    if (app?.status === 'awaiting_payment') {
      onPaid(app, { provider: 'stripe', sessionId: s.id, paymentIntent: s.payment_intent, amountCents: s.amount_total });
    }
  }
  return c.json({ received: true });
});

function deepMerge(a, b) {
  if (typeof a !== 'object' || a === null || Array.isArray(b)) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) ? deepMerge(a[k] ?? {}, v) : v;
  return out;
}
