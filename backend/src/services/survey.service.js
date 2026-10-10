"use strict";

// ----------------------------------------------------
// Kundenumfrage (NPS) nach Ticket-Abschluss
// ----------------------------------------------------
//
//   createForTicket(ticket)   Umfrage anlegen (für die Abschluss-Mail)
//   links(survey)             Links 0–10 für die Mail
//   findByToken(token)        Umfrage zum persönlichen Link
//   answer(token, score, …)   Antwort speichern (freiwillig, einmal)
//   findAnswered(filters)     beantwortete Umfragen (Auswertung)
//   stats(filters)            NPS, Verteilung, Verlauf, Rücklauf, je Firma
//
// Damit Kunden nicht genervt werden, bekommt ein Kontakt höchstens alle
// 30 Tage eine Umfrage (FATIGUE_DAYS). Links gelten 60 Tage.
// Eine Bewertung von 0–6 (Kritiker) meldet sich bei den Admins in der Glocke.
// Regeln und Kennzahlen: utils/npsRules.js

const crypto = require("crypto");
const mongoose = require("mongoose");

const Survey = require("../models/survey.model");
const Company = require("../models/company.model");
const User = require("../models/user.model");

const rules = require("../utils/npsRules");
const { toCsv } = require("./export/csvWriter");

const FATIGUE_DAYS = 30;
const VALID_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

const PERIODS = {
    "30": { label: "Letzte 30 Tage", days: 30 },
    "90": { label: "Letzte 90 Tage", days: 90 },
    "365": { label: "Letzte 12 Monate", days: 365 },
    all: { label: "Gesamter Zeitraum", days: null }
};

function httpError(message, status) {

    const error = new Error(message);
    error.status = status;

    return error;

}

function emailService() {
    return require("./email.service");
}

function idOf(value) {

    if (!value) return null;

    return value._id || value;

}

// ----------------------------------------------------
// Anlegen (beim Ticket-Abschluss)
// ----------------------------------------------------

/**
 * Umfrage für ein abgeschlossenes Ticket anlegen.
 * Gibt die Umfrage zurück oder null, wenn keine verschickt werden soll.
 *
 * @param {object} ticket  befülltes Ticket (contact, company)
 */
async function createForTicket(ticket, now = new Date()) {

    const contact = ticket && ticket.contact && typeof ticket.contact === "object" ? ticket.contact : null;

    if (!contact || !contact.email) return null;

    const existing = await Survey.findOne({ ticket: ticket._id });

    if (existing) {

        // Erneut geschlossen: derselbe Link, solange noch nicht beantwortet und gültig
        const valid = now - existing.sentAt < VALID_DAYS * DAY;

        return !existing.answeredAt && valid ? existing : null;

    }

    // Nicht zu oft fragen
    const recent = await Survey.exists({
        contact: contact._id,
        sentAt: { $gte: new Date(now.getTime() - FATIGUE_DAYS * DAY) }
    });

    if (recent) return null;

    try {

        return await Survey.create({
            token: crypto.randomBytes(24).toString("base64url"),
            ticket: ticket._id,
            company: idOf(ticket.company),
            contact: contact._id,
            ticketNumber: ticket.ticketNumber || "",
            email: contact.email,
            sentAt: now
        });

    } catch (err) {

        // Gleichzeitig zweimal geschlossen: die vorhandene nehmen
        if (err && err.code === 11000) return Survey.findOne({ ticket: ticket._id });

        throw err;

    }

}

/**
 * Links für die Mail: Seite + je ein Link pro Wert (0–10)
 */
function links(survey) {

    const base = emailService().portalUrl(`/email/umfrage/${survey.token}`);
    const result = { url: base };

    for (let score = 0; score <= 10; score++) {
        result[`s${score}`] = `${base}?wert=${score}`;
    }

    return result;

}

// ----------------------------------------------------
// Antworten (ohne Anmeldung)
// ----------------------------------------------------

async function findByToken(token, now = new Date()) {

    if (!TOKEN_PATTERN.test(String(token || ""))) return null;

    const survey = await Survey.findOne({ token })
        .populate("company", "companyName")
        .populate("contact", "firstName lastName salutation");

    if (!survey) return null;

    return {
        survey,
        expired: !survey.answeredAt && now - survey.sentAt > VALID_DAYS * DAY,
        answered: Boolean(survey.answeredAt)
    };

}

/**
 * Admins in der Glocke informieren, wenn ein Kunde unzufrieden ist
 */
async function alertDetractor(survey) {

    try {

        const admins = await User.find({ active: true, role: "admin" }, "_id").lean();

        if (!admins.length) return;

        const company = survey.company && survey.company.companyName ? survey.company.companyName : "";
        const comment = survey.comment ? `: „${survey.comment.slice(0, 120)}${survey.comment.length > 120 ? "…" : ""}“` : "";

        await require("./notification.service").notifyUsers(admins.map((a) => a._id), {
            title: `Kritische Bewertung (${survey.score}/10) – ${survey.ticketNumber}`,
            message: `${company || survey.email}${comment}`,
            type: "warning",
            icon: "bi-emoji-frown",
            link: `/crm/surveys?category=detractor`,
            event: "survey.answered"
        });

    } catch (err) {

        console.error("Hinweis zur kritischen Bewertung nicht angelegt:", err.message);

    }

}

/**
 * Antwort speichern. Nur einmal möglich.
 */
