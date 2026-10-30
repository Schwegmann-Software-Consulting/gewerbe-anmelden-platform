// Startdaten für Städte. ALLE Gebühren, Postfächer und Kanäle sind Beispielwerte
// (verified: false) und müssen vor dem Livegang je Stadt geprüft werden.
// In Produktion kommt die PLZ→Gemeinde-Zuordnung aus dem amtlichen Gemeindeverzeichnis (AGS).
const city = (id, name, state, zipRanges, fee, channel, authority) => ({
  id, name, state, zipRanges,
  officeFeeCents: fee * 100,
  feePercent: 60,
  feeMode: 'included',
  channel,
  authority,
  active: true,
  verified: false,
});

export const SEED_CITIES = [
  city('osnabrueck', 'Osnabrück', 'NI', [['49074', '49090']], 38, 'email',
    { name: 'Stadt Osnabrück – Gewerbeangelegenheiten', email: 'gewerbe@beispiel-osnabrueck.de' }),
  city('muenster', 'Münster', 'NW', [['48143', '48167']], 36, 'email',
    { name: 'Stadt Münster – Gewerbemeldestelle', email: 'gewerbe@beispiel-muenster.de' }),
  city('berlin', 'Berlin', 'BE', [['10115', '14199']], 26, 'portal',
    { name: 'Bezirksamt – Gewerbeamt (bezirklich zuständig)', portalUrl: 'https://service.berlin.de' }),
  city('hamburg', 'Hamburg', 'HH', [['20095', '22769']], 40, 'email',
    { name: 'Bezirksamt – Fachamt Verbraucherschutz, Gewerbe und Umwelt', email: 'gewerbe@beispiel-hamburg.de' }),
  city('muenchen', 'München', 'BY', [['80331', '81929']], 50, 'portal',
    { name: 'Kreisverwaltungsreferat – Gewerbemeldungen', portalUrl: 'https://stadt.muenchen.de' }),
  city('koeln', 'Köln', 'NW', [['50667', '51149']], 36, 'email',
    { name: 'Stadt Köln – Gewerbemeldestelle', email: 'gewerbe@beispiel-koeln.de' }),
  city('frankfurt', 'Frankfurt am Main', 'HE', [['60306', '60599']], 40, 'email',
    { name: 'Ordnungsamt – Gewerbeangelegenheiten', email: 'gewerbe@beispiel-frankfurt.de' }),
  city('stuttgart', 'Stuttgart', 'BW', [['70173', '70629']], 40, 'fax',
    { name: 'Amt für öffentliche Ordnung – Gewerbe', fax: '+49 711 0000000' }),
  city('duesseldorf', 'Düsseldorf', 'NW', [['40210', '40629']], 36, 'email',
    { name: 'Ordnungsamt – Gewerbemeldestelle', email: 'gewerbe@beispiel-duesseldorf.de' }),
  city('hannover', 'Hannover', 'NI', [['30159', '30669']], 38, 'email',
    { name: 'Fachbereich Öffentliche Ordnung – Gewerbe', email: 'gewerbe@beispiel-hannover.de' }),
  city('bremen', 'Bremen', 'HB', [['28195', '28779']], 30, 'email',
    { name: 'Stadtamt Bremen – Gewerbeangelegenheiten', email: 'gewerbe@beispiel-bremen.de' }),
  city('leipzig', 'Leipzig', 'SN', [['04103', '04357']], 30, 'postal',
    { name: 'Ordnungsamt – Gewerbeangelegenheiten', postalAddress: 'Gewerbeamt Leipzig, Musterstraße 1, 04109 Leipzig' }),
  city('dresden', 'Dresden', 'SN', [['01067', '01328']], 30, 'postal',
    { name: 'Ordnungsamt – Gewerbeangelegenheiten', postalAddress: 'Gewerbeamt Dresden, Musterstraße 1, 01067 Dresden' }),
];

// Wettbewerber: nur geprüfte Angaben eintragen, mit Datum und Quelle (vergleichende Werbung, § 6 UWG).
export const DEFAULT_COMPETITORS = [
  {
    id: 'firma-de',
    name: 'firma.de',
    priceCents: 7995,
    includesOfficeFee: true,
    checkedAt: '2026-10-30',
    source: 'https://www.firma.de/gewerbeanmeldung/',
    features: { fixedTotal: true, proof: true, humanReview: null, livePreview: null, onlineSignature: null, liveStatus: null, encrypted: null },
    active: true,
  },
];

export const DEFAULT_SETTINGS = {
  defaultPercent: 60,
  rounding: 'x90',
  defaultFeeMode: 'included',
  competitors: DEFAULT_COMPETITORS,
};

export function findCityByZip(cities, zip) {
  if (!/^\d{5}$/.test(zip)) return null;
  return cities.find((c) => c.zipRanges.some(([a, b]) => zip >= a && zip <= b)) ?? null;
}

export function searchCities(cities, q) {
  const s = (q ?? '').trim().toLowerCase();
  if (!s) return cities;
  if (/^\d+$/.test(s)) {
    return cities.filter((c) => c.zipRanges.some(([a, b]) => {
      const lo = a.slice(0, s.length), hi = b.slice(0, s.length);
      return s >= lo && s <= hi;
    }));
  }
  return cities.filter((c) => c.name.toLowerCase().includes(s));
}
