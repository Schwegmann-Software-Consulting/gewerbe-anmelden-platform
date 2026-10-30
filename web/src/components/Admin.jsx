import { useCallback, useEffect, useRef, useState } from 'react';
import { CHANNELS, STATUSES, LEGAL_FORMS, COMPARISON_FEATURES, formatEuro, quote as calcQuote } from '@ga/core';
import { api } from '../api/index.js';
import { StatusBadge, fmtDate, useToast, Field, Icon } from './ui.jsx';

const VIEWS = [
  ['overview', 'Übersicht'],
  ['applications', 'Anträge'],
  ['cities', 'Städte & Gebühren'],
  ['competitors', 'Wettbewerb'],
  ['channels', 'Übermittlung'],
  ['api', 'API & Frontends'],
];

export default function Admin() {
  const [view, setView] = useState('cities');
  const [reviewCount, setReviewCount] = useState(0);
  const refreshCount = useCallback(() => api.admin.applications.list().then((l) => setReviewCount(l.filter((a) => ['in_review', 'manual_required'].includes(a.status)).length)), []);
  useEffect(() => { refreshCount(); }, [refreshCount, view]);

  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Admin">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" aria-current={view === k} onClick={() => setView(k)}>
            {label}{k === 'applications' && reviewCount > 0 && <span className="count">{reviewCount}</span>}
          </button>
        ))}
        {api.mode === 'demo' && (
          <button type="button" style={{ marginTop: 'auto', fontSize: 13 }} onClick={() => { api.reset(); window.location.reload(); }}>Demo-Daten zurücksetzen</button>
        )}
      </nav>
      <main className="admin-main">
        {view === 'overview' && <Overview onOpen={() => setView('applications')} />}
        {view === 'applications' && <Applications onChange={refreshCount} />}
        {view === 'cities' && <Cities />}
        {view === 'competitors' && <Competitors />}
        {view === 'channels' && <Channels />}
        {view === 'api' && <ApiView />}
      </main>
    </div>
  );
}

/* ---------------- Übersicht ---------------- */
function Overview({ onOpen }) {
  const [s, setS] = useState(null);
  const [recent, setRecent] = useState([]);
  useEffect(() => { api.admin.stats().then(setS); api.admin.applications.list().then((l) => setRecent(l.slice(0, 6))); }, []);
  if (!s) return null;
  const open = s.byStatus.in_review + s.byStatus.manual_required + s.byStatus.needs_info;
  return (
    <>
      <div className="admin-head"><div><h1>Übersicht</h1><p>Bezahlte Anträge und Umsatz. Amtsgebühren sind durchlaufende Posten und kein Umsatz.</p></div></div>
      <div className="kpis">
        <div className="kpi"><div className="v">{s.total}</div><div className="l">Anträge gesamt</div></div>
        <div className="kpi"><div className="v">{open}</div><div className="l">Brauchen Bearbeitung</div></div>
        <div className="kpi"><div className="v">{formatEuro(s.revenueServiceCents)}</div><div className="l">Servicegebühren (brutto)</div></div>
        <div className="kpi"><div className="v">{formatEuro(s.passThroughCents)}</div><div className="l">Amtsgebühren treuhänderisch</div></div>
      </div>
      <h2 style={{ fontSize: 18, margin: '28px 0 12px' }}>Neueste Anträge</h2>
      <AppTable list={recent} onOpen={onOpen} />
    </>
  );
}

