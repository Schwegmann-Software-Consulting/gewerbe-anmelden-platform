// Validierungsschema der Gewerbeanzeige (angelehnt an GewA1, Anlage 1 GewAnzV).
// Wird im Frontend für Live-Validierung und im Server für die verbindliche Prüfung genutzt.
import { z } from 'zod';

const req = (msg) => z.string().trim().min(1, msg);
const plz = z.string().regex(/^\d{5}$/, 'Bitte eine fünfstellige Postleitzahl angeben');

export const addressSchema = z.object({
  street: req('Straße und Hausnummer fehlen'),
  zip: plz,
  city: req('Ort fehlt'),
});

export const personSchema = z.object({
  salutation: z.enum(['f', 'm', 'd']).optional(),
  lastName: req('Nachname fehlt'),
  firstName: req('Vorname fehlt'),
  birthName: z.string().optional().default(''),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geburtsdatum fehlt'),
  birthPlace: req('Geburtsort fehlt'),
  birthCountry: z.string().default('Deutschland'),
  nationality: req('Staatsangehörigkeit fehlt'),
  address: addressSchema,
  phone: z.string().optional().default(''),
  email: z.string().email('Bitte eine gültige E-Mail-Adresse angeben'),
});

export const businessSchema = z.object({
  cityId: req('Bitte den Standort wählen'),
  reason: z.enum(['new', 'takeover', 'relocation', 'legal_form_change']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Beginn der Tätigkeit fehlt'),
  legalForm: z.enum(['einzel', 'gbr', 'ug', 'gmbh', 'ek', 'ohg', 'kg']),
  companyName: z.string().optional().default(''),
  register: z
    .object({ court: z.string().default(''), number: z.string().default('') })
    .optional(),
  activity: z.string().trim().min(15, 'Bitte die Tätigkeit genauer beschreiben (mind. 15 Zeichen)'),
  mainOrSide: z.enum(['main', 'side']),
  establishment: z.enum(['main', 'branch']).default('main'),
  premises: addressSchema,
  employeesFull: z.coerce.number().int().min(0).default(0),
  employeesPart: z.coerce.number().int().min(0).default(0),
  needsPermit: z.boolean().default(false),
  isCraft: z.boolean().default(false),
});

export const consentSchema = z.object({
  powerOfAttorney: z.literal(true, { errorMap: () => ({ message: 'Vollmacht ist erforderlich' }) }),
  terms: z.literal(true, { errorMap: () => ({ message: 'Bitte AGB und Datenschutz bestätigen' }) }),
  earlyStart: z.literal(true, {
    errorMap: () => ({ message: 'Bitte dem sofortigen Beginn zustimmen' }),
  }),
  signedAt: z.string().optional(),
});

export const applicationSchema = z.object({
  business: businessSchema,
  person: personSchema,
  consent: consentSchema,
});

// Teilvalidierung pro Wizard-Schritt
export const stepSchemas = {
  location: businessSchema.pick({ cityId: true, reason: true, startDate: true, premises: true }),
  person: personSchema,
  business: businessSchema.pick({
    legalForm: true, activity: true, mainOrSide: true, employeesFull: true, employeesPart: true,
  }),
};

export function issues(result) {
  if (result.success) return {};
  const out = {};
  for (const i of result.error.issues) out[i.path.join('.')] = i.message;
  return out;
}

// Admin: Stadt-Konfiguration
export const cityConfigSchema = z.object({
  name: req('Name fehlt'),
  state: z.string().length(2),
  zipRanges: z.array(z.tuple([plz, plz])).min(1),
  officeFeeCents: z.number().int().min(0),
  feePercent: z.number().min(0).max(300),
  feeMode: z.enum(['included', 'direct']),
  channel: z.enum(['email', 'postal', 'fax', 'portal', 'xgewerbe']),
  authority: z.object({
    name: z.string(),
    email: z.string().optional().default(''),
    fax: z.string().optional().default(''),
    postalAddress: z.string().optional().default(''),
    portalUrl: z.string().optional().default(''),
  }),
  active: z.boolean(),
  verified: z.boolean().default(false),
});
