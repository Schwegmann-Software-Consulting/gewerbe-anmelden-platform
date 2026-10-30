const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8787),
  publicBaseUrl: env.PUBLIC_BASE_URL ?? 'http://localhost:5173',
  dbPath: env.DB_PATH ?? './data/app.db',
  storageDir: env.STORAGE_DIR ?? './data/files',
  // 32 Byte hex – verschlüsselt Uploads (Ausweiskopien) im Ruhezustand
  dataKey: env.DATA_KEY ?? '0'.repeat(64),
  adminToken: env.ADMIN_TOKEN ?? 'dev-admin-token',
  defaultFrontendKey: env.DEFAULT_FRONTEND_KEY ?? 'pk_dev_web',

  // Zahlung
  stripeSecretKey: env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',

  // Übermittlung
  transmitMode: env.TRANSMIT_MODE ?? 'dry-run', // 'dry-run' | 'live'
  reviewRequired: (env.REVIEW_REQUIRED ?? 'true') === 'true', // Vier-Augen-Prüfung vor dem Versand
  smtp: {
    host: env.SMTP_HOST ?? '',
    port: Number(env.SMTP_PORT ?? 587),
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    from: env.SMTP_FROM ?? 'Gewerbe-Anmelden <antrag@gewerbe-anmelden.com>',
    replyTo: env.SMTP_REPLY_TO ?? 'amt-antwort@gewerbe-anmelden.com',
  },
  postal: { provider: env.POSTAL_PROVIDER ?? '', apiKey: env.POSTAL_API_KEY ?? '' },
  fax: { provider: env.FAX_PROVIDER ?? '', apiKey: env.FAX_API_KEY ?? '' },

  // Ausgehende Webhooks (z. B. n8n), kommasepariert
  webhookUrls: (env.WEBHOOK_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  webhookSecret: env.WEBHOOK_SECRET ?? 'dev-webhook-secret',

  sender: {
    name: env.SENDER_NAME ?? 'Gewerbe-Anmelden (Betreiber laut Impressum)',
    address: env.SENDER_ADDRESS ?? 'Musterstraße 1, 49090 Osnabrück',
  },
};
