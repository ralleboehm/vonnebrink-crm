"use strict";

// ----------------------------------------------------
// Event-Bus
// ----------------------------------------------------
//
// Ein Ereignis (z. B. "ticket.created") kann beliebig viele Zuhörer haben:
//
//   notifications   Glocke & E-Mails           (vorhanden)
//   activity        Aktivitätsprotokoll         (vorbereitet)
//   audit           Revisionsprotokoll          (vorbereitet)
//   websocket       Live-Aktualisierung         (vorbereitet)
//
//   const events = require("../core/events");
//
//   events.on(events.EVENTS.TICKET_CREATED, async (payload) => { … }, { name: "audit" });
//   await events.emit(events.EVENTS.TICKET_CREATED, { ticket });
//
// Regeln:
//   - emit() wirft NIE. Jeder Zuhörer läuft für sich; ein Fehler wird
//     protokolliert und stoppt weder die anderen Zuhörer noch die Aktion,
//     die das Ereignis ausgelöst hat.
//   - Zuhörer laufen nacheinander in der Reihenfolge der Anmeldung.
//   - Nur Namen aus names.js sind erlaubt.
//   - DEBUG_EVENTS=1 in der .env schreibt jedes Ereignis ins Log.

const { EVENTS, isKnownEvent } = require("./names");

const listeners = new Map();

function assertKnown(event) {

    if (!isKnownEvent(event)) {
        throw new Error(`Unbekanntes Ereignis "${event}". Bitte zuerst in core/events/names.js eintragen.`);
    }

}

/**
 * Zuhörer anmelden.
 *
 * @param {string} event
 * @param {(payload: object, meta: {event: string}) => Promise<any>|any} listener
 * @param {{name?: string}} [options]  Name für Log und Ergebnis (z. B. "notifications")
 * @returns {() => void} Funktion zum Abmelden
 */
function on(event, listener, options = {}) {

    assertKnown(event);

    if (typeof listener !== "function") {
        throw new Error(`Zuhörer für "${event}" muss eine Funktion sein.`);
    }

    const entry = { name: options.name || listener.name || "anonym", listener };

    if (!listeners.has(event)) listeners.set(event, []);

    listeners.get(event).push(entry);

    return () => off(event, listener);

}

function off(event, listener) {

    const list = listeners.get(event);

    if (!list) return;

    listeners.set(event, list.filter((entry) => entry.listener !== listener));

}

/**
 * Ereignis auslösen.
 *
 * @returns {Promise<Array<{listener: string, ok: boolean, result?: any, error?: string}>>}
 */
async function emit(event, payload = {}) {

    assertKnown(event);

    const list = listeners.get(event) || [];

    if (process.env.DEBUG_EVENTS === "1") {
        console.log(`📣 ${event} → ${list.map((e) => e.name).join(", ") || "keine Zuhörer"}`);
    }

    const results = [];

    for (const entry of list) {

        try {

            const result = await entry.listener(payload, { event });

            results.push({ listener: entry.name, ok: true, result });

        } catch (err) {

            console.error(`❌ Zuhörer "${entry.name}" für "${event}" fehlgeschlagen:`, err.message);

            results.push({ listener: entry.name, ok: false, error: err.message });

        }

    }

    return results;

}

function listenerCount(event) {

    return (listeners.get(event) || []).length;

}

/**
 * Übersicht: Ereignisse und ihre Zuhörer
 */
function describe() {

    return Object.values(EVENTS).map((event) => ({
        event,
        listeners: (listeners.get(event) || []).map((entry) => entry.name)
    }));

}

/**
 * Nur für Tests
 */
function _reset() {

    listeners.clear();

}

module.exports = {
    EVENTS,
    isKnownEvent,
    on,
    off,
    emit,
    listenerCount,
    describe,
    _reset
};
