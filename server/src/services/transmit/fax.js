// Faxversand über eine Fax-API (z. B. sipgate, simple-fax). Stub wie beim Postversand.
import { config } from '../../config.js';

export async function sendFax({ app, city, packet }) {
  if (!config.fax.provider) throw new Error('FAX_PROVIDER ist nicht konfiguriert');
  if (!city.authority.fax) throw new Error('Für diese Stadt ist keine Faxnummer hinterlegt');
  // TODO: PDF an Fax-API übergeben, Sendebericht als proof speichern
  throw new Error(`Faxversand über ${config.fax.provider} ist noch nicht implementiert (${app.ref}, ${packet.length} Bytes)`);
}
