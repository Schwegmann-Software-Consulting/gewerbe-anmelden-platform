# gewerbe-anmelden.com

Privater Service: Kunden füllen die Gewerbeanmeldung online aus, wir reichen sie mit Vollmacht
beim zuständigen Gewerbeamt ein. Servicegebühr = Prozentsatz der Amtsgebühr, einstellbar je Stadt.

## Aufbau (API-first)

```
packages/core   Gemeinsame Logik für Server UND alle Frontends
                – pricing.js   Preisberechnung (Cent, USt., Rundung, Gebührenmodus)
                – schema.js    Validierung der Gewerbeanzeige (GewA1-Felder) mit zod
                – constants.js Kanäle, Status, Rechtsformen
                – seed.js      Start-Städte (Beispielwerte!) + PLZ-Zuordnung
server          Zentrale API (Hono, Node 22, SQLite → später Postgres)
                – routes/public.js  Städte, Preise, Anträge, Uploads, Absenden, Stripe-Webhook
                – routes/admin.js   Gebühren je Stadt, Prüfung, Status, Frontends, Kennzahlen
                – services/pdf.js   Einreichungspaket: Anschreiben, GewA1, Vollmacht, Ausweis
                – services/transmit Adapter je Kanal: E-Mail, Post, Fax, Portal, XGewerbeanzeige
                – worker.js         Job-Queue mit Retries für die Übermittlung
                – openapi.yaml      Schnittstellenbeschreibung für weitere Frontends
web             React-Frontend (Vite). Ohne VITE_API_URL läuft es als Demo komplett im Browser.
```

Jedes weitere Frontend (Landingpage, Partner-Widget, App) bekommt im Admin einen eigenen
API-Key und spricht dieselben Endpunkte. Preise und Validierung kommen immer vom Server.

## Starten

```bash
npm install
cp server/.env.example server/.env      # ADMIN_TOKEN, DATA_KEY setzen
npm run dev:server                       # http://localhost:8787
cp web/.env.example web/.env             # VITE_API_URL=http://localhost:8787/v1
npm run dev:web                          # http://localhost:5173
```

Ohne Stripe-Schlüssel gilt ein Antrag beim Absenden sofort als bezahlt. `TRANSMIT_MODE=dry-run`
erzeugt nur das PDF-Paket (abrufbar unter `/v1/admin/applications/{id}/packet.pdf`) und versendet nichts.

## Vor dem Livegang

- Je Stadt Amtsgebühr, Empfänger und Übermittlungsweg prüfen und `verified` setzen
- PLZ-Zuordnung aus dem amtlichen Gemeindeverzeichnis statt der Beispiel-Bereiche
- Amtliches GewA1-PDF je Bundesland befüllen statt des neutralen Layouts
- Postversand- und Fax-Adapter für den gewählten Anbieter implementieren
- Rechtstexte (Impressum, AGB, Widerruf, Datenschutz), AV-Verträge, Löschkonzept
