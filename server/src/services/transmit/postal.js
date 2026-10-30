// Briefversand mit Zustellnachweis über einen Druck-&-Versand-Dienst (z. B. LetterXpress, Pingen).
// Die API-Anbindung ist bewusst als Stub angelegt: Provider wählen, dann hier implementieren.
import { config } from '../../config.js';

export async function sendPostal({ app, city, packet }) {
  if (!config.postal.provider) throw new Error('POSTAL_PROVIDER ist nicht konfiguriert');
  if (!city.authority.postalAddress) throw new Error('Für diese Stadt ist keine Postanschrift hinterlegt');
  // TODO: provider-spezifischer Upload von `packet` (PDF) mit Versandart "Einschreiben"
  // const res = await fetch(PROVIDER_URL, { method: 'POST', headers: {...}, body: ... });
  throw new Error(`Postversand über ${config.postal.provider} ist noch nicht implementiert (${app.ref}, ${packet.length} Bytes)`);
}