async function answer(token, scoreInput, commentInput, now = new Date()) {

    const found = await findByToken(token, now);

    if (!found) throw httpError("Diese Umfrage gibt es nicht.", 404);
    if (found.answered) throw httpError("Diese Umfrage wurde bereits beantwortet.", 409);
    if (found.expired) throw httpError("Diese Umfrage ist abgelaufen.", 410);

    const score = rules.parseScore(scoreInput);

    if (score === null) throw httpError("Bitte einen Wert zwischen 0 und 10 wählen.", 422);

    // Nur speichern, wenn noch offen (doppeltes Absenden)
    const saved = await Survey.findOneAndUpdate(
        { _id: found.survey._id, answeredAt: null },
        { $set: { score, comment: rules.cleanComment(commentInput), answeredAt: now } },
        { returnDocument: "after" }
    ).populate("company", "companyName");

    if (!saved) throw httpError("Diese Umfrage wurde bereits beantwortet.", 409);

    if (rules.category(score) === "detractor") await alertDetractor(saved);

    return saved;

}

// ----------------------------------------------------
// Auswertung
// ----------------------------------------------------

function periodStart(period, now = new Date()) {

    const entry = PERIODS[period] || PERIODS["365"];

    return entry.days ? new Date(now.getTime() - entry.days * DAY) : null;

}

/**
 * Filter aus der Adresszeile bereinigen
 */
function readFilters(query = {}) {

    const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

    return {
        period: Object.hasOwn(PERIODS, String(query.period)) ? query.period : "365",
        company: mongoose.isValidObjectId(query.company) ? String(query.company) : "",
        category: Object.hasOwn(rules.CATEGORIES, String(query.category)) ? query.category : "",
        comments: query.comments === "1" ? "1" : "",
        search: text(query.search, 100)
    };

}

function baseQuery(filters, now = new Date()) {

    const query = {};
    const since = periodStart(filters.period, now);

    if (filters.company) query.company = filters.company;

    return { query, since };

}

/**
 * Beantwortete Umfragen (neueste zuerst)
 */
async function findAnswered(filters = {}, now = new Date()) {

    const { query, since } = baseQuery(filters, now);

    query.answeredAt = since ? { $gte: since } : { $ne: null };

    if (filters.category === "promoter") query.score = { $gte: 9 };
    if (filters.category === "passive") query.score = { $gte: 7, $lte: 8 };
    if (filters.category === "detractor") query.score = { $lte: 6 };

    if (filters.comments) query.comment = { $nin: [null, ""] };

    if (filters.search) {

        const { escapeRegex } = require("./search.service");
        const regex = { $regex: escapeRegex(filters.search), $options: "i" };

        const companies = await Company.find({ companyName: regex }, "_id").lean();

        query.$or = [{ comment: regex }, { ticketNumber: regex }, { email: regex }, { company: { $in: companies.map((c) => c._id) } }];

    }

    return Survey.find(query)
        .populate("company", "companyName")
        .populate("contact", "firstName lastName")
        .populate("ticket", "subject")
        .sort({ answeredAt: -1 })
        .lean();

}

/**
 * Kennzahlen für die Auswertung
 */
async function stats(filters = {}, now = new Date()) {

    const { query, since } = baseQuery(filters, now);

    const sentQuery = { ...query, ...(since ? { sentAt: { $gte: since } } : {}) };
    const answeredQuery = { ...query, answeredAt: since ? { $gte: since } : { $ne: null } };

    const [sent, answered, answeredInSentPeriod, trendAnswers] = await Promise.all([
        Survey.countDocuments(sentQuery),
        Survey.find(answeredQuery, "score answeredAt company").populate("company", "companyName").lean(),
        Survey.countDocuments({ ...sentQuery, answeredAt: { $ne: null } }),
        Survey.find({ ...query, answeredAt: { $gte: new Date(now.getTime() - 366 * DAY) } }, "score answeredAt").lean()
    ]);

    const summary = rules.summarize(answered);

    // Je Firma (mit mindestens einer Antwort), meiste Antworten zuerst
    const byCompanyMap = new Map();

    for (const entry of answered) {

        const key = entry.company ? String(entry.company._id) : "-";

        if (!byCompanyMap.has(key)) {
            byCompanyMap.set(key, { company: entry.company, answers: [] });
        }

        byCompanyMap.get(key).answers.push(entry);

    }

    const byCompany = [...byCompanyMap.values()]
        .map((group) => ({ company: group.company, ...rules.summarize(group.answers) }))
        .sort((a, b) => b.count - a.count || (a.nps || 0) - (b.nps || 0));

    return {
        summary,
        sent,
        responseRate: sent ? Math.round((answeredInSentPeriod / sent) * 100) : null,
        trend: rules.monthlyTrend(trendAnswers, 12, now),
        byCompany
    };

}

function toExportCsv(surveys) {

    return toCsv(
        ["Beantwortet", "Wert", "Gruppe", "Kommentar", "Firma", "Kontakt", "E-Mail", "Ticket", "Betreff", "Verschickt"],
        surveys.map((s) => [
            s.answeredAt ? new Date(s.answeredAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "",
            s.score,
            rules.CATEGORIES[rules.category(s.score)] ? rules.CATEGORIES[rules.category(s.score)].label : "",
            s.comment || "",
            s.company ? s.company.companyName : "",
            s.contact ? `${s.contact.firstName || ""} ${s.contact.lastName || ""}`.trim() : "",
            s.email || "",
            s.ticketNumber || "",
            s.ticket ? s.ticket.subject : "",
            s.sentAt ? new Date(s.sentAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : ""
        ])
    );

}

module.exports = {
    FATIGUE_DAYS,
    VALID_DAYS,
    PERIODS,
    CATEGORIES: rules.CATEGORIES,
    createForTicket,
    links,
    findByToken,
    answer,
    readFilters,
    findAnswered,
    stats,
    toExportCsv
};
