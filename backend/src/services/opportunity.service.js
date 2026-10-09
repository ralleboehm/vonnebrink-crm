"use strict";

// ----------------------------------------------------
// Vertrieb: Verkaufschancen
// ----------------------------------------------------
//
// findAll / findById / create / update / delete / validate wie in
// ARCHITECTURE.md, dazu:
//
//   moveStage(id, stage)   Phase wechseln (Tafel, Detailseite)
//   completeStep(id)       nächsten Schritt erledigen (+ neuen setzen)
//   addNote(id, text)      Notiz in den Verlauf
//   pipeline(filters)      offene Chancen je Phase + Kennzahlen
//
// Regeln (Phasen, Prüfung, Kennzahlen): utils/salesRules.js
// Gewonnen: Firma mit Status „Interessent“ wird automatisch „Aktiv“.

const mongoose = require("mongoose");

const Opportunity = require("../models/opportunity.model");
const Company = require("../models/company.model");
const Contact = require("../models/contact.model");

const counterService = require("./counter.service");
const { escapeRegex } = require("./search.service");

const rules = require("../utils/salesRules");

const POPULATE = [
    { path: "company", select: "companyName customerNumber status" },
    { path: "contact", select: "firstName lastName email phone mobile" },
    { path: "owner", select: "firstName lastName username" },
    { path: "campaign", select: "campaignNumber name" }
];

function notFoundUnlessValid(id) {

    if (!mongoose.isValidObjectId(id)) throw httpError("Verkaufschance nicht gefunden.", 404);

}

function httpError(message, status) {

    const error = new Error(message);
    error.status = status;

    return error;

}

function objectIdOrNull(value) {

    const id = String(value || "").trim();

    return mongoose.isValidObjectId(id) ? id : null;

}

function historyEntry(type, text, by) {

    return {
        type,
        text: String(text || "").trim().slice(0, 2000),
        at: new Date(),
        by: String(by || "").slice(0, 200)
    };

}

/**
 * Formulardaten in Felder umwandeln (Zahlen im deutschen Format erlaubt)
 */
function fromForm(body = {}) {

    const stage = rules.STAGE_KEYS.includes(body.stage) ? body.stage : "new";
    const source = rules.SOURCES[body.source] ? body.source : null;

    return {
        title: String(body.title || "").trim(),
        company: objectIdOrNull(body.company),
        contact: objectIdOrNull(body.contact),
        // Feld fehlt (z. B. Import) → undefined, dann ist der Ersteller zuständig
        owner: body.owner === undefined ? undefined : objectIdOrNull(body.owner),
        stage,
        probability: rules.parseProbability(body.probability, stage),
        mrr: rules.parseMoney(body.mrr),
        oneTime: rules.parseMoney(body.oneTime),
        expectedCloseDate: rules.parseDate(body.expectedCloseDate),
        source,
        campaign: source === "campaign" ? objectIdOrNull(body.campaign) : null,
        nextStep: {
            text: String(body.nextStepText || "").trim(),
            dueDate: rules.parseDate(body.nextStepDue)
        },
        notes: String(body.notes || "").trim(),
        lostReason: stage === "lost" ? String(body.lostReason || "").trim().slice(0, 300) : ""
    };

}

/**
 * Felder prüfen, dazu: Firma existiert, Kontakt gehört zur Firma.
 * Gibt eine Fehlermeldung oder null zurück.
 */
async function validate(data) {

    const message = rules.validate(data);

    if (message) return message;

    const company = await Company.findOne({ _id: data.company, isDeleted: false }, "_id").lean();

    if (!company) return "Die gewählte Firma existiert nicht.";

    if (data.contact) {

        const contact = await Contact.findOne({ _id: data.contact, isDeleted: false }, "company").lean();

        if (!contact) return "Der gewählte Ansprechpartner existiert nicht.";

        if (String(contact.company) !== String(data.company)) {
            return "Der Ansprechpartner gehört nicht zur gewählten Firma.";
        }

    }

    return null;

}

// ----------------------------------------------------
// Lesen
// ----------------------------------------------------

function buildQuery(filters = {}) {

    const query = { isDeleted: false };

    if (rules.STAGE_KEYS.includes(filters.stage)) {
        query.stage = filters.stage;
    } else if (filters.state === "open") {
        query.stage = { $in: rules.OPEN_STAGES };
    } else if (filters.state === "closed") {
        query.stage = { $in: ["won", "lost"] };
    }

    if (mongoose.isValidObjectId(filters.owner)) query.owner = filters.owner;
    if (filters.owner === "none") query.owner = null;
    if (mongoose.isValidObjectId(filters.company)) query.company = filters.company;

    if (filters.search) {

        const regex = { $regex: escapeRegex(filters.search), $options: "i" };

        query.$or = [{ title: regex }, { opportunityNumber: regex }, { "nextStep.text": regex }];

    }

    return query;

}

