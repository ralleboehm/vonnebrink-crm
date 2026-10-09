# integrations/

Anbindungen an externe Systeme. Jede Integration ist ein eigener Ordner
mit demselben Aufbau – Vorbild ist `action1/`.

```text
integrations/
    index.js            Register: list(), get(key), startAll()
    action1/            Action1 RMM (vorhanden)
        index.js        Beschreibung für das Register
        client.js       API-Zugriff (Anmeldung, Limits, Seiten)
        mapping.js      externe Daten -> CRM-Felder (rein, gut testbar)
        sync.service.js Abgleich mit der Datenbank
        scheduler.js    automatische Läufe
    nextcloud/          geplant
    m365/               geplant
    google/             geplant
    bitwarden/          geplant
```

## Regeln

- Zugangsdaten nur aus der `.env` (`<KEY>_…`, z. B. `NEXTCLOUD_URL`).
- Der Client kapselt alle HTTP-Aufrufe; sonst spricht niemand mit der API.
- Mapping-Funktionen ohne Datenbank, damit sie mit Testdaten prüfbar sind.
- Ein Fehler einer Integration darf nie den Serverstart oder andere
  Integrationen stoppen.
- Ereignisse (z. B. `action1.alert`) über `core/events` auslösen, nicht
  direkt Benachrichtigungen verschicken.
- Verwaltungsseite unter `/crm/integrations/<key>`, nur für Admins.
