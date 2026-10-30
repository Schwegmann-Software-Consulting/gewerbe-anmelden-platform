// Demo-Adapter: implementiert denselben Vertrag wie die HTTP-API vollständig im Browser.
// Nutzt dieselbe Preis- und Validierungslogik (@ga/core) wie der Server.
import {
  SEED_CITIES, DEFAULT_SETTINGS, quote, publicPrice, searchCities, findCityByZip, applicationSchema, issues,
  STATUSES, PUBLIC_STEPS, CHANNELS, COMPARISON_FEATURES, OUR_FEATURES, DEFAULT_COMPETITORS,
} from '@ga/core';

const KEY = 'ga-demo-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* Demo läuft auch ohne */ } };

function initial() {
  const now = Date.now();
  const demo = (i, cityId, status, name, activity, daysAgo) => {
    const city = SEED_CITIES.find((c) => c.id === cityId);
    const [firstName, lastName] = name.split(' ');
    const created = new Date(now - daysAgo * 864e5).toISOString();
    return {
      id: `app_demo${i}`, ref: `GA-26-DEMO${i}`, cityId, status, createdAt: created, updatedAt: created,
      quote: quote(city, DEFAULT_SETTINGS), frontendId: i % 2 ? 'web' : 'partner-steuerkanzlei',
      data: {
        person: { firstName, lastName, email: `${firstName.toLowerCase()}@beispiel.de`, address: { street: 'Musterweg 3', zip: city.zipRanges[0][0], city: city.name } },
        business: { cityId, activity, legalForm: 'einzel', startDate: '2026-11-01', mainOrSide: i % 3 ? 'main' : 'side', premises: { street: 'Musterweg 3', zip: city.zipRanges[0][0], city: city.name } },
      },
      documents: [{ id: `d${i}a`, kind: 'id_front', filename: 'ausweis.jpg', size: 412000 }, { id: `d${i}b`, kind: 'signature', filename: 'unterschrift.png', size: 9000 }],
      events: [{ type: 'status', payload: { from: 'draft', to: status }, actor: 'system', createdAt: created }],
      transmission: ['transmitted', 'acknowledged', 'completed'].includes(status) ? { channel: city.channel, reference: 'dry-run', at: created } : null,
    };
  };
  return {
    settings: { ...DEFAULT_SETTINGS },
    cities: SEED_CITIES.map((c) => ({ ...c })),
    frontends: [
      { id: 'web', name: 'gewerbe-anmelden.com', origins: ['https://gewerbe-anmelden.com'] },
      { id: 'partner-steuerkanzlei', name: 'Partner-Widget Steuerkanzlei', origins: ['https://kanzlei-beispiel.de'] },
    ],
    applications: [
      demo(1, 'osnabrueck', 'in_review', 'Lena Hoffmann', 'Online-Handel mit handgefertigtem Schmuck', 0.2),
      demo(2, 'koeln', 'transmitted', 'Murat Yilmaz', 'Hausmeisterservice und Gartenpflege', 1),
      demo(3, 'berlin', 'manual_required', 'Sophie Wagner', 'Social-Media-Marketing für Gastronomiebetriebe', 1.4),
      demo(4, 'muenster', 'completed', 'Jonas Becker', 'Vermittlung von Photovoltaikanlagen', 4),
      demo(5, 'leipzig', 'acknowledged', 'Anna Schulz', 'Mobiler Fahrradreparaturservice', 3),
      demo(6, 'hamburg', 'needs_info', 'Paul Neumann', 'Handel mit gebrauchten Elektrogeräten', 2),
    ],
  };
}

const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => JSON.parse(JSON.stringify(x));
const rid = () => Math.random().toString(36).slice(2, 10);
const fail = (status, error, extra = {}) => { throw Object.assign(new Error(extra.message ?? error), { status, details: { error, ...extra } }); };

