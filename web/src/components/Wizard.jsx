import { useEffect, useRef, useState } from 'react';
import { stepSchemas, issues, LEGAL_FORMS, REGISTRATION_REASONS, formatEuro } from '@ga/core';
import { api } from '../api/index.js';
import FormPreview from './FormPreview.jsx';
import { TotalPrice } from './Landing.jsx';
import { Field, Choices, Icon } from './ui.jsx';

const STEPS = ['Standort', 'Person', 'Tätigkeit', 'Unterlagen', 'Prüfen & bezahlen'];

const empty = (cityId, cityName) => ({
  business: {
    cityId, reason: 'new', startDate: '', legalForm: 'einzel', companyName: '', activity: '', mainOrSide: 'main',
    establishment: 'main', premises: { street: '', zip: '', city: cityName ?? '' },
    employeesFull: 0, employeesPart: 0, needsPermit: false, isCraft: false,
  },
  person: {
    salutation: undefined, lastName: '', firstName: '', birthName: '', birthDate: '', birthPlace: '',
    birthCountry: 'Deutschland', nationality: 'deutsch', address: { street: '', zip: '', city: '' }, phone: '', email: '',
  },
  consent: { powerOfAttorney: false, terms: false, earlyStart: false },
});

// Setzt einen Wert über einen Pfad wie "business.premises.zip"
const setIn = (obj, path, value) => {
  const [k, ...rest] = path.split('.');
  return { ...obj, [k]: rest.length ? setIn(obj[k] ?? {}, rest.join('.'), value) : value };
};

