"use strict";

// ----------------------------------------------------
// Benachrichtigungs-Handler je Ereignis
// ----------------------------------------------------
//
// Die Ereignisnamen kommen aus dem zentralen Event-Bus (core/events).
// Das Benachrichtigungsmodul ist dort EIN Zuhörer unter mehreren
// (später z. B. Activity-Log, Audit, Websocket).
//
// Pro Ereignis gibt es hier genau einen Benachrichtigungs-Handler. Er
// entscheidet, WER benachrichtigt wird und WIE (Glocke, E-Mail, beides).
//
// Handler bekommen alle Werkzeuge über "ctx" übergeben und importieren
// selbst keine Services. Dadurch gibt es keine zirkulären Abhängigkeiten,
// und Handler lassen sich ohne Datenbank und Mailserver testen.
//
// Neues Ereignis hinzufügen:
//   1. Namen in core/events/names.js eintragen (falls noch nicht vorhanden)
//   2. Handler in services/notification/handlers/<bereich>.handlers.js
//      schreiben und dort mit register() anmelden
//   3. Datei in services/notification/handlers/index.js eintragen
//   4. Das Ereignis mit core/events emit(...) auslösen – der
//      notification.service hört automatisch auf alle Ereignisse,
//      für die hier ein Handler angemeldet ist.

const { EVENTS, isKnownEvent } = require("../../core/events/names");

const handlers = new Map();

/**
 * Handler für ein Ereignis anmelden.
 *
 * @param {string} event     z. B. EVENTS.TICKET_CREATED
 * @param {(payload: object, ctx: object) => Promise<object|void>} handler
 */
function register(event, handler) {

    if (!isKnownEvent(event)) {
        throw new Error(`Unbekanntes Benachrichtigungs-Ereignis "${event}". Bitte zuerst in core/events/names.js eintragen.`);
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
