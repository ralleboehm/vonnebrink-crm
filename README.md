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
- **Antwort oder Datei vom Kunden** (Portal): Glocke **und E-Mail** (`ticket-reply-internal`) an den
  zugewiesenen Bearbeiter; ist niemand (aktiv) zugewiesen, an alle Admins/Techniker.
- **Antwort oder Datei im CRM**: E-Mail „Neue Antwort zu Ihrem Ticket“ (`ticket-reply`) an den
  Ansprechpartner – mit Link ins Portal, wenn er einen aktiven Zugang hat. Interne Notizen und
  interne Dateien lösen keine Mail aus.
- **Bearbeiter zugewiesen**: Glocke für den Bearbeiter (außer bei Selbstzuweisung); beim ersten
  Zuweisen E-Mail an den Kunden „Ihr Ticket wird bearbeitet“ (`ticket-assigned`).
- **Gelöst / Geschlossen**: E-Mail an den Kunden (`ticket-closed`), einmal je Abschluss – mit
  freiwilliger NPS-Frage (siehe Kundenumfragen).
- **Portalzugang anlegen / Passwort zurücksetzen** (Kontakt): mit Haken „per E-Mail schicken“
  gehen die Zugangsdaten an den Kontakt (`portal-welcome`, `password-reset`). Das vorläufige
  Passwort gilt nur für die erste Anmeldung.

| Vorlage | Empfänger | Auslöser |
|---|---|---|
| `ticket-created` | Kunde | neues Ticket |
| `ticket-created-internal` | Admins, Techniker | neues Ticket |
| `ticket-reply` | Kunde | Antwort / Datei im CRM (nicht intern) |
| `ticket-reply-internal` | zuständiger Techniker (sonst Team) | Antwort / Datei im Portal |
| `ticket-assigned` | Kunde | erstes Zuweisen |
| `ticket-closed` | Kunde | Status Gelöst / Geschlossen (mit NPS-Frage, siehe unten) |
| `portal-welcome` | Kunde | Portalzugang angelegt (mit Haken) |
| `password-reset` | Kunde | Passwort zurückgesetzt (mit Haken) |
| `marketing-confirm` | Kunde | Double-Opt-In angefordert |
| `contract-reminder` | Admins, Vertrieb | Kündigungsfrist bzw. Vertragsende in 60/30/7 Tagen |
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
   Der Editor arbeitet wie Word: Überschriften, Fett/Kursiv, Farbe, Listen, Ausrichtung, Zitat, Links und
   **Bilder** (Knopf, Hineinziehen oder Einfügen mit Strg+V; große Bilder werden auf E-Mail-Breite verkleinert).
   Bilder werden in die Mail eingebettet (Anhang mit Content-ID) – sie brauchen keinen öffentlichen Server.
   Grenzen: 2 MB je Bild, 4 MB alle Bilder zusammen, 20 Bilder. Das HTML wird beim Speichern bereinigt
   (`utils/htmlSanitizer.js`). Der Editor (Quill) kommt von cdn.jsdelivr.net, ohne Verbindung erscheint ein HTML-Feld.
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

**Öffentliche Adresse nötig:** Kampagnen werden nur verschickt, wenn `APP_URL` eine aus dem Internet
erreichbare Adresse ist (z. B. `APP_URL=https://crm.vonnebrink.com`), denn daraus entsteht der Abmeldelink.
Mit `localhost`, `192.168.…` usw. ist „Senden“ gesperrt; Test-Mails an sich selbst gehen trotzdem.

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

## Vertrieb

Menü **Vertrieb** (Rollen: Admin und Vertrieb, nicht Techniker).

- **Pipeline** (`/crm/sales`): Tafel mit einer Spalte je Phase – Karten per Ziehen verschieben.
  Oben: offene Chancen, Monatsumsatz der Pipeline, **Prognose** (Monatsumsatz × Wahrscheinlichkeit),
  gewonnener Monatsumsatz der letzten 90 Tage und „Heute zu tun“ (überfällige, heute fällige
  Chancen und Chancen ohne nächsten Schritt).
- **Verkaufschance**: Firma (auch Interessent), Ansprechpartner, Zuständiger, Wert monatlich und
  einmalig, Wahrscheinlichkeit, erwarteter Abschluss, Quelle (auch Kampagne), **nächster Schritt mit
  Datum**, Verlauf mit Notizen. Phasen: Neu → Erstgespräch → IT-Check → Angebot → Verhandlung →
  Gewonnen / Verloren (mit Grund). Gewonnen macht aus einer Firma mit Status „Interessent“ einen Kunden.
- Die Firmenseite zeigt ihre Verkaufschancen. Regeln: `utils/salesRules.js`.