/**
 * Liste (ohne Verlauf)
 *
 * @param {{stage?, state?: "open"|"closed", owner?, company?, search?}} filters
 */
async function findAll(filters = {}) {

    const query = buildQuery(filters);

    // Suche auch im Firmennamen
    if (filters.search) {

        const companies = await Company.find(
            { isDeleted: false, companyName: { $regex: escapeRegex(filters.search), $options: "i" } },
            "_id"
        ).lean();

        if (companies.length) query.$or.push({ company: { $in: companies.map((c) => c._id) } });

    }

    return Opportunity.find(query, "-history")
        .populate(POPULATE)
        .sort({ "nextStep.dueDate": 1, updatedAt: -1 })
        .lean();

}

async function findById(id) {

    if (!mongoose.isValidObjectId(id)) return null;

    return Opportunity.findOne({ _id: id, isDeleted: false }).populate(POPULATE);

}

async function findByCompany(companyId) {

    return Opportunity.find({ company: companyId, isDeleted: false }, "-history")
        .populate(POPULATE)
        .sort({ updatedAt: -1 })
        .lean();

}

/**
 * Pipeline: offene Chancen je Phase, Kennzahlen, fällige Schritte
 */
async function pipeline(filters = {}) {

    const open = await findAll({ ...filters, state: "open", stage: undefined });

    const columns = rules.STAGES.filter((s) => s.open).map((stage) => ({
        ...stage,
        items: open.filter((o) => o.stage === stage.key)
    }));

    // Abschlüsse der letzten 90 Tage für die Spalten Gewonnen/Verloren
    const since = new Date(Date.now() - 90 * 86400000);

    const closed = await Opportunity.find(
        { ...buildQuery({ ...filters, state: "closed" }), closedAt: { $gte: since } },
        "-history"
    ).populate(POPULATE).sort({ closedAt: -1 }).lean();

    for (const key of ["won", "lost"]) {
        columns.push({ ...rules.stageOf(key), items: closed.filter((o) => o.stage === key) });
    }

    const due = open
        .map((o) => ({ ...o, stepState: rules.nextStepState(o) }))
        .filter((o) => o.stepState === "overdue" || o.stepState === "today" || o.stepState === "none");

    return {
        columns,
        summary: rules.summarize(open),
        wonMrr90: closed.filter((o) => o.stage === "won").reduce((sum, o) => sum + (o.mrr || 0), 0),
        due
    };

}

// ----------------------------------------------------
// Schreiben
// ----------------------------------------------------

/**
 * Phase setzen: Wahrscheinlichkeit, Abschlussdatum, Firma bei Gewinn aktiv
 */
async function applyStage(opportunity, stage, { by, lostReason } = {}) {

    const before = opportunity.stage;

    opportunity.stage = stage;
    opportunity.probability = rules.defaultProbability(stage);

    if (rules.isOpen(stage)) {

        opportunity.closedAt = null;
        opportunity.lostReason = "";

    } else {

        opportunity.closedAt = new Date();

    }

    if (stage === "lost") opportunity.lostReason = String(lostReason || opportunity.lostReason || "").trim().slice(0, 300);

    // Aus Interessent wird Kunde
    if (stage === "won") {

        const companyId = opportunity.company && (opportunity.company._id || opportunity.company);

        await Company.updateOne({ _id: companyId, status: "prospect" }, { $set: { status: "active" } });

    }

    const text = stage === "lost" && opportunity.lostReason
        ? `${rules.STAGE_LABELS[before] || before} → ${rules.STAGE_LABELS[stage]} (${opportunity.lostReason})`
        : `${rules.STAGE_LABELS[before] || before} → ${rules.STAGE_LABELS[stage]}`;

    opportunity.history.push(historyEntry("stage", text, by));

}

async function create(data, { by, ownerId } = {}) {

    const message = await validate(data);

    if (message) throw httpError(message, 422);

    const opportunity = new Opportunity({
        ...data,
        owner: data.owner !== undefined ? data.owner : (ownerId || null),
        opportunityNumber: await counterService.next("opportunity", "VK"),
        closedAt: rules.isOpen(data.stage) ? null : new Date(),
        createdBy: by || null,
        history: [historyEntry("created", `Angelegt in Phase „${rules.STAGE_LABELS[data.stage]}“`, by)]
    });

    if (opportunity.nextStep.text) {
        opportunity.history.push(historyEntry("step_set", opportunity.nextStep.text, by));
    }

    await opportunity.save();

    if (data.stage === "won") {
        await Company.updateOne({ _id: data.company, status: "prospect" }, { $set: { status: "active" } });
    }

    return opportunity;

}

