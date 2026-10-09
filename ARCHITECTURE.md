# Architektur – Vonnebrink CRM

Verbindliche Konventionen für bestehenden und neuen Code. Ziel: Neue Module
(Sales, Angebote, Rechnungen, Verträge, Managed Services, Reporting,
Nextcloud, Microsoft 365 …) docken an, ohne dass Bestehendes umgebaut wird.

## Aufbau

```text
backend/src/
    app.js, server.js       Express-App, Start
    config/                 Datenbank, Upload-Einstellungen
    core/                   Infrastruktur für alle Module (kein Fachwissen)
        events/             Event-Bus und Ereignisnamen
        permissions/        Rollen & Rechte, requirePermission()
        http/               Flash-Meldungen, sichere Weiterleitungen
        service/            CRUD-Konvention (findAll/findById/…)
    integrations/           externe Systeme (action1/, später nextcloud/, m365/ …)
    models/                 Mongoose-Models
    services/               Fachlogik – EINZIGE Stelle mit Datenbankzugriff
        notification/       Benachrichtigungs-Handler je Ereignis
    controllers/crm|portal/ Request annehmen → Service → Antwort
    middleware/             Anmeldung, Zugriff, View-Daten
    routes/crm|portal/      URL → Middleware → Controller
    views/crm|portal/       Pug-Vorlagen
    email-templates/        E-Mail-Vorlagen mit {{Platzhaltern}}
    utils/                  reine Hilfsfunktionen (Format, Seitenblättern)
    scripts/                create-admin, dev-reset, seed, reset
backend/test/               node:test – npm test, npm run test:smoke
```

Die Ordnung nach Schichten (controllers/, services/, …) bleibt bewusst
bestehen. Ein neues Modul legt seine Dateien in dieselben Ordner, jeweils
mit dem Modulnamen als Präfix (siehe „Neues Modul“).

## Regeln je Schicht

**Controller** nehmen Requests an, rufen Services auf und erzeugen die
Antwort. Kein Model-Import, keine Fachlogik, keine Validierung.

**Services** enthalten Fachlogik, Validierung und alle Datenbankzugriffe.
Namen (neu und als Alias für ältere Services):

| Methode | Bedeutung |
|---|---|
| `findAll(filters)` | Liste |
| `findById(id)` | ein Datensatz oder `null` |
| `create(data)` | anlegen |
| `update(id, data)` | ändern |
| `delete(id)` | löschen (Soft Delete über `isDeleted`, wo vorhanden) |
| `validate(data)` | Fehlermeldung (Deutsch) oder `null` |

Ältere Namen (`getAll`, `getById`, `softDelete`) funktionieren weiter.

**Routes** verbinden URL, Middleware und Controller. Rechte über
`requireRole()` (bestehend) oder `requirePermission()` (neu).

**Views** bekommen fertige Daten. In jeder View verfügbar: `currentUser`,
`can("recht")`, im CRM zusätzlich `notificationBell`.

## Ereignisse (core/events)

Ein Service löst nach einem fachlichen Vorgang ein Ereignis aus; beliebig
viele Zuhörer reagieren (Benachrichtigungen, später Activity-Log, Audit,
Websocket). `emit()` wirft nie. Namen stehen zentral in
`core/events/names.js` (`ticket.created`, `invoice.created` …).
Details: `src/core/events/README.md`.

## Rechte (core/permissions)

Rechte heißen `bereich.aktion` (`tickets.delete`, `invoices.edit`). Die
Rollen-Tabelle bildet das heutige Verhalten ab; Rollen Buchhaltung und
Portal sind vorbereitet.

## Integrationen (integrations/)

Jede Integration: `index.js` (Register-Eintrag), `client.js` (API),
`mapping.js` (reine Umwandlung), `sync.service.js`, `scheduler.js`.
Details: `src/integrations/README.md`.

## Neues Modul (Beispiel: Rechnungen)

1. `models/invoice.model.js`
2. `services/invoice.service.js` – `findAll`, `findById`, `create`, `update`,
   `delete`, `validate`; nach `create` → `events.emit(EVENTS.INVOICE_CREATED, …)`
3. `controllers/crm/invoice.controller.js` – nur Service-Aufrufe
4. `routes/crm/invoice.routes.js` mit `requirePermission("invoices.view")` …,
   in `routes/crm/index.js` eintragen
5. `views/crm/invoices/*.pug`
6. Rechte in `core/permissions` sind schon vorbereitet (`invoices.*`)
7. Optional: Benachrichtigung in `services/notification/handlers/`
8. Tests in `test/invoice.test.js`; Seiten in `test/smoke.test.js` ergänzen

## Tests

- `npm test` – alle Tests ohne Datenbank (Seiten-Tests brauchen `npm install`)
- `npm run test:smoke` – die ganze App gegen die Testdatenbank
  `<datenbank>_test` (alle Seiten, Login, Uploads, Portal-Sperren)

## Entwicklung

- `npm run create-admin` – ersten Admin anlegen
- `npm run dev:reset` – Geschäftsdaten löschen + Beispieldaten (Seeder vorbereitet)
- `npm run dev:reset-demo-data` / `npm run dev:seed` – einzeln
- Alle Dev-Skripte verweigern den Start bei `NODE_ENV=production`.

---

## Authentication

### CRM

- User collection
- Login via username
- Roles:
  - admin
  - technician
  - sales

### Customer Portal

- Separate PortalAccount collection
- Login via email
- Linked Contact
- Linked Company
- First login requires password change

---

## User Management

Portal users are no longer created through the CRM user management.

Portal accounts are created and managed through the Contact module.

CRM users and Portal accounts are intentionally separated.