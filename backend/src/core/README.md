# core/

Querschnittsfunktionen, die jedes Modul nutzen kann. Kein Fachwissen
(keine Tickets, Firmen …) – nur Infrastruktur.

| Ordner/Datei | Zweck |
|---|---|
| `http/flash.js` | einmalige Hinweise nach Weiterleitungen |
| `http/redirect.js` | nur interne Weiterleitungen und Links (Schutz vor Open Redirect) |
| `events/` | Event-Bus: `emit("ticket.created", payload)`, mehrere Zuhörer pro Ereignis |
| `permissions/` | Rollen & Rechte: `can(user, "tickets.delete")`, `requirePermission()` |

Reine Hilfsfunktionen ohne Express/Mongoose (Formatierung, Seitenblättern)
liegen in `utils/`.
