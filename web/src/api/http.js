// HTTP-Adapter für die echte API. Jedes Frontend braucht nur Basis-URL + eigenen API-Key.
export function createHttpApi({ baseUrl, apiKey, adminToken }) {
  const tokens = new Map();
  const tokenFor = (id) => tokens.get(id) ?? sessionStorageGet(`ga-token-${id}`);

  async function req(path, { method = 'GET', body, app, admin, form } = {}) {
    const headers = { 'x-api-key': apiKey };
    if (app) headers['x-application-token'] = tokenFor(app);
    if (admin) headers.authorization = `Bearer ${adminToken()}`;
    if (body) headers['content-type'] = 'application/json';
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
    const json = res.status === 204 ? {} : await res.json();
    if (!res.ok) throw Object.assign(new Error(json.message ?? json.error ?? 'Fehler'), { status: res.status, details: json });
    return json;
  }

  return {
    mode: 'http',
    cities: {
      search: (q = '') => req(`/cities?q=${encodeURIComponent(q)}`).then((r) => r.data),
      resolve: (zip) => req(`/cities/resolve?zip=${zip}`).then((r) => r.data),
      get: (id) => req(`/cities/${id}`).then((r) => r.data),
    },
    comparison: (cityId) => req(`/comparison${cityId ? `?cityId=${cityId}` : ''}`).then((r) => r.data),
    applications: {
      async create(body) {
        const r = await req('/applications', { method: 'POST', body });
        tokens.set(r.data.id, r.data.accessToken);
        sessionStorageSet(`ga-token-${r.data.id}`, r.data.accessToken);
        return r.data;
      },
      get: (id) => req(`/applications/${id}`, { app: id }).then((r) => r.data),
      patch: (id, data) => req(`/applications/${id}`, { method: 'PATCH', body: { data }, app: id }).then((r) => r.data),
      upload(id, kind, file) {
        const form = new FormData();
        form.set('kind', kind);
        form.set('file', file);
        return req(`/applications/${id}/documents`, { method: 'POST', form, app: id }).then((r) => r.data);
      },
      submit: (id, returnUrl) => req(`/applications/${id}/submit`, { method: 'POST', body: { returnUrl }, app: id }).then((r) => r.data),
    },
    admin: {
      settings: {
        get: () => req('/admin/settings', { admin: true }).then((r) => r.data),
        put: (s) => req('/admin/settings', { method: 'PUT', body: s, admin: true }).then((r) => r.data),
      },
      cities: {
        list: () => req('/admin/cities', { admin: true }).then((r) => r.data),
        put: (id, c) => req(`/admin/cities/${id}`, { method: 'PUT', body: c, admin: true }).then((r) => r.data),
        remove: (id) => req(`/admin/cities/${id}`, { method: 'DELETE', admin: true }),
        bulk: (body) => req('/admin/cities/bulk', { method: 'POST', body, admin: true }).then((r) => r.data),
      },
      applications: {
        list: (q = {}) => req(`/admin/applications?${new URLSearchParams(q)}`, { admin: true }).then((r) => r.data),
        get: (id) => req(`/admin/applications/${id}`, { admin: true }).then((r) => r.data),
        approve: (id) => req(`/admin/applications/${id}/approve`, { method: 'POST', admin: true }),
        requestInfo: (id, message) => req(`/admin/applications/${id}/request-info`, { method: 'POST', body: { message }, admin: true }),
        setStatus: (id, body) => req(`/admin/applications/${id}/status`, { method: 'POST', body, admin: true }),
        retransmit: (id) => req(`/admin/applications/${id}/retransmit`, { method: 'POST', admin: true }),
      },
      stats: () => req('/admin/stats', { admin: true }).then((r) => r.data),
      frontends: {
        list: () => req('/admin/frontends', { admin: true }).then((r) => r.data),
        create: (body) => req('/admin/frontends', { method: 'POST', body, admin: true }).then((r) => r.data),
      },
    },
  };
}

function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* egal */ } }
