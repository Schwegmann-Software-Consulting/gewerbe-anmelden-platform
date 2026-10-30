// Erzeugt das Einreichungspaket für das Amt:
//   1. Anschreiben (Bevollmächtigter → Gewerbeamt)
//   2. Gewerbe-Anmeldung mit den Feldern der GewA1 (Anlage 1 GewAnzV)
//   3. Vollmacht mit Unterschrift des Kunden
//   4. Ausweiskopie (Vorder-/Rückseite) und weitere Nachweise
// Hinweis: Für den Livegang je Bundesland das amtliche, ausfüllbare GewA1-PDF
// befüllen (pdf-lib getForm()). Dieses Layout ist der neutrale Fallback.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { LEGAL_FORMS, REGISTRATION_REASONS } from '@ga/core';
import { config } from '../config.js';
import { documents } from '../db.js';
import { getFile } from './storage.js';

const A4 = [595.28, 841.89];
const deDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

export async function buildPacket(app, city) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Gewerbeanmeldung ${app.ref}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { person: p, business: b } = app.data;
  const fullName = `${p.firstName} ${p.lastName}`;

  const page = () => {
    const pg = pdf.addPage(A4);
    let y = A4[1] - 60;
    const api = {
      pg,
      text(t, { size = 10, f = font, x = 56, gap = 4 } = {}) {
        for (const line of wrap(String(t ?? ''), f, size, A4[0] - x - 56)) {
          pg.drawText(line, { x, y, size, font: f, color: rgb(0.1, 0.13, 0.17) });
          y -= size + gap;
        }
      },
      space(h = 10) { y -= h; },
      field(no, label, value) {
        pg.drawText(String(no), { x: 56, y, size: 8, font: bold, color: rgb(0.4, 0.45, 0.5) });
        pg.drawText(label, { x: 76, y, size: 8, font, color: rgb(0.4, 0.45, 0.5) });
        y -= 12;
        api.text(value || '–', { x: 76, size: 10.5, gap: 3 });
        pg.drawLine({ start: { x: 76, y: y + 2 }, end: { x: A4[0] - 56, y: y + 2 }, thickness: 0.4, color: rgb(0.8, 0.82, 0.85) });
        y -= 8;
      },
      get y() { return y; },
      set y(v) { y = v; },
    };
    return api;
  };

  // 1. Anschreiben
  const a = page();
  a.text(config.sender.name, { size: 9 });
  a.text(config.sender.address, { size: 9 });
  a.space(30);
  a.text(city.authority.name, { size: 11 });
  if (city.authority.postalAddress) a.text(city.authority.postalAddress, { size: 11 });
  a.space(30);
  a.text(`Gewerbeanmeldung nach § 14 GewO – ${fullName} – Vorgang ${app.ref}`, { size: 12, f: bold });
  a.space(14);
  a.text('Sehr geehrte Damen und Herren,');
  a.space(6);
  a.text(`im Auftrag und mit Vollmacht von ${fullName} übersenden wir die Anzeige über den Beginn eines stehenden Gewerbebetriebs in Ihrer Gemeinde. Beigefügt sind die Gewerbeanmeldung, die unterschriebene Vollmacht sowie eine Kopie des Ausweisdokuments.`);
  a.space(6);
  a.text(`Bitte senden Sie die Empfangsbescheinigung (§ 15 Abs. 1 GewO) und einen eventuellen Gebührenbescheid unter Angabe der Vorgangsnummer ${app.ref} an ${config.smtp.replyTo}. Rückfragen zur Sache können Sie auch direkt an ${p.email} richten.`);
  a.space(6);
  a.text('Mit freundlichen Grüßen');
  a.text(config.sender.name);

  // 2. Gewerbeanmeldung
  const g = page();
  g.text('Gewerbe-Anmeldung nach § 14 GewO', { size: 15, f: bold });
  g.text(`Inhalt entsprechend Anlage 1 GewAnzV (GewA1) – Vorgang ${app.ref}`, { size: 9 });
  g.space(10);
  const rows = [
    [1, 'Im Handelsregister eingetragener Name / Rechtsform', `${b.companyName || '–'} / ${LEGAL_FORMS[b.legalForm]}`],
    [2, 'Registergericht und -nummer', b.register?.number ? `${b.register.court} ${b.register.number}` : '–'],
    [3, 'Name, Vornamen', `${p.lastName}, ${p.firstName}`],
    [4, 'Geburtsname', p.birthName],
    [5, 'Geburtsdatum, Geburtsort und -land', `${deDate(p.birthDate)}, ${p.birthPlace}, ${p.birthCountry}`],
    [6, 'Staatsangehörigkeit', p.nationality],
    [7, 'Anschrift der Wohnung', `${p.address.street}, ${p.address.zip} ${p.address.city}`],
    [8, 'Kontakt', [p.phone, p.email].filter(Boolean).join(' · ')],
    [9, 'Betriebsstätte', `${b.premises.street}, ${b.premises.zip} ${b.premises.city}`],
    [10, 'Angemeldete Tätigkeit', b.activity],
    [11, 'Beginn der Tätigkeit', deDate(b.startDate)],
    [12, 'Art des Betriebs', `${b.establishment === 'main' ? 'Hauptniederlassung' : 'Zweigniederlassung'}; ${b.mainOrSide === 'main' ? 'im Haupterwerb' : 'im Nebenerwerb'}; Handwerk: ${b.isCraft ? 'ja' : 'nein'}`],
    [13, 'Grund der Anmeldung', REGISTRATION_REASONS[b.reason]],
    [14, 'Zahl der Beschäftigten (ohne Inhaber)', `Vollzeit ${b.employeesFull}, Teilzeit ${b.employeesPart}`],
    [15, 'Erlaubnis / Handwerkskarte erforderlich', b.needsPermit ? 'ja – Nachweis liegt bei' : 'nein'],
  ];
  for (const [n, l, v] of rows) g.field(n, l, v);
  g.space(8);
  g.text(`Anzeige erstattet durch Bevollmächtigten (${config.sender.name}) am ${new Date().toLocaleDateString('de-DE')}.`, { size: 9 });

  // 3. Vollmacht
  const v = page();
  v.text('Vollmacht', { size: 15, f: bold });
  v.space(8);
  v.text(`Hiermit bevollmächtige ich, ${fullName}, geboren am ${deDate(p.birthDate)}, wohnhaft ${p.address.street}, ${p.address.zip} ${p.address.city},`);
  v.text(`${config.sender.name}, ${config.sender.address},`);
  v.text(`mein Gewerbe (Tätigkeit: ${b.activity}) bei der zuständigen Behörde (${city.authority.name}) anzumelden, die hierfür erforderlichen Erklärungen abzugeben und Bescheide sowie Bescheinigungen in dieser Sache für mich entgegenzunehmen. Die Vollmacht gilt nur für diesen Vorgang (${app.ref}).`);
  v.space(16);
  v.text(`${b.premises.city}, ${new Date(app.data.consent?.signedAt ?? Date.now()).toLocaleDateString('de-DE')}`);
  const sig = documents.list(app.id).find((d) => d.kind === 'signature');
  if (sig) {
    const img = await pdf.embedPng(await getFile(sig.path));
    const w = 180, h = (img.height / img.width) * w;
    v.space(h);
    v.pg.drawImage(img, { x: 56, y: v.y, width: w, height: h });
  }
  v.space(6);
  v.text(`Unterschrift ${fullName}`, { size: 8 });

  // 4. Anlagen
  for (const d of documents.list(app.id).filter((x) => x.kind !== 'signature')) {
    const buf = await getFile(d.path);
    if (d.mime === 'application/pdf') {
      const src = await PDFDocument.load(buf);
      for (const pg of await pdf.copyPages(src, src.getPageIndices())) pdf.addPage(pg);
      continue;
    }
    const img = d.mime === 'image/png' ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
    const pg = pdf.addPage(A4);
    const maxW = A4[0] - 112, maxH = A4[1] - 160;
    const s = Math.min(maxW / img.width, maxH / img.height, 1);
    pg.drawText(`Anlage: ${labelFor(d.kind)}`, { x: 56, y: A4[1] - 60, size: 11, font: bold });
    pg.drawImage(img, { x: 56, y: A4[1] - 80 - img.height * s, width: img.width * s, height: img.height * s });
  }
  return Buffer.from(await pdf.save());
}

const labelFor = (k) => ({
  id_front: 'Ausweis Vorderseite', id_back: 'Ausweis Rückseite', permit: 'Erlaubnis / Nachweis',
  register_extract: 'Handelsregisterauszug', other: 'Weiterer Nachweis',
}[k] ?? k);

function wrap(text, font, size, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
