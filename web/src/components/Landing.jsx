import { useEffect, useState } from 'react';
import { formatEuro } from '@ga/core';
import { Icon } from './ui.jsx';
import { api } from '../api/index.js';
import FormPreview from './FormPreview.jsx';

const SAMPLE = {
  person: { lastName: 'Hoffmann', firstName: 'Lena', birthDate: '1996-03-14', birthPlace: 'Bremen', nationality: 'deutsch', address: { street: 'Lotter Straße 12', zip: '49078', city: 'Osnabrück' } },
  business: { legalForm: 'einzel', premises: { street: 'Lotter Straße 12', zip: '49078', city: 'Osnabrück' }, activity: 'Online-Handel mit handgefertigtem Schmuck', startDate: '2026-12-01', mainOrSide: 'side' },
};

// Kunden sehen nur den Gesamtpreis – die Aufteilung gibt es nur im Admin
export function TotalPrice({ price }) {
  if (!price) return null;
  return (
    <div className="total-price">
      <span className="tp-label">Gesamtpreis</span>
      <span className="tp-value">{formatEuro(price.totalCents)}</span>
      <span className="tp-note">
        {price.officeFeeBilledSeparately
          ? 'inkl. MwSt., zzgl. Gebühr des Gewerbeamts'
          : 'inkl. MwSt. und aller Gebühren des Gewerbeamts'}
      </span>
    </div>
  );
}

