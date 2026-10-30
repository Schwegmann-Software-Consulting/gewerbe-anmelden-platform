import { createContext, useCallback, useContext, useState } from 'react';
import { STATUSES } from '@ga/core';

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      <span>{label}{hint && <span className="hint"> · {hint}</span>}</span>
      {children}
      {error && <span className="error-text" role="alert">{error}</span>}
    </label>
  );
}

export function Choices({ name, value, onChange, options }) {
  return (
    <div className="choice-row" role="radiogroup">
      {Object.entries(options).map(([k, label]) => (
        <label className="choice" key={k}>
          <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} />
          {label}
        </label>
      ))}
    </div>
  );
}

const TONE = {
  completed: 'green', acknowledged: 'green', transmitted: 'green',
  in_review: 'amber', needs_info: 'amber', manual_required: 'amber', queued: 'amber', awaiting_payment: 'amber',
  rejected: 'red', cancelled: 'red',
};
export const StatusBadge = ({ status }) => <span className={`badge ${TONE[status] ?? ''}`}>{STATUSES[status]?.label ?? status}</span>;

export const fmtDate = (iso, withTime = false) => {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('de-DE', withTime
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(null), 2600); }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export const Icon = {
  check: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  doc: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 2h7l4 4v12H5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 2v4h4M8 10h5M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  x: <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
};
