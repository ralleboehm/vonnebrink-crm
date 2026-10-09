# Vonnebrink CRM

A self-hosted CRM, Helpdesk and Customer Portal designed for Managed Service Providers (MSPs) and IT service companies.

---

## Features

### CRM

- Customer Management
- Contact Management
- Ticket Management
- User & Role Management
- Dashboard
- Activity Logging
- CSV Import & Export (Companies & Contacts)
- Asset Management (Geräte je Kunde)
- Action1 RMM Sync (Geräte, Online-Status, fehlende Updates)

### Customer Portal

- Secure customer login
- View own tickets
- Create new tickets
- Reply to tickets
- Manage profile
- Change password

---

## Technology Stack

### Backend

- Node.js
- Express
- MongoDB
- Mongoose

### Frontend

- Pug
- Bootstrap 5
- Bootstrap Icons

### Security

- bcrypt
- express-session
- Helmet
- express-rate-limit

---

## Current Status

### ✅ Phase 1 completed

Implemented features:

- Authentication
- CRM Dashboard
- Company Management
- Contact Management
- Ticket System
- Customer Portal
- Profile Management
- Password Management

---

## Planned Features

- Internal ticket notes
- File attachments
- Nextcloud integration
- Microsoft 365 integration
- Google Workspace integration
- Reporting

---

## Installation

```bash
git clone https://github.com/<your-github-account>/vonnebrink-crm.git

cd vonnebrink-crm/backend

npm install

npm run dev
```

`npm run dev` und `npm run start` schreiben alle Meldungen (mit Datum und Uhrzeit) zusätzlich in
`backend/logs/crm.log` (E-Mail-Fehler finden: `grep -E "E-Mail|✉️" logs/crm.log`).
Ohne Log-Datei: `npm run dev:plain` / `npm run start:plain` – z. B. für pm2
oder systemd, die selbst protokollieren.

---

## Tests

The import/export logic has tests that need no database and no extra packages:

```bash
cd backend
npm test
```

`test/views.test.js` braucht die installierten Pakete (`npm install`); alle
anderen Tests laufen auch ohne.

Smoke-Test der ganzen Anwendung (braucht eine laufende MongoDB; nutzt die
eigene Testdatenbank `<datenbank>_test`, die echten Daten bleiben unberührt):

```bash
npm run test:smoke
```

Architektur und Konventionen für neue Module: siehe `ARCHITECTURE.md`.

---

## Environment

Create a `.env` file.

Example:

```env
PORT=3000

MONGODB_URI=mongodb://localhost:27017/vonnebrink-crm

SESSION_SECRET=change_this_to_a_secure_random_secret
```

---

## Health Endpoint

```
GET /api/v1/health
```

---

## License

MIT License

---

## Author

**Vonnebrink IT Operations**

https://vonnebrink.com
## Globale Suche

Das Suchfeld in der Navigation durchsucht Firmen, Kontakte und Tickets gleichzeitig
(Taste `/` springt ins Feld, Pfeiltasten wählen einen Vorschlag, Enter öffnet die
Ergebnisseite unter `/crm/search`).

- Mehrere Wörter müssen alle vorkommen („müller heilbronn").
- „mueller" findet „Müller" und umgekehrt.
- Eine exakte Nummer (`CUS-000012`, `CON-…`, `TIC-…`) öffnet direkt den Datensatz.
- Gelöschte Datensätze werden nie angezeigt.
- Tests: `node --test test/search.test.js`

## Assets & Action1

Unter **Assets** (`/crm/assets`) werden die Geräte der Kunden gepflegt: von Hand
oder automatisch aus Action1. Jede Firma zeigt ihre Geräte auf der Firmenseite;
die globale Suche findet Assets auch über Seriennummer, IP und Benutzer, und
`AST-000001` öffnet das Asset direkt.

### Action1 einrichten

1. In Action1 unter *Configuration → API Credentials* einen API-Schlüssel anlegen.
2. In der `.env` `ACTION1_CLIENT_ID`, `ACTION1_CLIENT_SECRET` und `ACTION1_BASE_URL`
   setzen (siehe `.env.example`) und den Server neu starten.
3. Als Admin unter **Action1** (`/crm/integrations/action1`) jede Action1-Organisation
   der passenden Firma zuordnen und **Jetzt synchronisieren** klicken.
4. Optional `ACTION1_SYNC_INTERVAL_MINUTES=60` für einen automatischen Sync.

### Was der Sync macht

- Übernimmt je Gerät: Name, Betriebssystem, Hersteller, Seriennummer, CPU, RAM,
  Datenträger, IP/MAC, letzter Benutzer, Online-Status, zuletzt gesehen,
  fehlende kritische/sonstige Updates, Agent-Version.
- Typ, Status, Ansprechpartner, Kaufdatum, Garantie, Inventarnummer und Notizen
  pflegen Sie im CRM; der Sync überschreibt sie nie.
- Ein von Hand angelegtes Asset mit gleicher Seriennummer wird mit dem
  Action1-Gerät verknüpft statt doppelt angelegt.
- Geräte, die aus Action1 verschwinden, werden markiert („Nicht in Action1“),
  nicht gelöscht.
- Im CRM gelöschte Assets werden vom Sync nicht wieder angelegt.
- Hält das Action1-Limit (< 30 Anfragen pro Minute) ein.

## Benachrichtigungen & E-Mail

- **Glocke** in der Navigation: ungelesene Benachrichtigungen, Übersicht unter `/crm/notifications`.
- **E-Mail** über Nodemailer, Einstellungen nur in der `.env` (`SMTP_*`, `MAIL_FROM`, `APP_URL`).
  Ohne `SMTP_HOST` werden Mails nicht verschickt, sondern nur im Log angezeigt.
- **Vorlagen** in `backend/src/email-templates/` mit Platzhaltern wie `{{customerName}}`,
  `{{ticketNumber}}` und Abschnitten `{{#if agent}} … {{/if}}`.
- **Neues Ticket** (CRM oder Portal): Glocke + E-Mail an Admins/Techniker, Eingangsbestätigung
  an den Ansprechpartner. Wer ein Ticket selbst im CRM anlegt, wird darüber nicht benachrichtigt.
- **E-Mail-Protokoll** (Benutzermenü → E-Mail-Protokoll, nur Admins): jede Vorlagen-Mail mit
  Ergebnis (verschickt / fehlgeschlagen mit Grund / nicht verschickt), Verbindungstest und
  Test-Mail an sich selbst. Einträge werden nach 180 Tagen gelöscht.

### Neues Ereignis hinzufügen

1. Namen in `services/notification/events.js` (`EVENTS`) eintragen – viele sind schon vorbereitet
   (`quote.created`, `invoice.created`, `asset.offline`, `action1.alert` …).
2. Handler in `services/notification/handlers/<bereich>.handlers.js` schreiben und mit `register()` anmelden.
3. Datei in `services/notification/handlers/index.js` eintragen.
4. An der passenden Stelle `notificationService.dispatch(EVENTS.…, payload)` aufrufen.
