"use strict";

// ----------------------------------------------------
// Verträge: Status, Unterschrift, Fristen (ohne Datenbank)
// ----------------------------------------------------
//
// Vorbereitung für die Vertragsverwaltung. Noch ohne Oberfläche – Model
// (models/contract.model.js), Regeln und Dokumentablage stehen bereit.
// Vertragsdokumente landen immer im Kundenordner unter Contracts/.
//
// Fristen:
//   Vertragsende     = Beginn + Laufzeit − 1 Tag   (1.1. + 12 Monate → 31.12.;
//                      31.1. + 1 Monat → 28.2. wie § 188 BGB)
//   Kündigung bis    = Vertragsende − Kündigungsfrist
//   Verlängerung am  = Vertragsende + 1 Tag (bei automatischer Verlängerung)

const STATUSES = {
    draft: { label: "Entwurf", badge: "bg-secondary" },
    sent: { label: "Versendet", badge: "bg-info text-dark" },
    read: { label: "Gelesen", badge: "bg-info text-dark" },
    signed: { label: "Signiert", badge: "bg-primary" },
    active: { label: "Aktiv", badge: "bg-success" },
    expired: { label: "Abgelaufen", badge: "bg-dark" },
    terminated: { label: "Gekündigt", badge: "bg-danger" }
};

const SIGNATURE_STATUSES = {
    unsigned: { label: "Nicht unterschrieben" },
    requested: { label: "Unterschrift angefordert" },
    customer: { label: "Vom Kunden unterschrieben" },
    complete: { label: "Von beiden unterschrieben" }
};

const STATUS_KEYS = Object.keys(STATUSES);

// Erlaubte Statuswechsel per Knopf (im Formular ist jeder Status wählbar)
const TRANSITIONS = {
    draft: ["sent"],
    sent: ["read", "signed"],
    read: ["signed"],
    signed: ["active"],
    active: ["terminated", "expired"],
    expired: ["active"],
    terminated: []
};

function canTransition(from, to) {

    return (TRANSITIONS[from] || []).includes(to);

}
const SIGNATURE_KEYS = Object.keys(SIGNATURE_STATUSES);

function toDate(value) {

    if (value === null || value === undefined || value === "") return null;

    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;

}

/**
 * Monate addieren, ohne über das Monatsende zu springen (31.1. + 1 Monat → 28./29.2.)
 */
function addMonths(value, months) {

    const date = toDate(value);

    if (!date || !Number.isInteger(months)) return null;

    const day = date.getUTCDate();
    const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes()));
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();

    result.setUTCDate(Math.min(day, lastDay));

    return result;

}

function addDays(value, days) {

    const date = toDate(value);

    if (!date) return null;

    date.setUTCDate(date.getUTCDate() + days);

    return date;

}

/**
 * Vertragsende aus Beginn und Laufzeit (Monate)
 */
function endDate(startDate, termMonths) {

    if (!Number.isInteger(termMonths) || termMonths <= 0) return null;

    const start = toDate(startDate);
    const target = addMonths(start, termMonths);

    if (!target) return null;

    // Wie § 188 BGB: Gibt es den Tag im Zielmonat nicht (31.1. + 1 Monat),
    // endet die Frist am letzten Tag dieses Monats (28./29.2.), sonst am Vortag.
    return start.getUTCDate() > target.getUTCDate() ? target : addDays(target, -1);

}

/**
 * Letzter Tag, an dem gekündigt werden kann
 */
function noticeDeadline(contractEnd, noticePeriodMonths) {

    if (!Number.isInteger(noticePeriodMonths) || noticePeriodMonths < 0) return null;

    return addMonths(contractEnd, -noticePeriodMonths);

}

/**
 * Tag der automatischen Verlängerung (null ohne Verlängerung)
 */
function renewalDate(contractEnd, renewalMonths) {

    if (!Number.isInteger(renewalMonths) || renewalMonths <= 0) return null;

    return addDays(contractEnd, 1);

}

/**
 * Alle Fristen eines Vertrags auf einmal
 */
function deadlines({ startDate, termMonths, noticePeriodMonths, renewalMonths } = {}) {

    const end = endDate(startDate, termMonths);

    return {
        endDate: end,
        noticeDeadline: end ? noticeDeadline(end, noticePeriodMonths) : null,
        renewalDate: end ? renewalDate(end, renewalMonths) : null
    };

}

/**
 * Ist die Kündigungsfrist bald erreicht? (für spätere Erinnerungen)
 */
