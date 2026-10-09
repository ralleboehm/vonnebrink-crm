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
//   Vertragsende     = Beginn + Laufzeit − 1 Tag   (1.1. + 12 Monate → 31.12.)
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

    return addDays(addMonths(startDate, termMonths), -1);

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

    const deadline = toDate(contract.noticeDeadline);

    if (!deadline) return false;

    const days = (deadline - now) / (24 * 60 * 60 * 1000);

    return days >= 0 && days <= withinDays;

}

module.exports = {
    STATUSES,
    STATUS_KEYS,
    SIGNATURE_STATUSES,
    SIGNATURE_KEYS,
    addMonths,
    endDate,
    noticeDeadline,
    renewalDate,
    deadlines,
    noticeDue
};
