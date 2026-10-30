import { randomBytes, createHash, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const newId = (prefix) => `${prefix}_${randomBytes(10).toString('hex')}`;
export const newToken = () => randomBytes(24).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');

// Lesbare Vorgangsnummer, z. B. GA-26-7K4Q9P
export function newRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `GA-${new Date().getFullYear().toString().slice(2)}-${code}`;
}

export function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}

// AES-256-GCM für Dateien im Ruhezustand: [12 Byte IV][16 Byte Tag][Ciphertext]
const key = () => Buffer.from(config.dataKey, 'hex');
export function encrypt(buf) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}
export function decrypt(buf) {
  const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

export const hmac = (secret, body) => createHmac('sha256', secret).update(body).digest('hex');