export default function Wizard({ initialCity, onDone, onCancel }) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [city, setCity] = useState(initialCity);
  const [data, setData] = useState(() => empty(initialCity?.id, initialCity?.name));
  const [errors, setErrors] = useState({});
  const [app, setApp] = useState(null);
  const [docs, setDocs] = useState({});
  const [signature, setSignature] = useState(null);
  const [sameAddress, setSameAddress] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const top = useRef(null);

  const b = data.business, p = data.person;
  const set = (path, value) => setData((d) => setIn(d, path, value));
  const bind = (path) => ({
    value: path.split('.').reduce((o, k) => o?.[k], data) ?? '',
    onChange: (e) => set(path, e.target.type === 'number' ? Number(e.target.value) : e.target.value),
  });
  const err = (path) => errors[path];

  // Zuständige Stadt aus der PLZ der Betriebsstätte ableiten
  useEffect(() => {
    const zip = b.premises.zip;
    if (!/^\d{5}$/.test(zip)) return;
    api.cities.resolve(zip)
      .then((c) => { setCity(c); setData((d) => setIn(setIn(d, 'business.cityId', c.id), 'business.premises.city', d.business.premises.city || c.name)); setErrors((e) => ({ ...e, 'business.premises.zip': undefined })); })
      .catch(() => { setCity(null); set('business.cityId', ''); setErrors((e) => ({ ...e, 'business.premises.zip': 'Für diese PLZ bieten wir die Anmeldung noch nicht an.' })); });
  }, [b.premises.zip]);

  useEffect(() => { top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [step]);

  function validate(i) {
    let res = {};
    if (i === 0) {
      res = prefix('business.', issues(stepSchemas.location.safeParse(b)));
      if (!city) res['business.premises.zip'] = res['business.premises.zip'] ?? 'Bitte eine PLZ aus unserem Gebiet angeben';
    }
    if (i === 1) res = prefix('person.', issues(stepSchemas.person.safeParse(withAddress())));
    if (i === 2) res = prefix('business.', issues(stepSchemas.business.safeParse(b)));
    if (i === 3) {
      if (!docs.id_front) res.id_front = 'Bitte die Vorderseite Ihres Ausweises hochladen';
      if (!signature) res.signature = 'Bitte unterschreiben Sie die Vollmacht';
      if (b.needsPermit && !docs.permit) res.permit = 'Bitte die Erlaubnis bzw. den Nachweis hochladen';
      if (!data.consent.powerOfAttorney) res.powerOfAttorney = 'Ohne Vollmacht können wir nicht für Sie einreichen';
    }
    if (i === 4) {
      if (!data.consent.terms) res.terms = 'Bitte AGB und Datenschutzhinweise bestätigen';
      if (!data.consent.earlyStart) res.earlyStart = 'Bitte dem sofortigen Beginn zustimmen';
    }
    setErrors(res);
    return Object.keys(res).length === 0;
  }

  const withAddress = () => (sameAddress ? { ...p, address: { ...b.premises } } : p);
  const payload = () => ({ ...data, person: withAddress() });

  async function next() {
    if (!validate(step)) return;
    setBusy(true); setServerError(null);
    try {
      let current = app;
      if (!current) {
        current = await api.applications.create({ cityId: b.cityId });
        setApp(current);
      }
      await api.applications.patch(current.id, payload());
      const n = step + 1;
      setStep(n); setReached((r) => Math.max(r, n));
    } catch (e) { setServerError(e.message); } finally { setBusy(false); }
  }

  async function submit() {
    if (!validate(4)) return;
    setBusy(true); setServerError(null);
    try {
      await api.applications.patch(app.id, { ...payload(), consent: { ...data.consent, signedAt: new Date().toISOString() } });
      const r = await api.applications.submit(app.id, window.location.href.split('#')[0]);
      if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
      onDone(app.id);
    } catch (e) {
      const d = e.details ?? {};
      setServerError(d.missing ? `Es fehlen noch Unterlagen: ${d.missing.join(', ')}` : d.fields ? 'Einige Angaben sind unvollständig. Bitte prüfen Sie die Schritte.' : e.message);
    } finally { setBusy(false); }
  }

  async function upload(kind, file) {
    if (!app) return;
    const d = await api.applications.upload(app.id, kind, file);
    setDocs((x) => ({ ...x, [kind]: d }));
    setErrors((e) => ({ ...e, [kind]: undefined }));
  }

  const previewData = payload();

  return (
    <div className="wizard" ref={top}>
      <div>
        <nav className="stepper" aria-label="Fortschritt">
          {STEPS.map((s, i) => (
            <button key={s} type="button" disabled={i > reached} onClick={() => setStep(i)}
              className={i === step ? 'current' : i < reached || i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="dot">{i < step ? Icon.check : i + 1}</span>{s}
            </button>
          ))}
        </nav>

        {city && <div className="mobile-price"><span>{city.name}</span><strong>{formatEuro(city.price.totalCents)}</strong></div>}

        <div className="card">
          {step === 0 && (
            <>
              <h2>Wo und ab wann?</h2>
              <p className="card-lead">Zuständig ist das Gewerbeamt am Ort Ihrer Betriebsstätte. Arbeiten Sie von zu Hause, ist das Ihre Wohnadresse.</p>
              <div className="stack">
                <Field label="Straße und Hausnummer der Betriebsstätte" error={err('business.premises.street')}>
                  <input className="input" autoComplete="street-address" {...bind('business.premises.street')} />
                </Field>
                <div className="grid-2">
                  <Field label="PLZ" error={err('business.premises.zip')}>
                    <input className="input" inputMode="numeric" maxLength={5} autoComplete="postal-code" {...bind('business.premises.zip')} />
                  </Field>
                  <Field label="Ort" error={err('business.premises.city')}>
                    <input className="input" {...bind('business.premises.city')} />
                  </Field>
                </div>
                {city && <div className="callout"><strong>Zuständig: {city.authorityName}.</strong> Gesamtpreis {formatEuro(city.price.totalCents)}.</div>}
                <Field label="Was trifft zu?">
                  <Choices name="reason" value={b.reason} onChange={(v) => set('business.reason', v)} options={REGISTRATION_REASONS} />
                </Field>
                <Field label="Ab wann sind Sie tätig?" hint="darf auch heute oder in Kürze sein" error={err('business.startDate')}>
                  <input className="input" type="date" {...bind('business.startDate')} style={{ maxWidth: 220 }} />
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2>Angaben zu Ihrer Person</h2>
              <p className="card-lead">So, wie es in Ihrem Ausweis steht. Das Amt gleicht die Angaben mit der Ausweiskopie ab.</p>
              <div className="stack">
                <div className="grid-2">
                  <Field label="Vorname(n)" error={err('person.firstName')}><input className="input" autoComplete="given-name" {...bind('person.firstName')} /></Field>
                  <Field label="Nachname" error={err('person.lastName')}><input className="input" autoComplete="family-name" {...bind('person.lastName')} /></Field>
                </div>
                <div className="grid-2">
                  <Field label="Geburtsdatum" error={err('person.birthDate')}><input className="input" type="date" autoComplete="bday" {...bind('person.birthDate')} /></Field>
                  <Field label="Geburtsname" hint="nur falls abweichend"><input className="input" {...bind('person.birthName')} /></Field>
                </div>
                <div className="grid-2">
                  <Field label="Geburtsort" error={err('person.birthPlace')}><input className="input" {...bind('person.birthPlace')} /></Field>
                  <Field label="Staatsangehörigkeit" error={err('person.nationality')}><input className="input" {...bind('person.nationality')} /></Field>
                </div>
                <label className="check">
                  <input type="checkbox" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} />
                  Ich wohne an der Adresse der Betriebsstätte ({b.premises.street || '–'}, {b.premises.zip} {b.premises.city})
                </label>
                {!sameAddress && (
                  <div className="grid-3">
                    <Field label="Straße und Hausnummer" error={err('person.address.street')}><input className="input" {...bind('person.address.street')} /></Field>
                    <Field label="PLZ" error={err('person.address.zip')}><input className="input" inputMode="numeric" maxLength={5} {...bind('person.address.zip')} /></Field>
                    <Field label="Ort" error={err('person.address.city')}><input className="input" {...bind('person.address.city')} /></Field>
                  </div>
                )}
                <div className="grid-2">
                  <Field label="E-Mail" hint="für Statusmeldungen" error={err('person.email')}><input className="input" type="email" autoComplete="email" {...bind('person.email')} /></Field>
                  <Field label="Telefon" hint="optional, für Rückfragen"><input className="input" type="tel" autoComplete="tel" {...bind('person.phone')} /></Field>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Ihre Tätigkeit</h2>
              <p className="card-lead">Die Beschreibung entscheidet über Kammer, Branchenschlüssel und mögliche Erlaubnispflichten. Konkret ist besser als knapp.</p>
              <div className="stack">
                <Field label="Rechtsform">
                  <select className="select" {...bind('business.legalForm')}>
                    {Object.entries(LEGAL_FORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                {b.legalForm !== 'einzel' && (
                  <Field label="Name des Unternehmens" hint="wie im Gesellschaftsvertrag oder Handelsregister">
                    <input className="input" {...bind('business.companyName')} />
                  </Field>
                )}
                {['ug', 'gmbh', 'ohg', 'kg'].includes(b.legalForm) && (
                  <div className="callout warn">Für Gesellschaften ist zusätzlich der Handelsregisterauszug nötig und eine Person mit Vertretungsbefugnis muss die Vollmacht unterschreiben.</div>
                )}
                <Field label="Was genau machen Sie?" error={err('business.activity')}
                  hint="z. B. „Online-Handel mit Bekleidung“ statt „Handel“">
                  <textarea className="textarea" {...bind('business.activity')} />
                </Field>
                <Field label="Umfang">
                  <Choices name="mainOrSide" value={b.mainOrSide} onChange={(v) => set('business.mainOrSide', v)} options={{ main: 'Haupterwerb', side: 'Nebenerwerb' }} />
                </Field>
                <div className="grid-2">
                  <Field label="Beschäftigte in Vollzeit" hint="ohne Sie selbst"><input className="input" type="number" min="0" {...bind('business.employeesFull')} /></Field>
                  <Field label="Beschäftigte in Teilzeit"><input className="input" type="number" min="0" {...bind('business.employeesPart')} /></Field>
                </div>
                <label className="check">
                  <input type="checkbox" checked={b.needsPermit} onChange={(e) => set('business.needsPermit', e.target.checked)} />
                  <span>Für meine Tätigkeit brauche ich eine Erlaubnis oder Handwerkskarte <span className="hint" style={{ color: 'var(--ink-3)' }}>(z. B. Gastronomie mit Alkohol, Makler, Bewachung, zulassungspflichtiges Handwerk)</span></span>
                </label>
                <label className="check">
                  <input type="checkbox" checked={b.isCraft} onChange={(e) => set('business.isCraft', e.target.checked)} />
                  Es handelt sich um einen Handwerksbetrieb
                </label>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Unterlagen und Vollmacht</h2>
              <p className="card-lead">Mit der Vollmacht dürfen wir die Anmeldung in Ihrem Namen beim Gewerbeamt einreichen. Ihre Dateien werden verschlüsselt gespeichert und nach Abschluss gelöscht.</p>
              <div className="stack">
                <Upload label="Ausweis oder Reisepass, Vorderseite" kind="id_front" doc={docs.id_front} onFile={upload} error={err('id_front')} />
                <Upload label="Rückseite" hint="beim Personalausweis" kind="id_back" doc={docs.id_back} onFile={upload} />
                {b.needsPermit && <Upload label="Erlaubnis bzw. Handwerkskarte" kind="permit" doc={docs.permit} onFile={upload} error={err('permit')} />}
                {['ug', 'gmbh', 'ohg', 'kg'].includes(b.legalForm) && <Upload label="Handelsregisterauszug" kind="register_extract" doc={docs.register_extract} onFile={upload} />}
                <div className="callout">
                  <strong>Vollmacht.</strong> Ich, {p.firstName || '…'} {p.lastName || '…'}, bevollmächtige den Betreiber von gewerbe-anmelden.com,
                  mein Gewerbe beim zuständigen Gewerbeamt ({city?.authorityName ?? '…'}) anzumelden und Bescheide in dieser Sache für mich entgegenzunehmen.
                </div>
                <SignaturePad onChange={async (url, blob) => { setSignature(url); if (blob) await upload('signature', new File([blob], 'unterschrift.png', { type: 'image/png' })); }} error={err('signature')} />
                <label className="check">
                  <input type="checkbox" checked={data.consent.powerOfAttorney} onChange={(e) => set('consent.powerOfAttorney', e.target.checked)} />
                  Ich erteile diese Vollmacht.
                </label>
                {err('powerOfAttorney') && <span className="error-text">{err('powerOfAttorney')}</span>}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2>Prüfen und beauftragen</h2>
              <p className="card-lead">Bitte prüfen Sie Ihre Angaben. Nach der Zahlung prüfen wir den Antrag und reichen ihn beim Gewerbeamt ein.</p>
              <div className="summary">
                <Summary title="Standort" onEdit={() => setStep(0)} rows={[
                  ['Betriebsstätte', `${b.premises.street}, ${b.premises.zip} ${b.premises.city}`],
                  ['Gewerbeamt', city?.authorityName], ['Beginn', b.startDate.split('-').reverse().join('.')],
                  ['Grund', REGISTRATION_REASONS[b.reason]],
                ]} />
                <Summary title="Person" onEdit={() => setStep(1)} rows={[
                  ['Name', `${p.firstName} ${p.lastName}`], ['Geboren', `${p.birthDate.split('-').reverse().join('.')} in ${p.birthPlace}`],
                  ['Wohnanschrift', sameAddress ? 'wie Betriebsstätte' : `${p.address.street}, ${p.address.zip} ${p.address.city}`], ['E-Mail', p.email],
                ]} />
                <Summary title="Tätigkeit" onEdit={() => setStep(2)} rows={[
                  ['Rechtsform', LEGAL_FORMS[b.legalForm]], ['Tätigkeit', b.activity],
                  ['Umfang', b.mainOrSide === 'main' ? 'Haupterwerb' : 'Nebenerwerb'], ['Erlaubnispflichtig', b.needsPermit ? 'ja' : 'nein'],
                ]} />
                <section>
                  <header><h3>Preis</h3></header>
                  <TotalPrice price={city?.price} />
                </section>
                <label className="check">
                  <input type="checkbox" checked={data.consent.terms} onChange={(e) => set('consent.terms', e.target.checked)} />
                  <span>Ich akzeptiere die AGB und habe die Datenschutzhinweise gelesen. Mir ist bewusst, dass gewerbe-anmelden.com ein privater Dienstleister und keine Behörde ist.</span>
                </label>
                {err('terms') && <span className="error-text">{err('terms')}</span>}
                <label className="check">
                  <input type="checkbox" checked={data.consent.earlyStart} onChange={(e) => set('consent.earlyStart', e.target.checked)} />
                  <span>Ich verlange, dass Sie sofort mit der Ausführung beginnen. Mein Widerrufsrecht erlischt, sobald die Anmeldung beim Amt eingereicht ist.</span>
                </label>
                {err('earlyStart') && <span className="error-text">{err('earlyStart')}</span>}
              </div>
            </>
          )}

          {serverError && <div className="callout err" style={{ marginTop: 20 }}>{serverError}</div>}

          <div className="form-actions">
            {step === 0
              ? <button type="button" className="btn btn-quiet" onClick={onCancel}>Abbrechen</button>
              : <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>Zurück</button>}
            {step < 4
              ? <button type="button" className="btn btn-primary" onClick={next} disabled={busy}>{busy ? 'Speichern …' : 'Weiter'}</button>
              : <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={busy}>
                  {busy ? 'Wird übermittelt …' : `Zahlungspflichtig beauftragen · ${formatEuro(city?.price.totalCents)}`}
                </button>}
          </div>
        </div>
      </div>

      <aside className="wizard-aside">
        <div className="aside-title"><span>Das geht ans Gewerbeamt</span>{app && <span>Vorgang {app.ref}</span>}</div>
        <FormPreview data={previewData} authority={city?.authorityName} signature={signature} />
        {city && <div style={{ marginTop: 14 }} className="callout"><TotalPrice price={city.price} /></div>}
      </aside>
    </div>
  );
}

const prefix = (pre, obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [pre + k, v]));

function Summary({ title, rows, onEdit }) {
  return (
    <section>
      <header><h3>{title}</h3><button type="button" className="btn btn-quiet btn-sm" onClick={onEdit}>Ändern</button></header>
      <dl>{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '–'}</dd></div>)}</dl>
    </section>
  );
}

