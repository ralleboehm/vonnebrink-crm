"use strict";

// ----------------------------------------------------
// Alle Benachrichtigungs-Handler anmelden
// ----------------------------------------------------
//
// Jede Datei meldet ihre Handler beim Laden per events.register() an.
// Neue Bereiche (z. B. quote.handlers.js, invoice.handlers.js,
// action1.handlers.js) hier eintragen.

require("./ticket.handlers");
