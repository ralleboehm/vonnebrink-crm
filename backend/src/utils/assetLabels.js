"use strict";

// Deutsche Bezeichnungen und kleine Formatierhilfen für die Asset-Ansichten.

const TYPE_LABELS = {
    workstation: "Arbeitsplatz-PC",
    laptop: "Notebook",
    server: "Server",
    virtual_machine: "Virtuelle Maschine",
    network: "Netzwerkgerät",
    printer: "Drucker",
    mobile: "Mobilgerät",
    other: "Sonstiges"
};

const TYPE_ICONS = {
    workstation: "bi-pc-display",
    laptop: "bi-laptop",
    server: "bi-hdd-rack",
    virtual_machine: "bi-boxes",
    network: "bi-router",
    printer: "bi-printer",
    mobile: "bi-phone",
    other: "bi-box"
};

const STATUS_LABELS = {
    active: "In Betrieb",
    in_stock: "Lager",
    repair: "Reparatur",
    retired: "Ausgemustert"
};

const STATUS_BADGES = {
    active: "bg-success",
    in_stock: "bg-info text-dark",
    repair: "bg-warning text-dark",
    retired: "bg-secondary"
};

function formatDate(value) {

    if (!value) return "-";

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("de-DE");

}

function formatDateTime(value) {

    if (!value) return "-";

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
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

    if (!value) return "";

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);

}

/**
 * "vor 5 Min." / "vor 3 Std." / "vor 2 Tagen"
 */
function timeAgo(value, now = new Date()) {

    if (!value) return "-";

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    const minutes = Math.round((now - date) / 60000);

    if (minutes < 1) return "gerade eben";
    if (minutes < 60) return `vor ${minutes} Min.`;

    const hours = Math.round(minutes / 60);

    if (hours < 24) return `vor ${hours} Std.`;

    const days = Math.round(hours / 24);

    return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;

}

/**
 * Garantie: "expired", "soon" (innerhalb 60 Tagen) oder "ok"
 */
function warrantyState(value, now = new Date()) {

    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return null;

    if (date < now) return "expired";

    if (date - now < 60 * 24 * 60 * 60 * 1000) return "soon";

    return "ok";

}

module.exports = {
    TYPE_LABELS,
    TYPE_ICONS,
    STATUS_LABELS,
    STATUS_BADGES,
    formatDate,
    formatDateTime,
    dateInputValue,
    timeAgo,
    warrantyState
};
