// Übermittlungskanäle an die Gewerbeämter
export const CHANNELS = {
  email: {
    label: 'E-Mail',
    hint: 'Ausgefülltes Formular, Vollmacht und Ausweiskopie als PDF an das Postfach des Gewerbeamts',
    automated: true,
  },
  postal: {
    label: 'Brief mit Zustellnachweis',
    hint: 'Druck & Versand über eine Briefversand-API (Einschreiben), für Ämter ohne E-Mail-Annahme',
    automated: true,
  },
  fax: {
    label: 'Fax',
    hint: 'Versand über eine Fax-API mit Sendebericht',
    automated: true,
  },
  portal: {
    label: 'Online-Portal der Stadt',
    hint: 'Eingabe im OZG-Portal der Kommune – zunächst halbautomatisch (Sachbearbeitung), später RPA',
    automated: false,
  },
  xgewerbe: {
    label: 'XGewerbeanzeige-Schnittstelle',
    hint: 'Strukturierte Übermittlung im XÖV-Standard, sobald die Kommune einen Zugang bereitstellt',
    automated: true,
  },
};

export const STATUSES = {
  draft: { label: 'Entwurf', step: 0 },
  awaiting_payment: { label: 'Wartet auf Zahlung', step: 1 },
  paid: { label: 'Bezahlt', step: 2 },
  in_review: { label: 'In Prüfung', step: 2 },
  needs_info: { label: 'Rückfrage an Kunden', step: 2 },
  queued: { label: 'Zur Übermittlung bereit', step: 3 },
  manual_required: { label: 'Manuelle Eingabe nötig', step: 3 },
  transmitted: { label: 'An das Amt übermittelt', step: 4 },
  acknowledged: { label: 'Eingang vom Amt bestätigt', step: 5 },
  completed: { label: 'Gewerbeschein liegt vor', step: 6 },
  rejected: { label: 'Vom Amt abgelehnt', step: 5 },
  cancelled: { label: 'Storniert', step: 0 },
};

// Öffentliche Fortschrittsanzeige für Kunden
export const PUBLIC_STEPS = [
  'Antrag erfasst',
  'Bezahlt',
  'Geprüft',
  'Übermittlung vorbereitet',
  'Beim Amt eingereicht',
  'Eingang bestätigt',
  'Gewerbeschein erhalten',
];

export const LEGAL_FORMS = {
  einzel: 'Einzelunternehmen',
  gbr: 'GbR',
  ug: 'UG (haftungsbeschränkt)',
  gmbh: 'GmbH',
  ek: 'Eingetragener Kaufmann (e. K.)',
  ohg: 'OHG',
  kg: 'KG',
};

export const REGISTRATION_REASONS = {
  new: 'Neugründung',
  takeover: 'Übernahme eines Betriebs',
  relocation: 'Zuzug aus einer anderen Gemeinde',
  legal_form_change: 'Wechsel der Rechtsform',
};

// Anwendungsfälle, die (noch) nicht online angeboten werden
export const UNSUPPORTED_HINTS = [
  'Freie Berufe (z. B. Ärzte, Anwälte, Designer mit künstlerischer Tätigkeit) brauchen keine Gewerbeanmeldung.',
  'Reisegewerbe und Marktgewerbe laufen über eigene Verfahren.',
];

// Leistungsmerkmale für den Anbietervergleich. Unsere eigenen Werte sind fest (true),
// Wettbewerber werden im Admin gepflegt: true | false | null (= keine Angabe / nicht geprüft).
export const COMPARISON_FEATURES = {
  fixedTotal: 'Festpreis inklusive Amtsgebühr',
  humanReview: 'Prüfung durch einen Menschen vor der Einreichung',
  livePreview: 'Live-Vorschau des amtlichen Formulars beim Ausfüllen',
  onlineSignature: 'Vollmacht direkt online unterschreiben',
  liveStatus: 'Statusverfolgung in Echtzeit',
  proof: 'Einreichung mit Versandnachweis',
  encrypted: 'Ausweis verschlüsselt gespeichert, Löschung nach Abschluss',
};
export const OUR_FEATURES = Object.fromEntries(Object.keys(COMPARISON_FEATURES).map((k) => [k, true]));
