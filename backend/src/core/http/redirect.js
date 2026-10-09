"use strict";

// ----------------------------------------------------
// Sichere interne Links und Weiterleitungen
// ----------------------------------------------------
//
// Nur Pfade innerhalb der Anwendung ("/crm/…", "/portal/…") sind erlaubt.
// Fremde Adressen ("https://…", "//host"), "javascript:" usw. werden
// abgewiesen. Schützt vor "Open Redirect" über returnTo-Felder und
// gespeicherte Links.

function isInternalPath(value) {

    if (typeof value !== "string") return false;

    const target = value.trim();

    return target.startsWith("/") &&
        !target.startsWith("//") &&
        !target.startsWith("/\\") &&
        !/[\r\n]/.test(target);

}

/**
 * Bereinigter interner Pfad oder null
 */
function internalPath(value, maxLength = 500) {

    return isInternalPath(value) ? value.trim().slice(0, maxLength) : null;

}

/**
 * Weiterleitungsziel: interner Pfad oder Ersatzziel
 */
function safeRedirectTarget(value, fallback) {

    return internalPath(value, 2000) || fallback;

}

module.exports = {
    isInternalPath,
    internalPath,
    safeRedirectTarget
};
