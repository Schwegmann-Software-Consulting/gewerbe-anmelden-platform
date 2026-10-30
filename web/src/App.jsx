import { useEffect, useState } from 'react';
import { api } from './api/index.js';
import Landing from './components/Landing.jsx';
import Wizard from './components/Wizard.jsx';
import Status from './components/Status.jsx';
import Admin from './components/Admin.jsx';
import { ToastProvider } from './components/ui.jsx';

const VIEWS = ['start', 'antrag', 'status', 'admin'];
const readHash = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'start');
const remember = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* optional */ } };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export default function App() {
  const [view, setView] = useState(readHash);
  const [city, setCity] = useState(null);
  const [appId, setAppId] = useState(() => recall('ga-last-app'));

  useEffect(() => {
    const on = () => setView(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (v) => { location.hash = v; setView(v); window.scrollTo(0, 0); };

  return (
    <ToastProvider>
      <div className="notice-bar">Privater Online-Service – keine Behörde. Sie können Ihr Gewerbe auch selbst direkt beim Gewerbeamt anmelden.</div>
      <header className="topbar">
        <a className="brand" href="#start" onClick={(e) => { e.preventDefault(); go('start'); }}>
          <span className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 2h7l3 3v11H4z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /><path d="M6.5 10l2 2 3.5-4" stroke="#FFE45C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          gewerbe-anmelden<small>.com</small>
        </a>
        <nav className="topnav">
          {api.mode === 'demo' && <span className="demo-pill" style={{ alignSelf: 'center', marginRight: 8 }}>Demo</span>}
          <a href="#start" aria-current={view === 'start' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go('start'); }}>Start</a>
          {appId && <a href="#status" aria-current={view === 'status' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go('status'); }}>Mein Antrag</a>}
          <a href="#admin" aria-current={view === 'admin' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go('admin'); }}>Admin</a>
        </nav>
      </header>

      {view === 'start' && <Landing onStart={(c) => { setCity(c); go('antrag'); }} />}
      {view === 'antrag' && (
        <Wizard key={city?.id ?? 'none'} initialCity={city}
          onCancel={() => go('start')}
          onDone={(id) => { setAppId(id); remember('ga-last-app', id); go('status'); }} />
      )}
      {view === 'status' && <Status appId={appId} onAdmin={() => go('admin')} />}
      {view === 'admin' && <Admin />}

      {view !== 'admin' && (
        <footer className="footer">
          <div className="footer-inner">
            <span>gewerbe-anmelden.com ist ein privater Dienstleister und steht in keiner Verbindung zu Gewerbeämtern oder Kommunen. Die Gewerbeanmeldung bearbeitet ausschließlich die zuständige Behörde.</span>
            <span>Impressum · Datenschutz · AGB · Widerrufsbelehrung</span>
          </div>
        </footer>
      )}
    </ToastProvider>
  );
}
