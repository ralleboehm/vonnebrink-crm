"use strict";

// ----------------------------------------------------
// E-Mail-Protokoll: schreiben und lesen
// ----------------------------------------------------
//
// record() wird vom E-Mail-Service nach jedem Versand aufgerufen und wirft
// nie – ein Problem beim Protokollieren darf keine E-Mail verhindern.
// Ohne Datenbankverbindung (z. B. in Tests) wird nichts geschrieben.

const { escapeRegex } = require("./search.service");
const { parsePagination, buildPage } = require("../utils/pagination");

function model() {
    return require("../models/emailLog.model");
}

function isConnected() {

    try {
        return require("mongoose").connection.readyState === 1;
    } catch {
        return false;
    }

}

/**
 * Ergebnis eines Versands festhalten.
 *
 * @param {object} entry { template, to, subject, status, error, attempts, messageId }
 */
async function record(entry) {

    if (!isConnected()) return null;

    try {

        return await model().create({
            template: entry.template || null,
            to: [].concat(entry.to || []).filter((v) => typeof v === "string").map((v) => v.slice(0, 255)),
            subject: String(entry.subject || "").slice(0, 500),
            status: entry.status,
            error: entry.error ? String(entry.error).slice(0, 1000) : null,
            attempts: entry.attempts || 1,
            messageId: entry.messageId || null
        });

    } catch (err) {

        console.error("E-Mail-Protokoll konnte nicht geschrieben werden:", err.message);

        return null;

    }

}

/**
 * Seitenweise Liste mit Filtern
 *
 * @param {{status?: string, search?: string, page?: number}} filters
 */
async function findPage(filters = {}) {

    const EmailLog = model();
    const { page, perPage, skip } = parsePagination(filters, { perPage: 50 });

    const query = {};

    if (EmailLog.STATUSES.includes(filters.status)) {
        query.status = filters.status;
    }

    if (filters.search) {

        const regex = { $regex: escapeRegex(filters.search), $options: "i" };

        query.$or = [{ to: regex }, { subject: regex }, { template: regex }];

    }

    const [items, total] = await Promise.all([
        EmailLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
        EmailLog.countDocuments(query)
    ]);

    return buildPage(items, total, { page, perPage });

}

/**
 * Zahlen der letzten 7 Tage je Status
 */
async function stats(days = 7) {

    const EmailLog = model();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await EmailLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const result = { sent: 0, failed: 0, skipped: 0, days };

    for (const row of rows) {
        result[row._id] = row.count;
    }

    return result;

}

module.exports = {
    record,
    findPage,
    stats
};