export function createMockApi() {
  let s = load() ?? initial();
  const commit = () => save(s);
  const pubCity = (c) => ({
    id: c.id, name: c.name, state: c.state, zipRanges: c.zipRanges, authorityName: c.authority.name,
    channel: c.channel, channelLabel: CHANNELS[c.channel].label, price: publicPrice(quote(c, s.settings)),
  });
  const active = () => s.cities.filter((c) => c.active);
  const findApp = (id) => s.applications.find((a) => a.id === id) ?? fail(404, 'not_found');
  const setStatus = (a, to, note, actor = 'system', extra = {}) => {
    a.events.push({ type: 'status', payload: { from: a.status, to, note, ...extra }, actor, createdAt: new Date().toISOString() });
    a.status = to; a.updatedAt = new Date().toISOString();
  };
  const view = (a) => ({
    ...clone(a), statusLabel: STATUSES[a.status].label,
    progress: { steps: PUBLIC_STEPS, current: STATUSES[a.status].step },
    timeline: a.events.filter((e) => e.type === 'status').map((e) => ({ status: e.payload.to, label: STATUSES[e.payload.to].label, at: e.createdAt, note: e.payload.public ? e.payload.note : undefined })),
  });
  // Kundensicht ohne Preisaufschlüsselung
  const publicView = (a) => { const { quote: q, ...rest } = view(a); return { ...rest, price: publicPrice(q) }; };
  const simulateTransmission = (a) => {
    setTimeout(() => {
      const city = s.cities.find((c) => c.id === a.cityId);
      const manual = city.channel === 'portal';
      a.transmission = { channel: city.channel, status: manual ? 'manual_required' : 'transmitted', reference: 'dry-run', at: new Date().toISOString() };
      a.events.push({ type: 'transmission', payload: a.transmission, actor: 'worker', createdAt: new Date().toISOString() });
      setStatus(a, manual ? 'manual_required' : 'transmitted', `Kanal: ${CHANNELS[city.channel].label}`, 'worker');
      commit();
    }, 1500);
  };

  return {
    mode: 'demo',
    reset() { s = initial(); commit(); },
    cities: {
      search: async (q) => { await wait(); return searchCities(active(), q).map(pubCity); },
      resolve: async (zip) => { await wait(); const c = findCityByZip(active(), zip); if (!c) fail(404, 'not_covered', { message: 'Für diese Postleitzahl bieten wir die Anmeldung noch nicht an.' }); return pubCity(c); },
      get: async (id) => pubCity(s.cities.find((c) => c.id === id)),
    },
    async comparison(cityId) {
      await wait(80);
      const city = cityId && active().find((c) => c.id === cityId);
      const totals = active().map((c) => quote(c, s.settings).totalDueCents);
      return {
        features: COMPARISON_FEATURES,
        ours: { name: 'gewerbe-anmelden.com', priceCents: city ? quote(city, s.settings).totalDueCents : Math.min(...totals), priceIsFrom: !city, includesOfficeFee: city ? city.feeMode === 'included' : true, features: OUR_FEATURES },
        competitors: (s.settings.competitors ?? DEFAULT_COMPETITORS).filter((x) => x.active),
      };
    },
    applications: {
      async create({ cityId, data = {} } = {}) {
        await wait();
        const city = s.cities.find((c) => c.id === cityId);
        const a = {
          id: `app_${rid()}`, ref: `GA-26-${rid().slice(0, 6).toUpperCase()}`, cityId, status: 'draft', frontendId: 'web',
          data, quote: city ? quote(city, s.settings) : null, documents: [], events: [], createdAt: new Date().toISOString(),
        };
        a.events.push({ type: 'created', payload: {}, actor: 'customer', createdAt: a.createdAt });
        s.applications.unshift(a); commit();
        return { id: a.id, ref: a.ref, accessToken: 'demo', status: a.status, price: publicPrice(a.quote) };
      },
      get: async (id) => publicView(findApp(id)),
      async patch(id, data) {
        const a = findApp(id);
        if (!['draft', 'needs_info'].includes(a.status)) fail(409, 'locked');
        a.data = merge(a.data, data);
        const cid = a.data.business?.cityId;
        if (cid && cid !== a.cityId) { a.cityId = cid; a.quote = quote(s.cities.find((c) => c.id === cid), s.settings); }
        commit();
        return publicView(a);
      },
      async upload(id, kind, file) {
        await wait(250);
        const a = findApp(id);
        if (kind !== 'other') a.documents = a.documents.filter((d) => d.kind !== kind);
        const d = { id: `doc_${rid()}`, kind, filename: file.name, size: file.size };
        a.documents.push(d); commit();
        return d;
      },
      async submit(id) {
        await wait(600);
        const a = findApp(id);
        const parsed = applicationSchema.safeParse(a.data);
        if (!parsed.success) fail(422, 'validation', { fields: issues(parsed) });
        const kinds = new Set(a.documents.map((d) => d.kind));
        const missing = ['id_front', 'signature'].filter((k) => !kinds.has(k));
        if (parsed.data.business.needsPermit && !kinds.has('permit')) missing.push('permit');
        if (missing.length) fail(422, 'documents_missing', { missing });
        a.quote = quote(s.cities.find((c) => c.id === a.cityId), s.settings);
        setStatus(a, 'awaiting_payment', null, 'customer');
        setStatus(a, 'paid', null, 'payment');
        a.payment = { provider: 'test', amountCents: a.quote.totalDueCents };
        setStatus(a, 'in_review');
        commit();
        return { checkoutUrl: null, status: a.status, price: publicPrice(a.quote) };
      },
    },
    admin: {
      settings: {
        get: async () => clone({ competitors: DEFAULT_COMPETITORS, ...s.settings }),
        put: async (v) => { s.settings = { ...s.settings, ...v }; commit(); return clone(s.settings); },
      },
      cities: {
        list: async () => { await wait(80); return s.cities.map((c) => ({ ...clone(c), quote: quote(c, s.settings) })); },
        put: async (id, patch) => {
          const i = s.cities.findIndex((c) => c.id === id);
          const next = { ...(s.cities[i] ?? {}), ...patch, id };
          if (i >= 0) s.cities[i] = next; else s.cities.push(next);
          commit();
          return { ...clone(next), quote: quote(next, s.settings) };
        },
        remove: async (id) => { s.cities = s.cities.filter((c) => c.id !== id); commit(); },
        bulk: async ({ ids, ...patch }) => {
          let n = 0;
          s.cities = s.cities.map((c) => (!ids || ids.includes(c.id) ? (n++, { ...c, ...patch }) : c));
          commit();
          return { updated: n };
        },
      },
      applications: {
        list: async ({ status } = {}) => { await wait(80); return s.applications.filter((a) => !status || a.status === status).map(view); },
        get: async (id) => { const a = findApp(id); return { ...view(a), city: clone(s.cities.find((c) => c.id === a.cityId)) }; },
        approve: async (id) => { const a = findApp(id); setStatus(a, 'queued', null, 'admin'); commit(); simulateTransmission(a); },
        requestInfo: async (id, message) => { const a = findApp(id); setStatus(a, 'needs_info', message, 'admin', { public: true }); commit(); },
        setStatus: async (id, { status, note, reference }) => {
          const a = findApp(id);
          if (reference) a.transmission = { ...(a.transmission ?? {}), authorityReference: reference };
          setStatus(a, status, note, 'admin'); commit();
        },
        retransmit: async (id) => { const a = findApp(id); setStatus(a, 'queued', 'Erneut eingereiht', 'admin'); commit(); simulateTransmission(a); },
      },
      stats: async () => {
        const paid = s.applications.filter((a) => !['draft', 'awaiting_payment', 'cancelled'].includes(a.status));
        return {
          total: s.applications.length,
          byStatus: Object.fromEntries(Object.keys(STATUSES).map((k) => [k, s.applications.filter((a) => a.status === k).length])),
          revenueServiceCents: paid.reduce((n, a) => n + (a.quote?.serviceFeeCents ?? 0), 0),
          passThroughCents: paid.reduce((n, a) => n + (a.quote?.feeMode === 'included' ? a.quote.officeFeeCents : 0), 0),
        };
      },
      frontends: {
        list: async () => clone(s.frontends),
        create: async ({ id, name, origins }) => {
          const f = { id, name, origins, apiKey: `pk_${rid()}${rid()}` };
          s.frontends.push({ id, name, origins }); commit();
          return f;
        },
      },
    },
  };
}

function merge(a, b) {
  if (typeof a !== 'object' || a === null) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] ?? {}, v) : v;
  return out;
}
