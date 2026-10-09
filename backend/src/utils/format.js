"use strict";

// ----------------------------------------------------
// Formatierung (Datum & Zeit) für Views und E-Mails
// ----------------------------------------------------
//
// Reine Funktionen ohne Abhängigkeiten. Vorher in utils/assetLabels.js;
// dort weiterhin verfügbar, damit bestehende Views unverändert bleiben.

const TIME_ZONE = "Europe/Berlin";

function toDate(value) {

    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;

}

/**
 * 09.10.2026
 */
function formatDate(value) {

    const date = toDate(value);

    return date ? date.toLocaleDateString("de-DE", { timeZone: TIME_ZONE }) : "-";

}

/**
 * 09.10.2026, 14:05
 */
function formatDateTime(value) {

    const date = toDate(value);

    if (!date) return "-";

    return date.toLocaleString("de-DE", {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

}

/**
 * Wert für <input type="date">
 */
function dateInputValue(value) {

    const date = toDate(value);

    return date ? date.toISOString().slice(0, 10) : "";

}

/**
 * "vor 5 Min." / "vor 3 Std." / "vor 2 Tagen"
 */
function timeAgo(value, now = new Date()) {

    const date = toDate(value);

    if (!date) return "-";

    const minutes = Math.round((now - date) / 60000);

    if (minutes < 1) return "gerade eben";
    if (minutes < 60) return `vor ${minutes} Min.`;

    const hours = Math.round(minutes / 60);

    if (hours < 24) return `vor ${hours} Std.`;

    const days = Math.round(hours / 24);

    return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;

}

module.exports = {
    TIME_ZONE,
    toDate,
    formatDate,
    formatDateTime,
    dateInputValue,
    timeAgo
};
