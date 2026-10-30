// Ausgehende Ereignisse an n8n, CRM, Buchhaltung usw.
// Signatur im Header X-GA-Signature: HMAC-SHA256(body, WEBHOOK_SECRET)
import { config } from '../config.js';
import { hmac } from './security.js';

export async function emit(type, data) {
  if (!config.webhookUrls.length) return;
  const body = JSON.stringify({ type, data, sentAt: new Date().toISOString() });
  await Promise.allSettled(config.webhookUrls.map((url) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ga-signature': hmac(config.webhookSecret, body) },
      body,
      signal: AbortSignal.timeout(8000),
    }),
  ));
}
