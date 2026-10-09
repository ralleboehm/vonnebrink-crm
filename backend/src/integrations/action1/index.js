"use strict";

// ----------------------------------------------------
// Integration: Action1 RMM
// ----------------------------------------------------
//
// Einheitliche Beschreibung für das Integrations-Register
// (src/integrations/index.js). Jede Integration exportiert dieselben Felder.

const client = require("./client");
const scheduler = require("./scheduler");

module.exports = {

    key: "action1",

    name: "Action1 RMM",

    description: "Geräte, Online-Status und fehlende Updates als Assets",

    // Verwaltungsseite im CRM (nur Admins)
    adminPath: "/crm/integrations/action1",

    // Sind die Zugangsdaten in der .env eingetragen?
    isConfigured: (env = process.env) => client.isConfigured(env),

    // Hintergrundaufgaben beim Serverstart (z. B. automatischer Sync)
    start: (env = process.env) => scheduler.start(env),

    stop: () => scheduler.stop()

};
