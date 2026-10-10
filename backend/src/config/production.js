"use strict";

// ----------------------------------------------------
// Prüfungen für den Produktivbetrieb (NODE_ENV=production)
// ----------------------------------------------------
//
// Der Server startet im Produktivbetrieb nicht, wenn hier etwas gemeldet
// wird – lieber gar nicht als mit einem bekannten Session-Geheimnis.

const WEAK_SECRETS = new Set(["", "CHANGE_ME", "development-secret", "secret", "changeme"]);

/**
 * @returns {string[]} Probleme (leer = alles in Ordnung)
 */
function productionProblems(env = process.env) {

    if (env.NODE_ENV !== "production") return [];

    const problems = [];
    const secret = String(env.SESSION_SECRET || "").trim();

    if (WEAK_SECRETS.has(secret) || secret.length < 32) {
        problems.push("SESSION_SECRET fehlt oder ist zu kurz (mindestens 32 Zeichen). Erzeugen mit: openssl rand -hex 32");
    }

    const appUrl = String(env.APP_URL || "").trim();

    if (!/^https:\/\//.test(appUrl)) {
        problems.push("APP_URL muss im Produktivbetrieb mit https:// beginnen (z. B. https://crm.vonnebrink.com).");
    }

    const portalUrl = String(env.PORTAL_URL || "").trim();

    if (portalUrl && !/^https:\/\//.test(portalUrl)) {
        problems.push("PORTAL_URL muss mit https:// beginnen (z. B. https://portal.vonnebrink.com).");
    }

    return problems;

}

module.exports = { productionProblems };