/* ---------------- Städte & Gebühren ---------------- */
function Cities() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const timers = useRef({});

  const load = useCallback(() => Promise.all([api.admin.cities.list(), api.admin.settings.get()]).then(([c, s]) => { setList(c); setSettings(s); }), []);
  useEffect(() => { load(); }, [load]);

  // Sofort lokal neu berechnen, gespeichert wird entprellt
  function change(id, patch) {
    setList((l) => l.map((c) => (c.id === id ? { ...c, ...patch, quote: calcQuote({ ...c, ...patch }, settings) } : c)));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => api.admin.cities.put(id, patch).then(() => toast('Gespeichert')), 450);
  }

  async function saveSettings(patch) {
    const s = await api.admin.settings.put(patch);
    setSettings(s);
    setList((l) => l.map((c) => ({ ...c, quote: calcQuote(c, s) })));
  }

  async function applyAll() {
    await api.admin.cities.bulk({ feePercent: settings.defaultPercent, feeMode: settings.defaultFeeMode });
    await load();
    toast(`${settings.defaultPercent} % auf alle Städte angewendet`);
  }

  if (!settings) return null;
  const shown = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Städte & Gebühren</h1>
          <p>Ihre Servicegebühr ist ein Prozentsatz der Amtsgebühr je Stadt, inklusive 19 % USt. Änderungen gelten sofort für neue Anträge, bezahlte Anträge behalten ihren Preis.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: '', name: '', state: 'NI', zipRanges: [['', '']], officeFeeCents: 3800, feePercent: settings.defaultPercent, feeMode: settings.defaultFeeMode, channel: 'email', authority: { name: '', email: '', fax: '', postalAddress: '', portalUrl: '' }, active: false, verified: false, isNew: true })}>Stadt hinzufügen</button>
      </div>

      <div className="settings-band">
        <Field label="Standard-Aufschlag für neue Städte">
          <div className="pct">
            <input type="range" min="0" max="150" step="5" value={settings.defaultPercent} onChange={(e) => setSettings({ ...settings, defaultPercent: Number(e.target.value) })} onPointerUp={() => saveSettings({ defaultPercent: settings.defaultPercent })} onKeyUp={() => saveSettings({ defaultPercent: settings.defaultPercent })} />
            <output>{settings.defaultPercent} %</output>
            <button type="button" className="btn btn-ghost btn-sm" onClick={applyAll}>Auf alle anwenden</button>
          </div>
        </Field>
        <Field label="Rundung der Servicegebühr">
          <select className="select" value={settings.rounding} onChange={(e) => saveSettings({ rounding: e.target.value })}>
            <option value="x90">Auf ,90 € aufrunden</option>
            <option value="euro">Auf volle Euro aufrunden</option>
            <option value="cent">Centgenau</option>
          </select>
        </Field>
        <Field label="Amtsgebühr standardmäßig">
          <select className="select" value={settings.defaultFeeMode} onChange={(e) => saveSettings({ defaultFeeMode: e.target.value })}>
            <option value="included">Mitkassieren (ein Gesamtpreis)</option>
            <option value="direct">Amt rechnet direkt mit Kunden ab</option>
          </select>
        </Field>
      </div>

      <div className="toolbar">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Stadt suchen" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="grow" />
        <span className="cell-sub">{list.filter((c) => c.active).length} von {list.length} Städten aktiv</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Aktiv</th><th>Stadt</th><th className="num">Amtsgebühr</th><th>Aufschlag</th>
              <th className="num">Servicegebühr</th><th className="num">Kunde zahlt</th><th>Übermittlung</th><th>Daten</th><th />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td><label className="switch"><input type="checkbox" checked={c.active} onChange={(e) => change(c.id, { active: e.target.checked })} aria-label={`${c.name} aktiv`} /><span /></label></td>
                <td><strong>{c.name}</strong><div className="cell-sub nowrap">{c.state} · PLZ {c.zipRanges.map(([a, b]) => `${a}–${b}`).join(', ')}</div></td>
                <td className="num">
                  <input className="tiny-input" type="number" step="0.5" min="0" aria-label={`Amtsgebühr ${c.name}`}
                    value={c.officeFeeCents / 100} onChange={(e) => change(c.id, { officeFeeCents: Math.round(Number(e.target.value) * 100) })} /> €
                </td>
                <td>
                  <div className="pct">
                    <input type="range" min="0" max="150" step="5" value={c.feePercent} aria-label={`Aufschlag ${c.name}`}
                      onChange={(e) => change(c.id, { feePercent: Number(e.target.value) })} />
                    <output>{c.feePercent} %</output>
                  </div>
                </td>
                <td className="num">{formatEuro(c.quote.serviceFeeCents)}<div className="cell-sub">netto {formatEuro(c.quote.serviceFeeNetCents)}</div></td>
                <td className="num"><strong>{formatEuro(c.quote.totalDueCents)}</strong>{c.quote.feeMode === 'direct' && <div className="cell-sub">+ Amt direkt</div>}</td>
                <td>
                  <select className="tiny-select" value={c.channel} onChange={(e) => change(c.id, { channel: e.target.value })} aria-label={`Übermittlungsweg ${c.name}`}>
                    {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </td>
                <td>{c.verified ? <span className="badge green">Geprüft</span> : <span className="badge amber">Beispielwert</span>}</td>
                <td><button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(c)}>Details</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <CityDrawer city={editing} settings={settings} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); toast('Stadt gespeichert'); }} />}
    </>
  );
}