function Upload({ label, hint, kind, doc, onFile, error }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    try { await onFile(kind, file); } finally { setBusy(false); }
  };
  return (
    <div className="field">
      <span>{label}{hint && <span className="hint"> · {hint}</span>}</span>
      <label className={`dropzone ${over ? 'over' : ''} ${doc ? 'filled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}>
        <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => handle(e.target.files[0])} />
        <span className="icon">{doc ? Icon.check : Icon.doc}</span>
        <span>
          <strong>{busy ? 'Wird hochgeladen …' : doc ? doc.filename : 'Datei wählen oder hierher ziehen'}</strong>
          <span className="meta" style={{ display: 'block' }}>{doc ? `${Math.round(doc.size / 1024)} KB · zum Ersetzen erneut wählen` : 'Foto oder Scan, JPG, PNG oder PDF, max. 8 MB'}</span>
        </span>
      </label>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

function SignaturePad({ onChange, error }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = ref.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#142026';
  }, []);

  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { drawing.current = true; ref.current.setPointerCapture(e.pointerId); const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  const move = (e) => { if (!drawing.current) return; const ctx = ref.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); setHasInk(true); };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const url = ref.current.toDataURL('image/png');
    ref.current.toBlob((blob) => onChange(url, blob), 'image/png');
  };
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setHasInk(false); onChange(null, null); };

  return (
    <div className="field">
      <span>Unterschrift</span>
      <div className="sigpad">
        <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Unterschriftenfeld – mit Maus, Finger oder Stift unterschreiben" />
        <div className="baseline" />
        <div className="sig-hint">Mit Maus, Finger oder Stift unterschreiben</div>
        {hasInk && <button type="button" className="btn btn-quiet btn-sm clear" onClick={clear}>Löschen</button>}
      </div>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
