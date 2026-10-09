# Refactoring-Report – Vonnebrink CRM

Stand: 09.10.2026 · Basis: `main` mit Assets, Dashboard und Benachrichtigungen

Grundsatz: keine Features entfernt, keine URLs, Datenbankfelder oder
Oberflächen geändert. Jede Änderung ist ein eigener Commit und lässt sich
einzeln zurücknehmen.

---

## 0. Smoke-Test als Sicherheitsnetz

**Was:** `test/smoke.test.js`, Aufruf `npm run test:smoke`. Startet die App
gegen `<datenbank>_test`, legt Beispieldaten an und prüft über 60 Seiten und
Aktionen: Login CRM/Portal, alle Listen-, Detail- und Formularseiten, Ticket
anlegen (CRM & Portal) inkl. Benachrichtigung, Nachricht, Datei hoch- und
herunterladen, Asset anlegen und Validierung, Suche und Nummernsprung,
CSV-Export, 404-Verhalten, Logout – und dass Portal-Kunden keine fremden
Tickets, Nachrichten oder Dateien erreichen.

**Warum:** Ein Refactoring ohne Prüfung der echten Seiten ist Blindflug.

**Vorteil:** Jede künftige Änderung lässt sich in einer Minute absichern.

**Zukunft:** Jedes neue Modul ergänzt seine Seiten in der Liste.

**Risiken:** Keine für die Daten – der Test bricht ab, wenn der
Datenbankname nicht auf `_test` endet, schaltet E-Mail und Action1 ab und
schreibt Uploads in einen temporären Ordner.

## 1. Gemeinsame Helfer

**Was:**
- `core/http/flash.js` – Flash-Meldungen (vorher nur im Action1-Controller)
- `core/http/redirect.js` – nur interne Weiterleitungen/Links (vorher
  zweimal leicht unterschiedlich implementiert)
- `utils/pagination.js` – Seitenblättern (vorher im Notification-Service)
- `utils/format.js` – Datum, Uhrzeit, „vor 5 Min.“ (vorher in assetLabels;
  dort weiterhin verfügbar)

**Warum:** Diese Logik braucht jedes kommende Modul (Rechnungslisten,
Angebote …); vorher war sie in einzelnen Dateien versteckt.

**Vorteil:** Eine Stelle, getestet (`test/core.test.js`). Die
Weiterleitungsprüfung blockt jetzt zusätzlich Zeilenumbrüche.

**Risiken:** Datumsanzeige verwendet jetzt ausdrücklich die Zeitzone
Europe/Berlin – auf einem Server in UTC stimmen Uhrzeiten dadurch erst
richtig. Sonst keine Verhaltensänderung.

## 2. Model-Zugriffe aus Controllern in Services

**Was:** Dashboard → `services/dashboard.service.js`; Action1-Protokoll →
`getRecentRuns()` u. a. im Sync-Service; Asset-Konstanten über den
Asset-Service.

**Warum:** Regel „Controller nur Request → Service → Antwort“.

**Vorteil:** Neue Dashboard-Kacheln (Vertrieb, Rechnungen) nur im Service.

**Risiken:** Gering; Abfragen sind 1:1 übernommen.

## 3. Portal-Besitzprüfung & Dateianhänge entdoppelt

**Was:**
- `middleware/portal/ticketAccess.middleware.js` – `loadOwnTicket()` prüft
  „Ticket gehört zur Firma des Kunden“ (vorher 5× kopiert)
- `attachment.service`: `storeUpload`, `discardUpload`, `findForTicket`,
  `getFilePath`, `removeWithFile` – gemeinsam für CRM und Portal (vorher je
  ~150 Zeilen doppelt, zwei verschiedene Ablagewege)
- entfernt: ungenutzte Kopie `middleware/portal/portalaccess.middleware.js`
  und die nicht mehr genutzte `storageService.storeFile()`

**Warum:** Sicherheitsrelevante Prüfungen dürfen nicht an fünf Stellen
gepflegt werden.

**Vorteil:** Portal-Ticket-Controller von 437 auf 294 Zeilen. Kleine
Verbesserungen: Bei abgelehntem Upload (fremdes Ticket) bleibt keine
temporäre Datei mehr liegen; im CRM wird beim Herunterladen/Löschen geprüft,
dass der Anhang zum Ticket in der URL gehört.

**Risiken:** Neue Portal-Uploads liegen jetzt wie CRM-Uploads unter
`storage/tickets/<Ticketnummer>/` (vorher `<Ticket-ID>`). Bestehende Dateien
bleiben, wo sie sind – der Pfad steht je Anhang in der Datenbank. Der
Smoke-Test prüft Upload und Download in beiden Bereichen.

## 4. Einheitliche Service-Namen

**Was:** `core/service/crudAliases.js` ergänzt `findAll`, `findById`,
`delete` für Firmen, Kontakte, Tickets, Benutzer, Assets, Portalzugänge.

**Warum:** Drei Namensschemata (`getAll`/`findAll`, `softDelete`/`delete`).

**Vorteil:** Neuer Code nutzt ein Schema; nichts Bestehendes bricht.

**Risiken:** Keine – Aliase überschreiben nie vorhandene Methoden
(`portalAccount.delete` bleibt das echte Löschen).