function CityDrawer({ city, settings, onClose, onSaved }) {
  const [c, setC] = useState(city);
  const [error, setError] = useState(null);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const setA = (k, v) => setC((x) => ({ ...x, authority: { ...x.authority, [k]: v } }));
  const q = calcQuote(c, settings);

  async function save() {
    const id = c.id || c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) { setError('Bitte einen Namen angeben'); return; }
    const { quote, isNew, ...body } = c;
    try { await api.admin.cities.put(id, { ...body, id }); onSaved(); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Stadt ${c.name}`}>
        <button type="button" className="btn btn-quiet close" onClick={onClose} aria-label="Schließen">{Icon.x}</button>
        <h2>{city.isNew ? 'Neue Stadt' : c.name}</h2>
        <section className="stack">
          <div className="grid-2">
            <Field label="Name"><input className="input" value={c.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Bundesland" hint="Kürzel"><input className="input" maxLength={2} value={c.state} onChange={(e) => set('state', e.target.value.toUpperCase())} /></Field>
          </div>
          <div className="grid-2">
            <Field label="PLZ von"><input className="input" value={c.zipRanges[0][0]} onChange={(e) => set('zipRanges', [[e.target.value, c.zipRanges[0][1]]])} /></Field>
            <Field label="PLZ bis"><input className="input" value={c.zipRanges[0][1]} onChange={(e) => set('zipRanges', [[c.zipRanges[0][0], e.target.value]])} /></Field>
          </div>
          <div className="grid-2">
            <Field label="Amtsgebühr (€)"><input className="input" type="number" step="0.5" value={c.officeFeeCents / 100} onChange={(e) => set('officeFeeCents', Math.round(Number(e.target.value) * 100))} /></Field>
            <Field label={`Aufschlag: ${c.feePercent} %`}><input type="range" min="0" max="150" step="5" value={c.feePercent} onChange={(e) => set('feePercent', Number(e.target.value))} style={{ accentColor: 'var(--pine)', marginTop: 12 }} /></Field>
          </div>
          <div className="callout">Servicegebühr {formatEuro(q.serviceFeeCents)} · Kunde zahlt bei uns {formatEuro(q.totalDueCents)} · Gesamtkosten {formatEuro(q.totalCostCents)}</div>
          <Field label="Amtsgebühr">
            <select className="select" value={c.feeMode} onChange={(e) => set('feeMode', e.target.value)}>
              <option value="included">Mitkassieren und Gebührenbescheid begleichen</option>
              <option value="direct">Amt stellt dem Kunden direkt in Rechnung</option>
            </select>
          </Field>
        </section>
        <section className="stack">
          <h3>Zuständige Stelle und Übermittlung</h3>
          <Field label="Behörde"><input className="input" value={c.authority.name} onChange={(e) => setA('name', e.target.value)} /></Field>
          <Field label="Übermittlungsweg" hint={CHANNELS[c.channel].hint}>
            <select className="select" value={c.channel} onChange={(e) => set('channel', e.target.value)}>
              {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          {c.channel === 'email' && <Field label="E-Mail-Postfach des Gewerbeamts"><input className="input" type="email" value={c.authority.email} onChange={(e) => setA('email', e.target.value)} /></Field>}
          {c.channel === 'fax' && <Field label="Faxnummer"><input className="input" value={c.authority.fax} onChange={(e) => setA('fax', e.target.value)} /></Field>}
          {c.channel === 'postal' && <Field label="Postanschrift"><textarea className="textarea" value={c.authority.postalAddress} onChange={(e) => setA('postalAddress', e.target.value)} /></Field>}
          {c.channel === 'portal' && <Field label="Portal-URL"><input className="input" value={c.authority.portalUrl} onChange={(e) => setA('portalUrl', e.target.value)} /></Field>}
          <label className="check"><input type="checkbox" checked={c.verified} onChange={(e) => set('verified', e.target.checked)} />Gebühr und Empfänger sind mit der Stadt abgestimmt</label>
          <label className="check"><input type="checkbox" checked={c.active} onChange={(e) => set('active', e.target.checked)} />Für Kunden buchbar</label>
          {c.active && !c.verified && <div className="callout warn">Stadt ist buchbar, aber Gebühr und Empfänger sind noch nicht geprüft.</div>}
        </section>
        {error && <div className="callout err" style={{ marginTop: 16 }}>{error}</div>}
        <div className="actions" style={{ marginTop: 24 }}>
          <button type="button" className="btn btn-primary" onClick={save}>Speichern</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
        </div>
      </aside>
    </>
  );
}

/* ---------------- Anträge ---------------- */
const FILTERS = [
  ['review', 'Zu prüfen', ['in_review']],
  ['manual', 'Portal-Eingabe', ['manual_required']],
  ['info', 'Rückfrage', ['needs_info']],
  ['running', 'Beim Amt', ['queued', 'transmitted', 'acknowledged']],
  ['done', 'Erledigt', ['completed', 'rejected', 'cancelled']],
  ['all', 'Alle', null],
];

function Applications({ onChange }) {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.admin.applications.list().then(setList), []);
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);
  const statuses = FILTERS.find(([k]) => k === filter)[2];
  const shown = statuses ? list.filter((a) => statuses.includes(a.status)) : list;

  return (
    <>
      <div className="admin-head"><div><h1>Anträge</h1><p>Prüfen, freigeben, Antworten des Amts erfassen. Jede Aktion landet im Protokoll und wird als Webhook gemeldet.</p></div></div>
      <div className="toolbar">
        <div className="choice-row">
          {FILTERS.map(([k, label, st]) => {
            const n = st ? list.filter((a) => st.includes(a.status)).length : list.length;
            return (
              <label className="choice" key={k} style={{ padding: '7px 12px', fontSize: 14 }}>
                <input type="radio" name="f" checked={filter === k} onChange={() => setFilter(k)} />{label} ({n})
              </label>
            );
          })}
        </div>
      </div>
      <AppTable list={shown} onOpen={(a) => setOpen(a.id)} />
      {open && <AppDrawer id={open} onClose={() => setOpen(null)} onChange={() => { load(); onChange(); }} />}
    </>
  );
}

function AppTable({ list, onOpen }) {
  if (!list.length) return <div className="callout">Keine Anträge in dieser Ansicht.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Vorgang</th><th>Kunde</th><th>Stadt</th><th>Status</th><th>Eingang</th><th className="num">Betrag</th></tr></thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id} className="clickable" onClick={() => onOpen(a)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(a)}>
              <td><strong>{a.ref}</strong><div className="cell-sub">über {a.frontendId}</div></td>
              <td>{a.data.person?.firstName} {a.data.person?.lastName}<div className="cell-sub">{a.data.business?.activity?.slice(0, 42)}</div></td>
              <td>{a.data.business?.premises?.city}</td>
              <td><StatusBadge status={a.status} /></td>
              <td>{fmtDate(a.createdAt, true)}</td>
              <td className="num">{formatEuro(a.quote?.totalDueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppDrawer({ id, onClose, onChange }) {
  const toast = useToast();
  const [a, setA] = useState(null);
  const [msg, setMsg] = useState('');
  const [reference, setReference] = useState('');
  const load = useCallback(() => api.admin.applications.get(id).then(setA), [id]);
  useEffect(() => { load(); const t = setInterval(load, 2000); return () => clearInterval(t); }, [load]);
  if (!a) return null;
  const p = a.data.person ?? {}, b = a.data.business ?? {};

  const act = (fn, done) => async () => { await fn(); toast(done); load(); onChange(); };

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Antrag ${a.ref}`}>
        <button type="button" className="btn btn-quiet close" onClick={onClose} aria-label="Schließen">{Icon.x}</button>
        <p className="cell-sub">Vorgang {a.ref}</p>
        <h2>{p.firstName} {p.lastName}</h2>
        <div style={{ marginTop: 8 }}><StatusBadge status={a.status} /></div>

        <section>
          <h3>Nächster Schritt</h3>
          {a.status === 'in_review' && (
            <div className="stack">
              <p className="cell-sub">Prüfen: Tätigkeit konkret genug? Name wie im Ausweis? Erlaubnispflicht plausibel?</p>
              <div className="actions"><button type="button" className="btn btn-primary" onClick={act(() => api.admin.applications.approve(a.id), 'Freigegeben, Übermittlung läuft')}>Freigeben und an {a.city?.name} übermitteln</button></div>
              <Field label="Oder Rückfrage an den Kunden"><textarea className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="z. B. Bitte beschreiben Sie Ihre Tätigkeit genauer: Welche Waren verkaufen Sie?" /></Field>
              <div className="actions"><button type="button" className="btn btn-ghost" disabled={!msg} onClick={act(() => api.admin.applications.requestInfo(a.id, msg), 'Rückfrage gesendet')}>Rückfrage senden</button></div>
            </div>
          )}
          {a.status === 'queued' && <p>Übermittlung läuft …</p>}
          {a.status === 'manual_required' && (
            <div className="stack">
              <p>Die Stadt nimmt nur über ihr Portal an. Daten aus diesem Antrag im Portal erfassen und die Eingangsnummer eintragen.</p>
              {a.city?.authority?.portalUrl && <p><a href={a.city.authority.portalUrl} target="_blank" rel="noreferrer">Portal öffnen</a> <span className="cell-sub">({a.city.authority.portalUrl})</span></p>}
              <Field label="Eingangs- oder Vorgangsnummer des Amts"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
              <div className="actions"><button type="button" className="btn btn-primary" onClick={act(() => api.admin.applications.setStatus(a.id, { status: 'transmitted', reference, note: 'Im Portal erfasst' }), 'Als übermittelt markiert')}>Als eingereicht markieren</button></div>
            </div>
          )}
          {['transmitted', 'acknowledged'].includes(a.status) && (
            <div className="actions">
              {a.status === 'transmitted' && <button type="button" className="btn btn-ghost" onClick={act(() => api.admin.applications.setStatus(a.id, { status: 'acknowledged', note: 'Eingangsbestätigung erhalten' }), 'Eingang erfasst')}>Eingang bestätigt</button>}
              <button type="button" className="btn btn-primary" onClick={act(() => api.admin.applications.setStatus(a.id, { status: 'completed', note: 'Gewerbeschein liegt vor' }), 'Abgeschlossen')}>Gewerbeschein liegt vor</button>
              <button type="button" className="btn btn-quiet" onClick={act(() => api.admin.applications.setStatus(a.id, { status: 'rejected', note: 'Vom Amt abgelehnt' }), 'Als abgelehnt erfasst')}>Abgelehnt</button>
            </div>
          )}
          {a.status === 'needs_info' && <p>Wartet auf Antwort des Kunden.</p>}
          {a.status === 'completed' && <p>Abgeschlossen. Unterlagen werden nach Ablauf der Löschfrist automatisch entfernt.</p>}
        </section>

        <section>
          <h3>Angaben</h3>
          <dl className="kv">
            <dt>Tätigkeit</dt><dd>{b.activity}</dd>
            <dt>Rechtsform</dt><dd>{LEGAL_FORMS[b.legalForm]}</dd>
            <dt>Betriebsstätte</dt><dd>{b.premises?.street}, {b.premises?.zip} {b.premises?.city}</dd>
            <dt>Beginn</dt><dd>{b.startDate?.split('-').reverse().join('.')}</dd>
            <dt>Geburtsdatum</dt><dd>{p.birthDate?.split('-').reverse().join('.')} {p.birthPlace && `in ${p.birthPlace}`}</dd>
            <dt>E-Mail</dt><dd>{p.email}</dd>
            <dt>Zuständig</dt><dd>{a.city?.authority?.name}</dd>
            <dt>Übermittlung</dt><dd>{CHANNELS[a.city?.channel]?.label}{a.transmission?.authorityReference && ` · Az. ${a.transmission.authorityReference}`}</dd>
            <dt>Bezahlt</dt><dd>{formatEuro(a.quote?.totalDueCents)} (davon Service {formatEuro(a.quote?.serviceFeeCents)})</dd>
          </dl>
        </section>

        <section>
          <h3>Unterlagen</h3>
          <ul className="log">
            {(a.documents ?? []).map((d) => <li key={d.id}><span>{({ id_front: 'Ausweis vorne', id_back: 'Ausweis hinten', signature: 'Unterschrift', permit: 'Erlaubnis', register_extract: 'HR-Auszug' })[d.kind] ?? d.kind}</span><span>{d.filename}</span></li>)}
          </ul>
        </section>

        <section>
          <h3>Protokoll</h3>
          <ul className="log">
            {(a.events ?? []).map((e, i) => (
              <li key={i}>
                <time>{fmtDate(e.createdAt, true)}</time>
                <span>{e.type === 'status' ? `${STATUSES[e.payload.to]?.label}` : e.type === 'transmission' ? `Übermittelt per ${CHANNELS[e.payload.channel]?.label}` : ({ created: 'Antrag angelegt', job_error: 'Fehler bei der Übermittlung', needs_attention: 'Braucht Aufmerksamkeit' })[e.type] ?? e.type}{e.payload?.note ? ` – ${e.payload.note}` : ''} <span className="cell-sub">({e.actor})</span></span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </>
  );
}

/* ---------------- Übermittlung ---------------- */
function Channels() {
  const [cities, setCities] = useState([]);
  useEffect(() => { api.admin.cities.list().then(setCities); }, []);
  return (
    <>
      <div className="admin-head"><div><h1>Übermittlung an die Ämter</h1><p>Jede Stadt hat einen Übermittlungsweg. Nach der Freigabe erzeugt der Server ein PDF-Paket (Anschreiben, Gewerbeanmeldung, Vollmacht, Ausweis) und versendet es über den passenden Adapter.</p></div></div>
      <div className="flow">
        {Object.entries(CHANNELS).map(([k, ch]) => {
          const n = cities.filter((c) => c.channel === k);
          return (
            <div className="flow-row" key={k}>
              <div><h3>{ch.label}</h3><div style={{ marginTop: 6 }}>{ch.automated ? <span className="badge green">automatisch</span> : <span className="badge amber">halbautomatisch</span>}</div></div>
              <div><p>{ch.hint}</p><p className="cell-sub" style={{ marginTop: 6 }}>{n.length ? n.map((c) => c.name).join(', ') : 'Keine Stadt nutzt diesen Weg'}</p></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- API & Frontends ---------------- */
function ApiView() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ id: '', name: '', origin: '' });
  const [created, setCreated] = useState(null);
  useEffect(() => { api.admin.frontends.list().then(setList); }, []);
  async function create(e) {
    e.preventDefault();
    const f = await api.admin.frontends.create({ id: form.id, name: form.name, origins: [form.origin] });
    setCreated(f); setForm({ id: '', name: '', origin: '' });
    setList(await api.admin.frontends.list());
  }
  return (
    <>
      <div className="admin-head"><div><h1>API & Frontends</h1><p>Alle Frontends sprechen dieselbe Schnittstelle. Jedes bekommt einen eigenen Schlüssel, damit Herkunft, erlaubte Domains und Umsätze getrennt bleiben.</p></div></div>
      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Frontend</th><th>Kennung</th><th>Erlaubte Domains</th></tr></thead>
          <tbody>{list.map((f) => <tr key={f.id}><td><strong>{f.name}</strong></td><td>{f.id}</td><td>{f.origins.join(', ')}</td></tr>)}</tbody>
        </table>
      </div>
      <form className="settings-band" onSubmit={create}>
        <Field label="Kennung"><input className="input" required pattern="[a-z0-9-]+" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="partner-xyz" /></Field>
        <Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Landingpage Gründer-Kampagne" /></Field>
        <Field label="Domain"><input className="input" required value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="https://…" /></Field>
        <div><button className="btn btn-primary" type="submit">Frontend anlegen</button></div>
      </form>
      {created && <div className="callout warn" style={{ marginBottom: 20 }}><strong>API-Schlüssel für {created.name}:</strong> <code>{created.apiKey}</code> – wird nur einmal angezeigt.</div>}
      <h2 style={{ fontSize: 18, margin: '8px 0 12px' }}>Ablauf für ein neues Frontend</h2>
      <div className="code">{`// 1. Preis zur PLZ holen
GET  /v1/cities/resolve?zip=49076            X-Api-Key: pk_…

// 2. Antrag anlegen → id, ref, accessToken
POST /v1/applications  { "cityId": "osnabrueck" }

// 3. Daten ergänzen, Dokumente hochladen
PATCH /v1/applications/{id}                  X-Application-Token: …
POST  /v1/applications/{id}/documents        kind=id_front | signature | …

// 4. Absenden → Stripe-Checkout-URL
POST /v1/applications/{id}/submit

// 5. Status für die Kundenseite
GET  /v1/applications/{id}

// Ereignisse an n8n / CRM: application.status_changed, job.failed`}</div>
    </>
  );
}

/* ---------------- Wettbewerb ---------------- */
const TRI = [['true', 'Ja'], ['false', 'Nein'], ['null', 'keine Angabe']];

function Competitors() {
  const toast = useToast();
  const [list, setList] = useState(null);
  useEffect(() => { api.admin.settings.get().then((s) => setList(s.competitors ?? [])); }, []);
  if (!list) return null;

  const upd = (i, patch) => setList((l) => l.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const updF = (i, k, v) => setList((l) => l.map((c, j) => (j === i ? { ...c, features: { ...c.features, [k]: v } } : c)));
  const add = () => setList((l) => [...l, {
    id: `anbieter-${l.length + 1}`, name: '', priceCents: 0, includesOfficeFee: true, checkedAt: new Date().toISOString().slice(0, 10),
    source: '', features: Object.fromEntries(Object.keys(COMPARISON_FEATURES).map((k) => [k, null])), active: false,
  }]);
  async function save() {
    const bad = list.find((c) => c.active && (!c.name || !c.source || !c.priceCents));
    if (bad) { toast('Aktive Anbieter brauchen Name, Preis und Quelle'); return; }
    await api.admin.settings.put({ competitors: list });
    toast('Vergleich gespeichert');
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Wettbewerb</h1>
          <p>Diese Angaben erscheinen im Preisvergleich auf der Startseite. Nur eintragen, was auf der Website des Anbieters steht, mit Prüfdatum und Quelle. Nicht geprüfte Merkmale bleiben auf „keine Angabe“. Preise regelmäßig nachprüfen.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={add}>Anbieter hinzufügen</button>
          <button type="button" className="btn btn-primary" onClick={save}>Speichern</button>
        </div>
      </div>
      <div className="stack">
        {list.map((c, i) => {
          const stale = (Date.now() - new Date(c.checkedAt)) / 864e5 > 30;
          return (
            <div className="settings-band" key={c.id} style={{ gridTemplateColumns: '1fr', marginBottom: 0 }}>
              <div className="grid-3" style={{ gridTemplateColumns: 'auto 2fr 1fr 1fr 2fr', alignItems: 'end' }}>
                <label className="switch" style={{ marginBottom: 10 }}><input type="checkbox" checked={c.active} onChange={(e) => upd(i, { active: e.target.checked })} aria-label="Im Vergleich zeigen" /><span /></label>
                <Field label="Anbieter"><input className="input" value={c.name} onChange={(e) => upd(i, { name: e.target.value })} /></Field>
                <Field label="Preis (€)"><input className="input" type="number" step="0.01" value={c.priceCents / 100} onChange={(e) => upd(i, { priceCents: Math.round(Number(e.target.value) * 100) })} /></Field>
                <Field label="Geprüft am"><input className="input" type="date" value={c.checkedAt} onChange={(e) => upd(i, { checkedAt: e.target.value })} /></Field>
                <Field label="Quelle (URL)"><input className="input" value={c.source} onChange={(e) => upd(i, { source: e.target.value })} /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={c.includesOfficeFee} onChange={(e) => upd(i, { includesOfficeFee: e.target.checked })} />Preis enthält die Amtsgebühr (nur dann wird eine Ersparnis berechnet)</label>
              {stale && <div className="callout warn">Zuletzt vor mehr als 30 Tagen geprüft. Preis bitte nachprüfen.</div>}
              <div className="table-wrap">
                <table>
                  <tbody>
                    {Object.entries(COMPARISON_FEATURES).map(([k, label]) => (
                      <tr key={k}>
                        <td>{label}</td>
                        <td style={{ width: 200 }}>
                          <select className="tiny-select" value={String(c.features?.[k] ?? null)} onChange={(e) => updF(i, k, JSON.parse(e.target.value))}>
                            {TRI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
