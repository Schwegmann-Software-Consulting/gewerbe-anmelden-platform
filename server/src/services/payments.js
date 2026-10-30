// Stripe Checkout über die REST-API (ohne SDK). Ohne STRIPE_SECRET_KEY läuft ein Testmodus,
// in dem der Checkout sofort als bezahlt gilt.
import { config } from '../config.js';
import { hmac, safeEqual } from './security.js';

export const paymentsLive = () => Boolean(config.stripeSecretKey);

export async function createCheckout(app, { successUrl, cancelUrl }) {
  if (!paymentsLive()) return { provider: 'test', url: null, sessionId: `test_${app.id}` };
  const q = app.quote;
  const city = app.data.business.cityId;
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: app.data.person.email,
    client_reference_id: app.id,
    'metadata[ref]': app.ref,
    'payment_intent_data[metadata][ref]': app.ref,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    // Kunde sieht nur einen Gesamtpreis; die Aufteilung steht in metadata für die Buchhaltung
    'line_items[0][price_data][unit_amount]': String(q.totalDueCents),
    'line_items[0][price_data][product_data][name]': `Gewerbeanmeldung ${app.ref} – Komplettservice`,
    'metadata[service_fee_cents]': String(q.serviceFeeCents),
    'metadata[office_fee_cents]': String(q.feeMode === 'included' ? q.officeFeeCents : 0),
    'metadata[city]': city,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.stripeSecretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Stripe-Fehler');
  return { provider: 'stripe', url: json.url, sessionId: json.id };
}

// Prüft die Stripe-Signatur (Header "Stripe-Signature": t=...,v1=...)
export function verifyStripe(rawBody, header) {
  const parts = Object.fromEntries((header ?? '').split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  return safeEqual(hmac(config.stripeWebhookSecret, `${parts.t}.${rawBody}`), parts.v1);
}
