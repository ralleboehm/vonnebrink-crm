"use strict";

// ----------------------------------------------------
// Register aller Integrationen
// ----------------------------------------------------
//
// Jede Integration liegt in einem eigenen Ordner (src/integrations/<key>/)
// und exportiert in ihrer index.js:
//
//   key, name, description, adminPath,
//   isConfigured(env), start(env), stop()
//
// Neue Integration (z. B. Nextcloud): Ordner anlegen, index.js nach dem
// Vorbild von action1/index.js schreiben und unten eintragen. server.js
// startet automatisch alle eingetragenen Integrationen.

const INTEGRATIONS = [
    require("./action1")
    // require("./nextcloud"),
    // require("./m365"),
    // require("./google"),
    // require("./bitwarden"),
];

function list() {

    return INTEGRATIONS.map((integration) => ({
        key: integration.key,
        name: integration.name,
        description: integration.description,
        adminPath: integration.adminPath,
        configured: integration.isConfigured()
    }));

}

function get(key) {

    return INTEGRATIONS.find((integration) => integration.key === key) || null;

}

/**
 * Beim Serverstart: Hintergrundaufgaben aller Integrationen starten.
 * Ein Fehler in einer Integration verhindert den Start der anderen nicht.
 */
function startAll(env = process.env) {

    for (const integration of INTEGRATIONS) {

        try {
            integration.start(env);
        } catch (err) {
            console.error(`❌ Integration ${integration.name} konnte nicht starten:`, err.message);
        }

    }

}

function stopAll() {

    for (const integration of INTEGRATIONS) {

        try {
            integration.stop();
        } catch {
            // beim Herunterfahren egal
        }

    }

}

module.exports = {
    list,
    get,
    startAll,
    stopAll
};
