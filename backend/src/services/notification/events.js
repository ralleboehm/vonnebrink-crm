"use strict";

// ----------------------------------------------------
// Ereignis-Register für Benachrichtigungen
// ----------------------------------------------------
//
// Jedes Ereignis im CRM (z. B. "ticket.created") hat genau einen
// Handler. Der Handler entscheidet, WER benachrichtigt wird und WIE
// (interne Benachrichtigung, E-Mail, beides).
//
// Handler bekommen alle Werkzeuge über "ctx" übergeben und importieren
// selbst keine Services. Dadurch gibt es keine zirkulären Abhängigkeiten,
// und Handler lassen sich ohne Datenbank und Mailserver testen.
//
// Neues Ereignis hinzufügen:
//   1. Namen unten in EVENTS eintragen (falls noch nicht vorhanden)
//   2. Handler in services/notification/handlers/<bereich>.handlers.js
//      schreiben und dort mit register() anmelden
//   3. Datei in services/notification/handlers/index.js eintragen
//   4. Im Service an passender Stelle notificationService.dispatch(...)
//      bzw. eine eigene Kurzmethode (wie ticketCreated) aufrufen

const EVENTS = Object.freeze({

    // Tickets
    TICKET_CREATED: "ticket.created",
    TICKET_ASSIGNED: "ticket.assigned",
    TICKET_CLOSED: "ticket.closed",

    // Kundenportal & Benutzer
    PORTAL_WELCOME: "portal.welcome",
    PASSWORD_RESET: "password.reset",

    // Vorbereitet, noch ohne Handler
    CUSTOMER_CREATED: "customer.created",
    LEAD_CREATED: "lead.created",
    QUOTE_CREATED: "quote.created",
    INVOICE_CREATED: "invoice.created",
    ASSET_OFFLINE: "asset.offline",
    ACTION1_ALERT: "action1.alert",
    NEXTCLOUD_DOCUMENT_UPLOADED: "nextcloud.documentUploaded"

});

const KNOWN_EVENTS = new Set(Object.values(EVENTS));

const handlers = new Map();

/**
 * Handler für ein Ereignis anmelden.
 *
 * @param {string} event     z. B. EVENTS.TICKET_CREATED
 * @param {(payload: object, ctx: object) => Promise<object|void>} handler
 */
function register(event, handler) {

    if (!KNOWN_EVENTS.has(event)) {
        throw new Error(`Unbekanntes Benachrichtigungs-Ereignis "${event}". Bitte zuerst in EVENTS eintragen.`);
    }

    if (typeof handler !== "function") {
        throw new Error(`Handler für "${event}" muss eine Funktion sein.`);
    }

    if (handlers.has(event)) {
        throw new Error(`Für "${event}" ist bereits ein Handler angemeldet.`);
    }

    handlers.set(event, handler);

}

function getHandler(event) {

    return handlers.get(event) || null;

}

function hasHandler(event) {

    return handlers.has(event);

}

/**
 * Übersicht: welche Ereignisse gibt es, welche sind schon umgesetzt
 */
function list() {

    return Object.values(EVENTS).map((event) => ({
        event,
        implemented: handlers.has(event)
    }));

}

/**
 * Nur für Tests: Register leeren
 */
function _reset() {

    handlers.clear();

}

module.exports = {
    EVENTS,
    register,
    getHandler,
    hasHandler,
    list,
    _reset
};
