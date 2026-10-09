"use strict";

// ----------------------------------------------------
// Zeitstempel für alle Log-Zeilen
// ----------------------------------------------------
//
//   2026-10-09 12:44:03  GET /crm 200 81.1 ms - 14523
//   2026-10-09 12:44:05  ❌ E-Mail "ticket-created" … fehlgeschlagen
//
// install() versieht console.log/info/warn/error mit Datum und Uhrzeit
// (Zeitzone Europe/Berlin). Wird nur in server.js aufgerufen, damit Tests
// unverändert bleiben. morganStream() liefert den Ausgabekanal für die
// Request-Zeilen von morgan.

const TIME_ZONE = "Europe/Berlin";

// "sv-SE" ergibt das sortierbare Format JJJJ-MM-TT hh:mm:ss
const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
});

function timestamp(date = new Date()) {

    return formatter.format(date);

}

let installed = false;

function install() {

    if (installed) return;

    for (const method of ["log", "info", "warn", "error"]) {

        const original = console[method].bind(console);

        console[method] = (...args) => original(timestamp(), ...args);

    }

    installed = true;

}

/**
 * Ausgabekanal für morgan: jede Request-Zeile mit Zeitstempel
 */
function morganStream(target = process.stdout) {

    return {
        write(line) {
            target.write(`${timestamp()} ${line}`);
        }
    };

}

module.exports = {
    timestamp,
    install,
    morganStream
};
