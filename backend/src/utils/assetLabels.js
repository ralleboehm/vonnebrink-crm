"use strict";

// Deutsche Bezeichnungen und kleine Formatierhilfen für die Asset-Ansichten.
// Die Datumsfunktionen liegen in utils/format.js und werden hier nur
// weitergereicht, damit bestehende Views (labels.formatDate …) gleich bleiben.

const { formatDate, formatDateTime, dateInputValue, timeAgo } = require("./format");

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
