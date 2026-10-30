// Preislogik – identisch für Server und alle Frontends.
// Alle Beträge in Cent (Integer), um Rundungsfehler zu vermeiden.

export const VAT_RATE = 0.19;

/**
 * Servicegebühr = Amtsgebühr × Prozentsatz (brutto, inkl. USt).
 * rounding:
 *   'cent'  – kaufmännisch auf den Cent
 *   'x90'   – auf ,90 aufrunden (z. B. 23,40 € → 23,90 €)
 *   'euro'  – auf volle Euro aufrunden
 */
export function serviceFeeCents(officeFeeCents, percent, rounding = 'x90') {
  const raw = Math.round((officeFeeCents * percent) / 100);
  if (rounding === 'euro') return Math.ceil(raw / 100) * 100;
  if (rounding === 'x90') {
    const euros = Math.floor(raw / 100);
    const candidate = euros * 100 + 90;
    return candidate >= raw ? candidate : candidate + 100;
  }
  return raw;
}

/**
 * Angebot für eine Stadt.
 * feeMode:
 *   'included' – wir kassieren die Amtsgebühr mit und begleichen den Gebührenbescheid
 *   'direct'   – das Amt stellt die Gebühr dem Kunden direkt in Rechnung
 */
export function quote(city, settings = {}) {
  const rounding = settings.rounding ?? 'x90';
  const percent = city.feePercent ?? settings.defaultPercent ?? 60;
  const office = city.officeFeeCents;
  const service = serviceFeeCents(office, percent, rounding);
  const serviceNet = Math.round(service / (1 + VAT_RATE));
  const included = (city.feeMode ?? settings.defaultFeeMode ?? 'included') === 'included';
  return {
    cityId: city.id,
    currency: 'EUR',
    percent,
    feeMode: included ? 'included' : 'direct',
    officeFeeCents: office,
    serviceFeeCents: service,
    serviceFeeNetCents: serviceNet,
    serviceFeeVatCents: service - serviceNet,
    // Was der Kunde bei uns bezahlt
    totalDueCents: included ? office + service : service,
    // Was der Kunde insgesamt aufwendet (inkl. separater Amtsrechnung)
    totalCostCents: office + service,
  };
}

/**
 * Kundensicht: nur der Gesamtpreis, keine Aufteilung in Amts- und Servicegebühr.
 * Wird von allen öffentlichen Endpunkten ausgeliefert – die Aufschlüsselung gibt es nur im Admin.
 */
export function publicPrice(q) {
  if (!q) return null;
  return {
    currency: q.currency ?? 'EUR',
    totalCents: q.totalDueCents,
    // true, wenn das Amt seine Gebühr separat beim Kunden erhebt (Gebührenmodus "direct")
    officeFeeBilledSeparately: q.feeMode === 'direct',
  };
}

export const formatEuro = (cents) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((cents ?? 0) / 100);
