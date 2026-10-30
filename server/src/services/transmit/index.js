// Übermittlung an das zuständige Amt. Jeder Kanal ist ein Adapter mit derselben Signatur:
//   send({ app, city, packet }) → { channel, status: 'transmitted' | 'manual_required', reference, proof }
// TRANSMIT_MODE=dry-run speichert nur das Paket und protokolliert, ohne an Behörden zu senden.
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../../config.js';
import { applications, cities, events } from '../../db.js';
import { buildPacket } from '../pdf.js';
import { setStatus } from '../workflow.js';
import { sendEmail } from './email.js';
import { sendPostal } from './postal.js';
import { sendFax } from './fax.js';
import { preparePortal } from './portal.js';
import { sendXGewerbe } from './xgewerbe.js';

const ADAPTERS = { email: sendEmail, postal: sendPostal, fax: sendFax, portal: preparePortal, xgewerbe: sendXGewerbe };

export async function transmit(applicationId) {
  const app = applications.get(applicationId);
  if (!app || app.status !== 'queued') return; // idempotent: nur aus "queued"
  const city = cities.get(app.cityId);
  const packet = await buildPacket(app, city);

  const dir = join(config.storageDir, app.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'packet.pdf'), packet); // Kopie fürs Admin-Backend

  let result;
  if (config.transmitMode !== 'live') {
    result = { channel: city.channel, status: city.channel === 'portal' ? 'manual_required' : 'transmitted', reference: 'dry-run', proof: { note: 'Testmodus – nichts versendet' } };
  } else {
    const adapter = ADAPTERS[city.channel];
    if (!adapter) throw new Error(`Kein Adapter für Kanal ${city.channel}`);
    result = await adapter({ app, city, packet });
  }

  applications.update(app.id, { transmission: { ...result, at: new Date().toISOString() } });
  events.add(app.id, 'transmission', result, 'worker');
  setStatus(app, result.status, { actor: 'worker', note: `Kanal: ${result.channel}` });
}
