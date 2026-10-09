# Vonnebrink CRM

A self-hosted CRM, Helpdesk and Customer Portal designed for Managed Service Providers (MSPs) and IT service companies.

---

## Features

### CRM

- Customer Management (inkl. Branche / Gruppen als Schlagwörter – Filter in der Firmenübersicht,
  Suche, CSV-Import/-Export; Grundlage für Marketing & Kampagnen)
- Contact Management
- Ticket Management
- User & Role Management
- Dashboard
- Activity Logging
- CSV Import & Export (Companies & Contacts)
- Asset Management (Geräte je Kunde)
- Action1 RMM Sync (Geräte, Online-Status, fehlende Updates)
- Marketing: E-Mail-Kampagnen, Empfänger mit Einwilligung, Gruppen-Verwaltung, CSV-Export

### Customer Portal

- Secure customer login
- View own tickets
- Create new tickets
- Reply to tickets
- Manage profile
- Change password
- Informations-E-Mails selbst an- und abbestellen

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
- **Antwort oder Datei vom Kunden** (Portal): Glocke für den zugewiesenen Bearbeiter mit Auszug
  der Antwort bzw. Dateinamen; ist niemand (aktiv) zugewiesen, für alle Admins/Techniker. Keine E-Mail.
- **E-Mail-Protokoll** (Benutzermenü → E-Mail-Protokoll, nur Admins): jede Vorlagen-Mail mit
  Ergebnis (verschickt / fehlgeschlagen mit Grund / nicht verschickt), Verbindungstest und
  Test-Mail an sich selbst. Einträge werden nach 180 Tagen gelöscht.

### Neues Ereignis hinzufügen

1. Namen in `services/notification/events.js` (`EVENTS`) eintragen – viele sind schon vorbereitet
   (`quote.created`, `invoice.created`, `asset.offline`, `action1.alert` …).
2. Handler in `services/notification/handlers/<bereich>.handlers.js` schreiben und mit `register()` anmelden.
3. Datei in `services/notification/handlers/index.js` eintragen.
4. An der passenden Stelle `notificationService.dispatch(EVENTS.…, payload)` aufrufen.

## Marketing

Menü **Marketing** (Rollen: Admin und Vertrieb).

- **Empfänger** (`/crm/marketing`): Wer ist für Kampagnen erreichbar? Filter nach Gruppe und Name,
  Kennzahlen, CSV-Export (Serienbrief / Anrufliste).
- **Gruppen** (`/crm/marketing/groups`): alle Branchen / Gruppen der Firmen mit Anzahl Firmen und
  erreichbaren Kontakten; umbenennen, zusammenführen (umbenennen auf einen vorhandenen Namen), entfernen.
- **Kampagnen** (`/crm/marketing/campaigns`): E-Mail an eine Zielgruppe schreiben, ansehen, testen, versenden.

### Kampagnen

1. **Neue Kampagne**: Name, Betreff, Text, Zielgruppe (Gruppen; keine Auswahl = alle erreichbaren Kontakte).
   Der Text ist normaler Text – Leerzeile = neuer Absatz, `https://…` wird ein Link.
2. **Platzhalter** je Empfänger: `{{anrede}}` („Sehr geehrter Herr Müller“ / „Sehr geehrte Frau Müller“),
   `{{vorname}}`, `{{nachname}}`, `{{firma}}`, `{{position}}`, `{{email}}` (englisch geht auch:
   `{{firstName}}`, `{{lastName}}`, `{{company}}`). Unbekannte Platzhalter werden beim Speichern gemeldet.
3. **Vorschau** (mit Beispielwerten) und **Test-Mail** an die eigene Adresse.
4. **Senden**: Die Empfängerliste wird festgeschrieben, die Mails gehen nacheinander im Hintergrund raus.
   Vor jeder Mail wird geprüft, ob der Kontakt noch erreichbar ist. Jede Mail enthält den persönlichen
   Abmeldelink (auch als `List-Unsubscribe`-Kopfzeile) und steht im E-Mail-Protokoll.
5. Versendete Kampagnen sind nicht mehr änderbar – **Duplizieren** legt einen neuen Entwurf an.
   Startet der Server während eines Versands neu, geht es danach mit den offenen Empfängern weiter.

Ohne Mailserver (`SMTP_HOST`, `MAIL_FROM` in der `.env`) lässt sich alles vorbereiten, aber nicht versenden.

### Wer ist erreichbar?

Kontakte, die aktiv sind, eine gültige E-Mail-Adresse haben und **eingewilligt** haben.
Ein Portalzugang ist nicht nötig – jede Kampagnen-Mail enthält einen persönlichen **Abmeldelink**.

### Einwilligung

| Art | Wer | Wie |
|---|---|---|
| Kundenportal | Kontakt selbst | *Mein Profil* → „Informationen per E-Mail“ |
| Double-Opt-In | Kontakt selbst | Beim Kontakt „Bestätigungs-E-Mail senden“ (nur auf Wunsch, z. B. Haken im Website-Formular); der Kontakt bestätigt per Link (30 Tage gültig) |
| Nachweis | Mitarbeiter | Beim Kontakt mit Notiz, z. B. „schriftlich am …“ |
| Bestandskunde (§ 7 Abs. 3 UWG) | Mitarbeiter | Nur für Firmen mit Status „Aktiv“; Notiz, wo auf das Widerspruchsrecht hingewiesen wurde. Wird die Firma inaktiv, ist der Kontakt nicht mehr erreichbar |

- Abmelden: im Portal oder über den Abmeldelink `/email/abmelden/<schlüssel>` (ohne Anmeldung,
  auch Ein-Klick-Abmeldung per `List-Unsubscribe-Post`).
- Hat sich ein Kontakt **selbst abgemeldet** (Portal oder Link), kann ihn kein Mitarbeiter wieder
  eintragen – nur er selbst (Portal oder Bestätigungs-E-Mail).
- Der CSV-Export der Empfänger enthält den Abmeldelink (z. B. für Serienmails).
- Jede Änderung steht im Verlauf (wann, wer, wie, Notiz). Ticket-E-Mails sind davon nicht betroffen.

Rechtlicher Hinweis: Das CRM hilft beim Nachweis, ersetzt aber keine Rechtsberatung (DSGVO, UWG).

## Rollen

| Bereich | Administrator | Techniker | Vertrieb |
|---|---|---|---|
| Firmen, Kontakte | ✔ | ✔ | ✔ |
| Tickets | ✔ | ✔ | nur Liste (Nummer, Betreff, Firma, Status) – kein Öffnen, keine Nachrichten/Anhänge |
| Assets | ✔ | ✔ | nur ansehen |
| Marketing | ✔ | – | ✔ |
| Sales / Angebote (später) | ✔ | – | ✔ |
| Benutzer, Import & Export, Action1, E-Mail-Protokoll | ✔ | – | – |

Die Rechte stehen in `backend/src/core/permissions/index.js`. Die globale Suche zeigt nur Bereiche,
die der Benutzer öffnen darf. Benachrichtigungen zu neuen Tickets gehen an Admins und Techniker.
