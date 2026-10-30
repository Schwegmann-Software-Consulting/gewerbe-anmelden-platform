// Live-Vorschau der Gewerbeanzeige: zeigt genau die Felder der GewA1, die ans Amt gehen.
// Ausgefüllte Werte werden wie mit Textmarker hervorgehoben.
import { LEGAL_FORMS, REGISTRATION_REASONS } from '@ga/core';

const de = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
const addr = (a) => (a?.street ? `${a.street}, ${a.zip ?? ''} ${a.city ?? ''}`.trim() : '');

export function rowsFor(data = {}) {
  const p = data.person ?? {}, b = data.business ?? {};
  return [
    [1, 'Name / Rechtsform', [b.companyName, LEGAL_FORMS[b.legalForm]].filter(Boolean).join(' / ')],
    [3, 'Name, Vornamen', [p.lastName, p.firstName].filter(Boolean).join(', ')],
    [5, 'Geburtsdatum, -ort', [de(p.birthDate), p.birthPlace].filter(Boolean).join(', ')],
    [6, 'Staatsangehörigkeit', p.nationality],
    [7, 'Anschrift der Wohnung', addr(p.address)],
    [9, 'Betriebsstätte', addr(b.premises)],
    [10, 'Angemeldete Tätigkeit', b.activity],
    [11, 'Beginn der Tätigkeit', de(b.startDate)],
    [12, 'Haupt-/Nebenerwerb', { main: 'Haupterwerb', side: 'Nebenerwerb' }[b.mainOrSide]],
    [13, 'Grund der Anmeldung', REGISTRATION_REASONS[b.reason]],
    [14, 'Beschäftigte (Voll / Teil)', b.employeesFull != null || b.employeesPart != null ? `${b.employeesFull ?? 0} / ${b.employeesPart ?? 0}` : ''],
  ];
}

export default function FormPreview({ data, authority, signature, stamped, compact }) {
  const rows = rowsFor(data);
  const visible = compact ? rows.slice(0, 8) : rows;
  return (
    <div className="sheet" aria-label="Vorschau der Gewerbeanmeldung">
      <div className="sheet-head">
        <h4>Gewerbe-Anmeldung</h4>
        <span>nach § 14 GewO · GewA1</span>
      </div>
      {stamped && <div className="stamp">Übermittelt<br />{stamped}</div>}
      {visible.map(([no, lbl, val]) => (
        <div className="sheet-row" key={no}>
          <span className="no">{no}</span>
          <div>
            <div className="lbl">{lbl}</div>
            <div className={`val ${val ? '' : 'empty'}`}>{val ? <mark>{val}</mark> : '—'}</div>
          </div>
        </div>
      ))}
      <div className="sheet-foot">
        <span>An: {authority || 'zuständiges Gewerbeamt'}</span>
        <div className="sheet-sig">
          {signature && <img src={signature} alt="Unterschrift" />}
          Unterschrift (Vollmacht)
        </div>
      </div>
    </div>
  );
}