function noticeDue(contract, now = new Date(), withinDays = 30) {

    if (!contract || !["active", "signed"].includes(contract.status)) return false;

    // Bei Verlängerung zählt die Frist der laufenden Periode
    const deadline = contract.endDate ? currentPeriod(contract, now).noticeDeadline : toDate(contract.noticeDeadline);

    if (!deadline) return false;

    const days = (deadline - now) / (24 * 60 * 60 * 1000);

    return days >= 0 && days <= withinDays;

}

/**
 * Aktuelle Laufzeit – bei automatischer Verlängerung wird das Ende so oft
 * um die Verlängerung weitergeschoben, bis es in der Zukunft liegt.
 *
 * @returns {{endDate, noticeDeadline, renewalDate, renewals: number, expired: boolean}}
 */
function currentPeriod(contract = {}, now = new Date()) {

    let end = toDate(contract.endDate);
    const notice = Number.isInteger(contract.noticePeriodMonths) ? contract.noticePeriodMonths : null;
    const renewal = Number.isInteger(contract.renewalMonths) && contract.renewalMonths > 0 ? contract.renewalMonths : null;
    const running = !["terminated", "expired", "draft"].includes(contract.status);

    if (!end) return { endDate: null, noticeDeadline: null, renewalDate: null, renewals: 0, expired: false };

    let renewals = 0;

    // Verlängern, solange das Ende vorbei ist (nicht bei gekündigten Verträgen)
    while (running && renewal && end < now && renewals < 600) {
        end = endDate(addDays(end, 1), renewal);
        renewals++;
    }

    return {
        endDate: end,
        noticeDeadline: notice === null ? null : noticeDeadline(end, notice),
        renewalDate: renewal ? addDays(end, 1) : null,
        renewals,
        // „abgelaufen“ nur bei laufenden Verträgen (nicht bei Entwürfen oder Gekündigten)
        expired: end < now && ["signed", "active"].includes(contract.status)
    };

}

/**
 * Zahl aus dem Formular: "" → null, sonst ganze Zahl ≥ 0 (NaN bei Unsinn)
 */
function parseMonths(value) {

    if (value === undefined || value === null || String(value).trim() === "") return null;

    const text = String(value).trim();

    return /^\d{1,3}$/.test(text) ? Number(text) : NaN;

}

function parseDate(value) {

    if (!value) return null;

    const text = String(value).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;

    const date = new Date(`${text}T00:00:00Z`);

    return Number.isNaN(date.getTime()) ? undefined : date;

}

/**
 * Eingaben prüfen – deutsche Meldung oder null
 */
function validate(data = {}) {

    if (!data.title || !String(data.title).trim()) return "Bitte einen Titel angeben.";
    if (String(data.title).length > 200) return "Der Titel ist zu lang (höchstens 200 Zeichen).";
    if (!data.company) return "Bitte eine Firma wählen.";
    if (!STATUS_KEYS.includes(data.status)) return "Unbekannter Status.";
    if (!SIGNATURE_KEYS.includes(data.signatureStatus)) return "Unbekannter Unterschriftsstatus.";
    if (data.startDate === undefined) return "Vertragsbeginn ist ungültig.";

    for (const [key, label] of [["termMonths", "Laufzeit"], ["noticePeriodMonths", "Kündigungsfrist"], ["renewalMonths", "Verlängerung"]]) {
        if (Number.isNaN(data[key])) return `${label}: bitte ganze Monate angeben (z. B. 12).`;
        if (data[key] !== null && data[key] > 240) return `${label}: höchstens 240 Monate.`;
    }

    if (data.termMonths === 0) return "Laufzeit: mindestens 1 Monat (leer lassen = unbefristet).";
    if (data.termMonths && !data.startDate) return "Für eine Laufzeit bitte den Vertragsbeginn angeben.";
    if (data.noticePeriodMonths && data.termMonths && data.noticePeriodMonths >= data.termMonths) {
        return "Die Kündigungsfrist muss kürzer als die Laufzeit sein.";
    }

    if (!Number.isInteger(data.version) || data.version < 1 || data.version > 999) return "Version: bitte eine Zahl ab 1.";

    return null;

}

module.exports = {
    STATUSES,
    STATUS_KEYS,
    TRANSITIONS,
    canTransition,
    SIGNATURE_STATUSES,
    SIGNATURE_KEYS,
    addMonths,
    endDate,
    noticeDeadline,
    renewalDate,
    deadlines,
    noticeDue,
    currentPeriod,
    parseMonths,
    parseDate,
    validate
};