## Kundenumfragen (NPS)

Menü **Umfragen** (nur Admins).

- Die Abschluss-Mail (`ticket-closed`) enthält die Frage „Wie wahrscheinlich ist es, dass Sie uns
  weiterempfehlen?“ als Leiste 0–10. Ein Klick öffnet `/email/umfrage/<Link>` mit vorausgewähltem
  Wert; erst mit „Bewertung absenden“ wird gespeichert (Link-Scanner lösen nichts aus). Ein
  Kommentar ist möglich, alles ist **freiwillig**.
- Ein Kontakt bekommt höchstens **alle 30 Tage** eine Umfrage, je Ticket höchstens eine. Links
  gelten 60 Tage und können nur einmal beantwortet werden.
- Kritische Bewertungen (0–6) erscheinen bei den Admins in der Glocke.
- **Auswertung** (`/crm/surveys`): NPS (% Promotoren 9–10 minus % Kritiker 0–6), Antworten,
  Rücklauf, Durchschnitt, Aufteilung, Verteilung 0–10, Verlauf je Monat, Tabelle je Firma und alle
  Antworten mit Kommentar und Ticket. Filter nach Zeitraum, Firma, Gruppe, Text; CSV-Export.
- Regeln und Kennzahlen: `utils/npsRules.js`, Versand und Auswertung: `services/survey.service.js`.

## Dokumente (Nextcloud)

Reiter **Dokumente** auf jeder Firmenseite. Die Dateien liegen ausschließlich in Nextcloud,
MongoDB speichert nur Metadaten (Name, Kategorie, Größe, Prüfsumme, Version, Nextcloud-Pfad, wer/wann).

**Einrichten**

1. In Nextcloud einen eigenen Benutzer für das CRM anlegen (z. B. `crm`) und ein **App-Passwort**
   erzeugen (Einstellungen → Sicherheit).
2. In `backend/.env`: `NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_PASSWORD`, optional
   `NEXTCLOUD_ROOT_FOLDER` (Standard `CRM`) und `NEXTCLOUD_TIMEOUT` (ms, Standard 30000).
3. CRM neu starten und `npm run nextcloud:setup` ausführen: prüft die Verbindung und legt die
   Kundenordner für alle vorhandenen Firmen an (beliebig oft ausführbar).

Ohne diese Werte läuft das CRM wie bisher; der Reiter zeigt dann einen Einrichtungshinweis.

**Ablage**

```
CRM/Customers/CUS-000001 Musterfirma/
    Contracts/ Offers/ Invoices/ Manuals/ Licenses/ Reports/
    Photos/ Projects/ Downloads/ Other/
```

Ticket-Anhänge und Asset-Dateien bleiben bewusst lokal (`storage/`).

- Neue Firma → Kundenordner entsteht automatisch (im Hintergrund). Vorhandene Ordner werden nie
  neu angelegt. Wird die Firma umbenannt, bleibt der Ordner derselbe.
- Die **Kategorie** bestimmt den Unterordner (Vertrag → Contracts, Angebot → Offers, Rechnung →
  Invoices, Lizenz → Licenses, Handbuch → Manuals, Bericht → Reports, Foto/Screenshot → Photos,
  Projektunterlage → Projects, Download für Kunden → Downloads, Backup/Konfiguration/Sonstiges →
  Other). Weitere Kategorien:
  `registerCategory()` in `utils/documentRules.js`.
- **Versionen:** gleicher Dateiname in derselben Kategorie = neue Version; Nextcloud behält die
  alten Fassungen. Gleicher Inhalt wird erkannt und nicht erneut hochgeladen.
- **Löschen** verschiebt die Datei in den Nextcloud-Papierkorb.
- Vorschau im Browser für PDF, Bilder und Text; Office-Dateien über „In Nextcloud öffnen“.
- **Detailseite** je Dokument (Klick auf den Namen): Angaben, **Versionen** (frühere Fassungen
  herunterladen), **Freigaben** (nur Admin): öffentlicher Link – auf Wunsch mit Passwort und
  Ablaufdatum – oder intern für einen Nextcloud-Benutzer/eine Nextcloud-Gruppe; Freigaben entfernen.
- **Kundenportal (vorbereitet):** Dokumente der Kategorien Vertrag, Angebot, Rechnung, Handbuch,
  Download und Projektunterlage lassen sich „für das Kundenportal freigeben“. Das Portal zeigt sie
  noch nicht an; `document.service` liefert dafür schon `portalDocuments(firma)` und
  `getPortalDownload(id, firma)` (nur eigene, freigegebene Dokumente).