export default function Landing({ onStart }) {
  const [q, setQ] = useState('');
  const [city, setCity] = useState(null);
  const [miss, setMiss] = useState(null);
  const [cities, setCities] = useState([]);

  useEffect(() => { api.cities.search('').then(setCities); }, []);

  async function lookup(value) {
    setMiss(null);
    const v = value.trim();
    if (/^\d{5}$/.test(v)) {
      try { setCity(await api.cities.resolve(v)); } catch (e) { setCity(null); setMiss(e.message); }
      return;
    }
    const hits = await api.cities.search(v);
    if (hits.length === 1 || (hits[0] && hits[0].name.toLowerCase() === v.toLowerCase())) setCity(hits[0]);
    else if (!hits.length) { setCity(null); setMiss('Diese Stadt bieten wir noch nicht an.'); }
    else { setCity(null); setMiss(`Mehrere Treffer: ${hits.map((h) => h.name).join(', ')}. Bitte genauer eingeben.`); }
  }

  return (
    <>
      <section className="hero">
        <div>
          <h1>Gewerbe anmelden, ohne aufs Amt zu gehen.</h1>
          <p className="hero-lead">
            Sie füllen ein verständliches Formular aus, wir prüfen es und reichen Ihre Gewerbeanmeldung
            mit Vollmacht beim zuständigen Gewerbeamt ein. Den Gewerbeschein schickt Ihnen das Amt.
          </p>
          <form className="finder" onSubmit={(e) => { e.preventDefault(); lookup(q); }}>
            <label htmlFor="finder">Wo liegt Ihre Betriebsstätte?</label>
            <div className="finder-input">
              <input id="finder" className="input" inputMode="text" autoComplete="postal-code" placeholder="PLZ oder Stadt"
                value={q} onChange={(e) => { setQ(e.target.value); if (/^\d{5}$/.test(e.target.value)) lookup(e.target.value); }} />
              <button className="btn btn-primary" type="submit">Preis zeigen</button>
            </div>
            {!city && (
              <div className="city-chips" aria-label="Verfügbare Städte">
                {cities.slice(0, 8).map((c) => (
                  <button type="button" className="city-chip" key={c.id} onClick={() => { setQ(c.name); setCity(c); setMiss(null); }}>{c.name}</button>
                ))}
              </div>
            )}
            {miss && <p className="finder-miss">{miss}</p>}
            {city && (
              <div className="finder-result">
                <h3>{city.name}</h3>
                <p className="authority">Zuständig: {city.authorityName}</p>
                <TotalPrice price={city.price} />
                <button type="button" className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => onStart(city)}>
                  Anmeldung für {city.name} starten
                </button>
              </div>
            )}
          </form>
        </div>
        <div className="hero-paper" aria-hidden="true">
          <div className="sheet-back" />
          <FormPreview data={SAMPLE} authority="Stadt Osnabrück" compact stamped="am 02.12." />
        </div>
      </section>

      <Comparison city={city} />

      <section className="section">
        <h2>Was technisch hinter Ihrer Anmeldung steckt</h2>
        <p className="section-lead">Wir haben die Gewerbeanmeldung von Grund auf digital gebaut, statt ein Papierformular online zu stellen.</p>
        <div className="tech-grid">
          <div><h3>Sie sehen, was ans Amt geht</h3><p>Neben dem Formular füllt sich live das amtliche Formular. Keine Überraschungen, kein Blindflug.</p></div>
          <div><h3>Fehler fallen vor dem Amt auf</h3><p>Ihre Angaben werden beim Tippen geprüft und vor dem Versand noch einmal von einem Menschen. Typische Ablehnungsgründe wie zu vage Tätigkeiten werden so abgefangen.</p></div>
          <div><h3>Der richtige Weg je Stadt</h3><p>Jede Stadt bekommt die Anmeldung auf dem Weg, den sie annimmt: E-Mail, Einschreiben, Fax oder ihr eigenes Portal. Jede Einreichung wird mit Nachweis protokolliert.</p></div>
          <div><h3>Status statt Warteschleife</h3><p>Sie sehen jederzeit, wo Ihr Antrag steht, und bekommen jede Änderung per E-Mail. Rückfragen des Amts landen bei uns, nicht in Ihrem Briefkasten.</p></div>
          <div><h3>Ausweisdaten sicher</h3><p>Uploads werden mit AES-256 verschlüsselt gespeichert und nach Abschluss automatisch gelöscht.</p></div>
          <div><h3>Unterschrift in Sekunden</h3><p>Die Vollmacht unterschreiben Sie mit Finger, Maus oder Stift. Kein Drucken, kein Scannen.</p></div>
        </div>
      </section>

      <section className="section">
        <h2>So läuft Ihre Anmeldung ab</h2>
        <ol className="steps-row">
          <li><div className="n">1</div><h3>Formular ausfüllen</h3><p>Rund zehn Minuten. Wir fragen in Alltagssprache und zeigen live, was davon im amtlichen Formular landet.</p></li>
          <li><div className="n">2</div><h3>Wir prüfen und reichen ein</h3><p>Ein Mensch prüft Ihre Angaben auf typische Fehler. Danach geht die Anmeldung mit Vollmacht an Ihr Gewerbeamt.</p></li>
          <li><div className="n">3</div><h3>Das Amt bestätigt</h3><p>Sie verfolgen jeden Schritt online. Den Gewerbeschein stellt das Gewerbeamt aus, meist innerhalb weniger Tage bis Wochen.</p></li>
        </ol>
      </section>

      <section className="section">
        <h2>Selbst anmelden oder mit uns?</h2>
        <p className="section-lead">
          Sie können Ihr Gewerbe jederzeit selbst und nur gegen die Amtsgebühr anmelden. Wir sind ein privater
          Dienstleister und berechnen dafür eine Servicegebühr.
        </p>
        <div className="compare">
          <div>
            <h3>Selbst beim Gewerbeamt</h3>
            <ul>
              <li>Nur die Amtsgebühr</li>
              <li>Formular selbst finden und ausfüllen, je nach Stadt Termin, Portal mit Online-Ausweis oder Post</li>
              <li>Rückfragen klären Sie direkt mit dem Amt</li>
            </ul>
          </div>
          <div className="ours">
            <h3>Mit gewerbe-anmelden.com</h3>
            <ul>
              <li>Ein fester Gesamtpreis inklusive Amtsgebühr, vor dem Start sichtbar</li>
              <li>Ein Formular für alle Städte, mit Prüfung vor der Einreichung</li>
              <li>Einreichung per Vollmacht, Statusverfolgung, Rückfragen über uns</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Häufige Fragen</h2>
        <div className="faq">
          <details><summary>Ist das eine Behörde?</summary><p>Nein. Wir sind ein privater Dienstleister. Die Anmeldung selbst nimmt ausschließlich das zuständige Gewerbeamt entgegen und bearbeitet sie.</p></details>
          <details><summary>Was brauche ich?</summary><p>Personalausweis oder Reisepass (Foto oder Scan), Ihre Angaben zur Tätigkeit und eine Unterschrift auf dem Bildschirm für die Vollmacht. Für erlaubnispflichtige Tätigkeiten zusätzlich die Erlaubnis.</p></details>
          <details><summary>Wie lange dauert es?</summary><p>Wir prüfen werktags in der Regel am selben Tag. Die Bearbeitung beim Gewerbeamt dauert je nach Stadt einige Tage bis wenige Wochen.</p></details>
          <details><summary>Wer braucht keine Gewerbeanmeldung?</summary><p>Freie Berufe wie Ärztinnen, Anwälte oder künstlerisch Tätige melden sich nur beim Finanzamt. Im Zweifel fragen Sie Ihr Finanzamt oder Ihre Kammer.</p></details>
        </div>
      </section>
    </>
  );
}

