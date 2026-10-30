import { useEffect, useState } from 'react';
import { formatEuro } from '@ga/core';
import { api } from '../api/index.js';
import FormPreview from './FormPreview.jsx';
import { Icon, fmtDate } from './ui.jsx';

export default function Status({ appId, onAdmin }) {
  const [app, setApp] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!appId) return;
    let alive = true;
    const load = () => api.applications.get(appId).then((a) => alive && setApp(a)).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [appId]);

  if (!appId) return <div className="status-wrap"><h1>Kein Antrag geöffnet</h1><p className="section-lead">Den Link zu Ihrem Antrag finden Sie in der Bestätigungs-E-Mail.</p></div>;
  if (error) return <div className="status-wrap"><div className="callout err">{error}</div></div>;
  if (!app) return <div className="status-wrap"><p>Wird geladen …</p></div>;

  const { steps, current } = app.progress;
  const done = ['transmitted', 'acknowledged', 'completed'].includes(app.status);
  const lastNote = [...app.timeline].reverse().find((t) => t.note);

  return (
    <div className="status-wrap">
      <p className="section-lead" style={{ marginTop: 0 }}>Vorgang <span className="ref">{app.ref}</span></p>
      <h1 style={{ marginTop: 10 }}>
        {app.status === 'in_review' && 'Danke! Wir prüfen jetzt Ihre Angaben.'}
        {app.status === 'needs_info' && 'Wir brauchen noch eine Angabe von Ihnen.'}
        {['queued', 'manual_required'].includes(app.status) && 'Ihre Anmeldung wird eingereicht.'}
        {app.status === 'transmitted' && 'Ihre Anmeldung liegt beim Gewerbeamt.'}
        {app.status === 'acknowledged' && 'Das Gewerbeamt hat den Eingang bestätigt.'}
        {app.status === 'completed' && 'Geschafft: Ihr Gewerbe ist angemeldet.'}
        {['draft', 'awaiting_payment', 'paid', 'rejected', 'cancelled'].includes(app.status) && app.statusLabel}
      </h1>
      <p className="section-lead">
        Bezahlt: {formatEuro(app.price?.totalCents)}. Jede Änderung schicken wir Ihnen zusätzlich per E-Mail an {app.data.person?.email}.
      </p>
      {app.status === 'needs_info' && lastNote && <div className="callout warn" style={{ marginTop: 18 }}><strong>Rückfrage:</strong> {lastNote.note}</div>}

      <ol className="timeline">
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? (app.status === 'completed' ? 'done' : 'now') : '';
          const hit = app.timeline.find((t) => t.status && stepIndex(t.status) === i);
          return (
            <li key={s} className={state}>
              <span className="bullet">{state === 'done' && Icon.check}</span>
              <div><div className="t">{s}</div>{hit && <div className="d">{fmtDate(hit.at, true)}</div>}</div>
            </li>
          );
        })}
      </ol>

      <div style={{ marginTop: 24 }}>
        <FormPreview data={app.data} authority={app.data.business?.premises?.city} stamped={done ? fmtDate(app.timeline.at(-1)?.at) : null} />
      </div>

      {api.mode === 'demo' && (
        <div className="callout" style={{ marginTop: 24 }}>
          <strong>Demo:</strong> Im Admin-Bereich können Sie diesen Antrag freigeben und die Antwort des Amts simulieren.
          <div style={{ marginTop: 10 }}><button type="button" className="btn btn-ghost btn-sm" onClick={onAdmin}>Zum Admin-Bereich</button></div>
        </div>
      )}
    </div>
  );
}

const MAP = { draft: 0, awaiting_payment: 0, paid: 1, in_review: 2, needs_info: 2, queued: 3, manual_required: 3, transmitted: 4, acknowledged: 5, completed: 6, rejected: 5 };
const stepIndex = (s) => MAP[s];
