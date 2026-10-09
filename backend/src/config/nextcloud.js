"use strict";

// ----------------------------------------------------
// Nextcloud (Dokumentenablage) – Konfiguration
// ----------------------------------------------------
//
// .env:
//   NEXTCLOUD_URL           https://cloud.ihre-domain.de  (ohne / am Ende)
//   NEXTCLOUD_USERNAME      eigener Benutzer für das CRM, z. B. "crm"
//   NEXTCLOUD_PASSWORD      App-Passwort dieses Benutzers
//                           (Nextcloud: Einstellungen → Sicherheit → App-Passwort)
//   NEXTCLOUD_ROOT_FOLDER   Hauptordner des CRM in Nextcloud (Standard: CRM)
//   NEXTCLOUD_TIMEOUT       Wartezeit je Anfrage in Millisekunden (Standard: 30000)
//
// Optional:
//   NEXTCLOUD_RETRIES          weitere Versuche bei Netzwerkfehlern/503 (Standard: 2)
//   NEXTCLOUD_RETRY_DELAY_MS   Pause vor dem ersten Wiederholen (Standard: 500, verdoppelt sich)
//   NEXTCLOUD_DEBUG=1          jede Anfrage ins Log schreiben
//
// Ohne URL, Benutzer und Passwort ist die Dokumentenablage aus – das CRM
// läuft ganz normal weiter. Die Werte werden bei jedem Aufruf neu gelesen
// (Tests können sie ändern).

const DEFAULT_ROOT = "CRM";
const DEFAULT_TIMEOUT_MS = 30000;

function intFrom(value, fallback, min = 0) {

    const number = parseInt(value, 10);

    return Number.isInteger(number) && number >= min ? number : fallback;

}

function cleanRoot(value) {

    const root = String(value || "").trim().replace(/^\/+|\/+$/g, "");

    // Keine Sprünge aus dem Benutzerordner heraus
    if (!root || root.split("/").some((part) => part === "." || part === "..")) return DEFAULT_ROOT;

    return root;

}

function getConfig() {

    const url = String(process.env.NEXTCLOUD_URL || "").trim().replace(/\/+$/, "");
    const username = String(process.env.NEXTCLOUD_USERNAME || "").trim();
    const password = String(process.env.NEXTCLOUD_PASSWORD || "");

    // Kein "benutzer:passwort@" in der Adresse (würde in Fehlermeldungen auftauchen)
    const validUrl = /^https?:\/\/[^\s/@]+(\/|$)/i.test(url);

    return {
        url,
        username,
        password,
        rootFolder: cleanRoot(process.env.NEXTCLOUD_ROOT_FOLDER),
        timeoutMs: intFrom(process.env.NEXTCLOUD_TIMEOUT, DEFAULT_TIMEOUT_MS, 1000),
        retries: Math.min(intFrom(process.env.NEXTCLOUD_RETRIES, 2), 5),
        retryDelayMs: intFrom(process.env.NEXTCLOUD_RETRY_DELAY_MS, 500),
        debug: process.env.NEXTCLOUD_DEBUG === "1",
        configured: Boolean(validUrl && username && password),
        invalidUrl: Boolean(url) && !validUrl
    };

}

module.exports = { getConfig, DEFAULT_ROOT };