async function update(id, data, { by } = {}) {

    notFoundUnlessValid(id);

    const opportunity = await Opportunity.findOne({ _id: id, isDeleted: false });

    if (!opportunity) throw httpError("Verkaufschance nicht gefunden.", 404);

    const message = await validate(data);

    if (message) throw httpError(message, 422);

    const stageChanged = opportunity.stage !== data.stage;
    const stepChanged = (opportunity.nextStep.text || "") !== data.nextStep.text;

    const { stage, probability, lostReason, ...fields } = data;

    // Nicht mitgeschickt (z. B. ohne Feld "Zuständig") → unverändert lassen
    if (fields.owner === undefined) delete fields.owner;

    Object.assign(opportunity, fields);

    if (stageChanged) {
        await applyStage(opportunity, stage, { by, lostReason });
    } else if (stage === "lost") {
        opportunity.lostReason = lostReason;
    }

    // Eigene Wahrscheinlichkeit nur bei offenen Phasen, die gleich bleiben
    if (!stageChanged) {
        opportunity.probability = rules.isOpen(stage) ? probability : rules.defaultProbability(stage);
    }

    if (stepChanged && data.nextStep.text) {
        opportunity.history.push(historyEntry("step_set", data.nextStep.text, by));
    }

    opportunity.history.push(historyEntry("updated", "Angaben geändert", by));

    await opportunity.save();

    return opportunity;

}

async function moveStage(id, stage, { by, lostReason } = {}) {

    notFoundUnlessValid(id);

    if (!rules.STAGE_KEYS.includes(stage)) throw httpError("Unbekannte Phase.", 422);

    const opportunity = await Opportunity.findOne({ _id: id, isDeleted: false });

    if (!opportunity) throw httpError("Verkaufschance nicht gefunden.", 404);

    if (opportunity.stage === stage) return opportunity;

    if (stage === "lost" && !String(lostReason || "").trim()) {
        throw httpError("Bitte einen Grund angeben, warum die Chance verloren ist.", 422);
    }

    await applyStage(opportunity, stage, { by, lostReason });

    await opportunity.save();

    return opportunity;

}

/**
 * Nächsten Schritt erledigen und optional gleich den folgenden setzen
 */
async function completeStep(id, { by, nextText, nextDue } = {}) {

    notFoundUnlessValid(id);

    const opportunity = await Opportunity.findOne({ _id: id, isDeleted: false });

    if (!opportunity) throw httpError("Verkaufschance nicht gefunden.", 404);

    const text = String(nextText || "").trim();
    const due = rules.parseDate(nextDue);

    if (due === undefined) throw httpError("Das Datum des nächsten Schritts ist ungültig.", 422);
    if (text.length > rules.LIMITS.nextStep) throw httpError(`Der nächste Schritt darf höchstens ${rules.LIMITS.nextStep} Zeichen lang sein.`, 422);
    if (due && !text) throw httpError("Bitte beschreiben, was der nächste Schritt ist.", 422);

    if (opportunity.nextStep && opportunity.nextStep.text) {
        opportunity.history.push(historyEntry("step_done", opportunity.nextStep.text, by));
    }

    opportunity.nextStep = { text, dueDate: due };

    if (text) opportunity.history.push(historyEntry("step_set", text, by));

    await opportunity.save();

    return opportunity;

}

async function addNote(id, text, { by } = {}) {

    notFoundUnlessValid(id);

    const note = String(text || "").trim();

    if (!note) throw httpError("Bitte eine Notiz eingeben.", 422);
    if (note.length > rules.LIMITS.text) throw httpError(`Die Notiz darf höchstens ${rules.LIMITS.text} Zeichen lang sein.`, 422);

    const result = await Opportunity.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $push: { history: historyEntry("note", note, by) } },
        { returnDocument: "after" }
    );

    if (!result) throw httpError("Verkaufschance nicht gefunden.", 404);

    return result;

}

async function remove(id) {

    if (!mongoose.isValidObjectId(id)) return null;

    return Opportunity.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: { isDeleted: true } },
        { returnDocument: "after" }
    );

}

module.exports = {
    STAGES: rules.STAGES,
    STAGE_LABELS: rules.STAGE_LABELS,
    SOURCES: rules.SOURCES,
    LOST_REASONS: rules.LOST_REASONS,
    fromForm,
    validate,
    findAll,
    findById,
    findByCompany,
    pipeline,
    create,
    update,
    moveStage,
    completeStep,
    addNote,
    delete: remove
};