**Bewusst nicht gemacht:** Alle Services auf einen Stil (Klasse vs.
`exports`) umschreiben – viel Änderung, kein Nutzen für den Betrieb.

## 5. Rechte-Architektur

**Was:** `core/permissions` – Rechte `bereich.aktion`, Rollen Admin,
Techniker, Vertrieb, Buchhaltung (vorbereitet), Portal; `can()`,
`requirePermission()`, `can()` in allen Views.

**Warum:** `role.model`/`permission.model` existierten ungenutzt; Prüfungen
waren über `requireRole`/`requireInternal` verstreut.

**Vorteil:** Neue Module bringen ihre Rechte mit (`invoices.*` ist schon
angelegt). Die Tabelle bildet das heutige Verhalten exakt ab, Umstellen
einer Route auf `requirePermission` ändert also nichts.

**Risiken:** Keine – bestehende Routen sind unverändert.

**Später:** Rollen aus der Datenbank, Rechte-Oberfläche, engere Rechte für
Vertrieb/Buchhaltung.

## 6. Event-Bus

**Was:** `core/events` – beliebig viele Zuhörer je Ereignis, zentrale
Namensliste. Das Benachrichtigungssystem ist jetzt ein Zuhörer
(`notifications`); `ticketCreated()` läuft über den Bus.

**Warum:** Das bisherige Register erlaubte nur einen Handler pro Ereignis –
Activity-Log, Audit und Websocket hätten sich gegenseitig ausgeschlossen.

**Vorteil:** Audit, Activity, Websocket, Action1-Alarme, Nextcloud-Ereignisse
docken an, ohne bestehenden Code zu ändern. `DEBUG_EVENTS=1` zeigt alle
Ereignisse im Log.

**Risiken:** Gering – Verhalten bei neuen Tickets ist gleich (Smoke-Test
prüft Benachrichtigungen aus CRM und Portal). Ein fehlerhafter Zuhörer
stoppt weder andere Zuhörer noch das Anlegen des Tickets.

## 7. Integrationen

**Was:** `services/action1/` → `integrations/action1/` mit `index.js`;
`integrations/index.js` als Register; `server.js` startet alle
Integrationen über `startAll()`.

**Vorteil:** Nextcloud, M365, Google, Bitwarden folgen demselben Aufbau
(`integrations/README.md`).

**Risiken:** Keine Verhaltensänderung; alle Action1-Tests laufen unverändert.

## 8. Dev-Toolkit und Fehler in Skripten

**Was:** `npm run create-admin`, `dev:reset`, `dev:seed`,
`dev:reset-demo-data`; gemeinsamer Schutz `scripts/lib/devGuard.js`
(Abbruch bei `NODE_ENV=production`). Seeder ist vorbereitet, noch ohne Daten.

**Behobene Fehler:**
- `reset-demo-data` ließ Assets, Benachrichtigungen, Action1-Protokolle und
  Aktivitäten stehen → nach einem Reset blieben Geräte ohne Firma übrig.
  Jetzt werden sie mitgelöscht, der Asset-Zähler wird zurückgesetzt.
- `create-admin` las nur `MONGO_URI`, obwohl `.env.example` `MONGODB_URI`
  dokumentiert – das Skript schlug mit einer frischen `.env` fehl.

## 9. Validierung

**Was:** Asset-Validierung (Pflichtfelder, Firma existiert, Kontakt gehört
zur Firma) aus dem Controller in `assetService.validate()`.

**Konvention:** Validierung gehört in den Service (`validate()` gibt eine
deutsche Fehlermeldung oder `null` zurück). Ein eigener `validation/`-Ordner
lohnt sich erst, wenn Regeln zwischen Modulen geteilt werden.

---

## Performance

Geprüft: Dashboard (alle Abfragen parallel), Glocke (zwei indizierte
Abfragen je Seitenaufruf, nicht bei JSON/Formularen), Suche (begrenzte
Treffermengen), Asset-Liste. Keine doppelten Abfragen gefunden, die sich
ohne Verhaltensänderung einsparen ließen.

## Bewusst nicht umgesetzt

| Punkt | Grund |
|---|---|
| Umzug in `src/modules/<modul>/` | hätte fast jede Datei und jeden Pfad geändert, ohne fachlichen Nutzen; die Schichtenordnung ist konsistent und dokumentiert |
| doppeltes `requireAuth` in Routen (zusätzlich zu app.js) | harmlos, schützt Routen auch einzeln; Entfernen bringt nichts |
| einheitlicher Stil Klasse vs. `exports` | reine Kosmetik bei hohem Änderungsumfang |
| `validation/`-Ordner je Modul | erst sinnvoll bei geteilten Regeln (s. o.) |

## Tests

| Datei | Inhalt |
|---|---|
| `core.test.js` (neu) | Helfer, Event-Bus, Rechte, CRUD-Aliase |
| `smoke.test.js` (neu) | ganze App gegen Testdatenbank |
| bestehende | unverändert grün |

Zusätzlich vor der Auslieferung geprüft: Die gesamte Anwendung lädt, alle
122 Routen/Middlewares verweisen auf existierende Funktionen, alle
`require`- und Pug-`include`-Pfade lösen auf.
