// Städte, die nur über ihr eigenes Online-Portal annehmen:
// Phase 1 – Aufgabe für Sachbearbeitung (Daten + Paket stehen im Admin bereit, Status manual_required)
// Phase 2 – Browser-Automatisierung (Playwright) je Portal-Typ, z. B. pro Landesportal einmal gebaut
export async function preparePortal({ app, city }) {
  return {
    channel: 'portal',
    status: 'manual_required',
    reference: null,
    proof: { portalUrl: city.authority.portalUrl, task: `Antrag ${app.ref} im Portal erfassen und Eingangsnummer eintragen` },
  };
}