- **Verträge:** Dokumente zu einem Vertrag landen immer unter `Contracts/` und erscheinen auf der
  Vertragsseite und im Dokumente-Reiter der Firma (siehe Abschnitt Verträge).

| Recht | Admin | Techniker | Vertrieb |
|---|---|---|---|
| Ansehen, Herunterladen | alle Kategorien | alle Kategorien | nur Verträge, Angebote |
| Hochladen | ✔ | ✔ | nur Verträge, Angebote |
| Umbenennen, Verschieben, Löschen, Portal-Freigabe | ✔ | – | – |
| Freigabelinks | ✔ | – | – |

**Technik:** `services/nextcloud.service.js` ist der zentrale Zugang für alle Module (WebDAV:
Ordner, Hochladen, Herunterladen, Verschieben, Kopieren, Umbenennen, Löschen, Eigenschaften;
Versionen; Freigaben über die OCS-API) mit Zeitlimit, Wiederholen bei Störungen (503, Abbruch)
und Log (`NEXTCLOUD_DEBUG=1` zeigt jede Anfrage). Fachlogik: `services/document.service.js`.
Ereignisse: `document.uploaded`, `.downloaded`, `.updated`, `.deleted`, `.shared`,
`.versionCreated`. Die Tests laufen gegen einen Nextcloud-Nachbau (`test/helpers/fakeNextcloud.js`).

## Verträge

Menü **Kunden → Verträge** (`/crm/contracts`), außerdem eine Karte auf jeder Firmenseite.

- **Vertrag:** Nummer (VTR-000001), Titel, Firma, Ansprechpartner, Status (Entwurf, Versendet,
  Gelesen, Signiert, Aktiv, Abgelaufen, Gekündigt), Unterschrift, Version, Notizen.
- **Fristen** werden aus Beginn, Laufzeit, Kündigungsfrist und automatischer Verlängerung berechnet
  (wie § 188 BGB: 01.01. + 12 Monate → 31.12.; 31.01. + 1 Monat → 28./29.02.). Bei automatischer
  Verlängerung zeigt das CRM immer die **laufende** Periode und deren „Kündigung bis“.
- **Übersicht:** aktive Verträge, „Kündigungsfrist in 60 Tagen“, offene und Entwürfe; Filter nach
  Status, Firma, Suche und „Frist bald“. Auf der Vertragsseite ein Hinweis, wenn die Frist naht oder
  ein Vertrag ohne Verlängerung abgelaufen ist.
- **Status** per Knopf weiterschalten (Entwurf → Versendet → Gelesen/Signiert → Aktiv → Gekündigt).
- **Vertragsdokumente** direkt auf der Vertragsseite hochladen (Nextcloud, `Contracts/`).
- **Erinnerungen:** 60, 30 und 7 Tage vor der Kündigungsfrist (ohne Kündigungsfrist: vor dem
  Vertragsende) bekommen **nur Admins und Vertrieb** eine Glocke und eine E-Mail (Vorlage
  `contract-reminder`). Gilt für signierte und aktive Verträge, jede Stufe genau einmal; nach einer
  automatischen Verlängerung beginnt es für die neue Frist von vorn. Geprüft wird zwei Minuten nach
  dem Start und danach alle 6 Stunden. Stufen ändern oder abschalten: `CONTRACT_REMINDER_DAYS=60,30,7`
  bzw. `CONTRACT_REMINDER_DAYS=aus` in der `.env`.
- Regeln und Fristen: `utils/contractRules.js`, Fachlogik: `services/contract.service.js`.

## Rollen

| Bereich | Administrator | Techniker | Vertrieb |
|---|---|---|---|
| Firmen, Kontakte | ✔ | ✔ | ✔ |
| Tickets | ✔ | ✔ | nur Liste (Nummer, Betreff, Firma, Status) – kein Öffnen, keine Nachrichten/Anhänge |
| Assets | ✔ | ✔ | nur ansehen |
| Marketing (Kampagnen, Empfänger, Gruppen) | ✔ | – | ✔ |
| Vertrieb (Pipeline, Verkaufschancen; Angebote später) | ✔ | – | ✔ |
| Dokumente (Nextcloud) | ✔ | lesen, hochladen | Verträge, Angebote: lesen, hochladen |
| Verträge | ✔ (auch löschen) | ansehen | ansehen, anlegen, bearbeiten |
| Kundenumfragen (NPS) | ✔ | – | – |
| Benutzer, Import & Export, Action1, E-Mail-Protokoll | ✔ | – | – |

Die Rechte stehen in `backend/src/core/permissions/index.js`. Die globale Suche zeigt nur Bereiche,
die der Benutzer öffnen darf. Benachrichtigungen zu neuen Tickets gehen an Admins und Techniker.
