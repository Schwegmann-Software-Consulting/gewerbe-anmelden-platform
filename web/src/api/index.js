import { createHttpApi } from './http.js';
import { createMockApi } from './mock.js';

// VITE_API_URL gesetzt → echte API, sonst Demo-Modus im Browser
const baseUrl = import.meta.env.VITE_API_URL;

export const api = baseUrl
  ? createHttpApi({
    baseUrl,
    apiKey: import.meta.env.VITE_API_KEY ?? 'pk_dev_web',
    adminToken: () => { try { return sessionStorage.getItem('ga-admin-token') ?? ''; } catch { return ''; } },
  })
  : createMockApi();