// Preis-Leistungs-Vergleich. Wettbewerberdaten kommen aus dem Admin (mit Prüfdatum und Quelle).
function Comparison({ city }) {
  const [cmp, setCmp] = useState(null);
  useEffect(() => { api.comparison(city?.id).then(setCmp); }, [city?.id]);
  if (!cmp || !cmp.competitors.length) return null;
  const { ours, competitors, features } = cmp;
  const cell = (v) => (v === true
    ? <span className="yes">{Icon.check}<span>Ja</span></span>
    : v === false ? <span className="no">Nein</span> : <span className="na">keine Angabe</span>);
  const cheapest = competitors.filter((c) => c.includesOfficeFee && ours.includesOfficeFee)
    .map((c) => ({ ...c, diff: c.priceCents - ours.priceCents })).sort((a, b) => b.diff - a.diff)[0];

  return (
    <section className="section">
      <h2>Mehr Leistung für weniger Geld</h2>
      <p className="section-lead">
        {city ? `Für ${city.name} zahlen Sie bei uns ${formatEuro(ours.priceCents)}` : `Bei uns ab ${formatEuro(ours.priceCents)}`}
        {' '}inklusive Amtsgebühr{cheapest && cheapest.diff > 0 && !ours.priceIsFrom ? ` – ${formatEuro(cheapest.diff)} weniger als bei ${cheapest.name}` : ''}.
      </p>
      <div className="table-wrap cmp" style={{ marginTop: 28 }}>
        <table>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Merkmal</span></th>
              <th scope="col" className="ours-col">gewerbe-anmelden.com</th>
              {competitors.map((c) => <th scope="col" key={c.id}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Gesamtpreis</th>
              <td className="ours-col"><strong className="cmp-price">{ours.priceIsFrom ? 'ab ' : ''}{formatEuro(ours.priceCents)}</strong></td>
              {competitors.map((c) => <td key={c.id}><span className="cmp-price">{formatEuro(c.priceCents)}</span></td>)}
            </tr>
            {Object.entries(features).map(([k, label]) => (
              <tr key={k}>
                <th scope="row">{label}</th>
                <td className="ours-col">{cell(ours.features[k])}</td>
                {competitors.map((c) => <td key={c.id}>{cell(c.features?.[k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cmp-foot">
        Angaben zu anderen Anbietern laut deren Website:{' '}
        {competitors.map((c, i) => (
          <span key={c.id}>{i > 0 && '; '}{c.name}, Stand {c.checkedAt.split('-').reverse().join('.')} (<a href={c.source} target="_blank" rel="noreferrer">Quelle</a>)</span>
        ))}. „Keine Angabe“ heißt: auf der Website nicht ersichtlich. {ours.priceIsFrom && 'Unser Preis hängt von der Gebühr Ihrer Stadt ab.'}
      </p>
    </section>
  );
}
