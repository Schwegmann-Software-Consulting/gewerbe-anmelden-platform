// Dateiablage, verschlüsselt. In Produktion: S3-kompatibler Speicher in DE (z. B. Hetzner, IONOS).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { encrypt, decrypt } from './security.js';

export async function putFile(applicationId, docId, buf) {
  const dir = join(config.storageDir, applicationId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${docId}.bin`);
  await writeFile(path, encrypt(buf));
  return path;
}

export async function getFile(path) {
  return decrypt(await readFile(path));
}
