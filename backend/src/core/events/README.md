# core/events – Event-Bus

Module lösen Ereignisse aus, ohne zu wissen, wer darauf reagiert.

```js
const events = require("../core/events");

// auslösen (wirft nie)
await events.emit(events.EVENTS.INVOICE_CREATED, { invoice });

// zuhören (z. B. in services/<bereich>/listeners.js)
events.on(events.EVENTS.INVOICE_CREATED, async ({ invoice }) => { … }, { name: "audit" });
```

## Neues Ereignis

1. Name in `names.js` eintragen (`<bereich>.<vorgang>`, Vergangenheitsform).
2. Am Ende des Use-Cases im Service `events.emit(...)` aufrufen.
3. Zuhörer anmelden – für Benachrichtigungen einfach einen Handler in
   `services/notification/handlers/` schreiben (wird automatisch angemeldet).

## Vorbereitete Erweiterungspunkte

| Zuhörer | Zweck | Stand |
|---|---|---|
| `notifications` | Glocke + E-Mail-Vorlagen | aktiv (`ticket.created`) |
| `activity` | Aktivitätsprotokoll je Datensatz | vorbereitet |
| `audit` | Revisionssicheres Protokoll (wer, wann, was) | vorbereitet |
| `websocket` | Live-Aktualisierung im Browser | vorbereitet |

Zum Debuggen: `DEBUG_EVENTS=1` in der `.env`.
