"use strict";

// ----------------------------------------------------
// Verträge
// ----------------------------------------------------
//
//   fromForm(body)            Formular → Felder
//   findAll(filters)          Liste (Status, Firma, Suche, „Frist bald“)
//   findById / findByCompany
//   create / update / setStatus / remove (Papierkorb: isDeleted)
//   summary()                 Zahlen für die Übersicht
//
// Fristen (Ende, Kündigung bis, Verlängerung) rechnet utils/contractRules.js
// beim Speichern aus. Vertragsdokumente: document.service (Bezug "contract",
// Ablage in Nextcloud unter Contracts/).

const mongoose = require("mongoose");

const Contract = require("../models/contract.model");
const Company = require("../models/company.model");
const Contact = require("../models/contact.model");

const counterService = require("./counter.service");
const { escapeRegex } = require("./search.service");

const rules = require("../utils/contractRules");

const POPULATE = [
    { path: "company", select: "companyName customerNumber status" },
    { path: "contact", select: "firstName lastName email phone" }
];

// „Kündigungsfrist bald“: so viele Tage im Voraus
const NOTICE_WARNING_DAYS = 60;

function httpError(message, status) {

    const error = new Error(message);
    error.status = status;

    return error;

}

function objectIdOrNull(value) {

    const id = String(value || "").trim();

    return mongoose.isValidObjectId(id) ? id : null;

}

/**
 * Formulardaten → Vertragsfelder
 */
function fromForm(body = {}) {

    const version = String(body.version || "").trim();

    return {
        title: String(body.title || "").trim(),
        company: objectIdOrNull(body.company),
        contact: objectIdOrNull(body.contact),
        status: rules.STATUS_KEYS.includes(body.status) ? body.status : "draft",
        signatureStatus: rules.SIGNATURE_KEYS.includes(body.signatureStatus) ? body.signatureStatus : "unsigned",
        startDate: rules.parseDate(body.startDate),
        termMonths: rules.parseMonths(body.termMonths),
        noticePeriodMonths: rules.parseMonths(body.noticePeriodMonths),
        renewalMonths: rules.parseMonths(body.renewalMonths),
        version: /^\d{1,3}$/.test(version) ? Number(version) : (version ? NaN : 1),
        notes: String(body.notes || "").trim().slice(0, 5000)
    };

}

/**
 * Prüfen inkl. Datenbank (Firma vorhanden, Kontakt gehört zur Firma)
 */
async function validate(data) {

    const message = rules.validate(data);

    if (message) throw httpError(message, 422);

    const company = await Company.exists({ _id: data.company, isDeleted: false });

    if (!company) throw httpError("Die gewählte Firma gibt es nicht.", 422);

    if (data.contact) {

        const contact = await Contact.findOne({ _id: data.contact }, "company").lean();

        if (!contact || String(contact.company) !== String(data.company)) {
            throw httpError("Der Ansprechpartner gehört nicht zu dieser Firma.", 422);
        }

    }

}

/**
 * Fristen aus Beginn, Laufzeit, Kündigungsfrist und Verlängerung
 */
function withDeadlines(data) {

    const deadlines = rules.deadlines(data);

    return { ...data, ...deadlines };

}

// ----------------------------------------------------
// Lesen
// ----------------------------------------------------

function buildQuery(filters = {}) {

    const query = { isDeleted: false };

    if (rules.STATUS_KEYS.includes(filters.status)) query.status = filters.status;
    if (mongoose.isValidObjectId(filters.company)) query.company = filters.company;

    if (filters.search) {

        const regex = { $regex: escapeRegex(filters.search), $options: "i" };

        query.$or = [{ title: regex }, { contractNumber: regex }, { notes: regex }];

    }

    return query;

}

/**
 * Laufende Periode an jeden Vertrag hängen (für Liste und Detailseite)
 */
function decorate(contract, now = new Date()) {

    if (!contract) return contract;

    const period = rules.currentPeriod(contract, now);

    contract.period = period;
    contract.noticeDue = rules.noticeDue(contract, now, NOTICE_WARNING_DAYS);

    return contract;

}

async function findAll(filters = {}, now = new Date()) {

    const query = buildQuery(filters);

    // Firmensuche
    if (filters.search) {

        const companies = await Company.find({ companyName: { $regex: escapeRegex(filters.search), $options: "i" } }, "_id").lean();

        query.$or.push({ company: { $in: companies.map((c) => c._id) } });

    }

    const contracts = (await Contract.find(query).populate(POPULATE).sort({ createdAt: -1 }).lean()).map((c) => decorate(c, now));

    if (filters.due === "notice") return contracts.filter((c) => c.noticeDue);

    return contracts;

}

async function findById(id, now = new Date()) {

    if (!mongoose.isValidObjectId(id)) return null;

    const contract = await Contract.findOne({ _id: id, isDeleted: false }).populate(POPULATE).lean();

    return decorate(contract, now);

}

async function findByCompany(companyId, now = new Date()) {

    if (!mongoose.isValidObjectId(companyId)) return [];

    return (await Contract.find({ company: companyId, isDeleted: false }).sort({ createdAt: -1 }).lean()).map((c) => decorate(c, now));

}

/**
 * Zahlen für die Übersicht
 */
async function summary(now = new Date()) {

    const contracts = await Contract.find({ isDeleted: false }, "status endDate noticePeriodMonths renewalMonths noticeDeadline").lean();
    const byStatus = Object.fromEntries(rules.STATUS_KEYS.map((key) => [key, 0]));

    let noticeDue = 0;

    for (const contract of contracts) {
        byStatus[contract.status] = (byStatus[contract.status] || 0) + 1;
        if (rules.noticeDue(contract, now, NOTICE_WARNING_DAYS)) noticeDue++;
    }

    return { total: contracts.length, byStatus, noticeDue, warningDays: NOTICE_WARNING_DAYS };

}

// ----------------------------------------------------
// Schreiben
// ----------------------------------------------------

async function create(data) {

    await validate(data);

    const contract = await Contract.create({
        ...withDeadlines(data),
        contractNumber: await counterService.next("contract", "VTR")
    });

    return contract;

}

async function update(id, data) {

    if (!mongoose.isValidObjectId(id)) throw httpError("Vertrag nicht gefunden.", 404);

    const contract = await Contract.findOne({ _id: id, isDeleted: false });

    if (!contract) throw httpError("Vertrag nicht gefunden.", 404);

    await validate(data);

    contract.set(withDeadlines(data));
    await contract.save();

    return contract;

}

/**
 * Nur den Status ändern (Knöpfe auf der Detailseite)
 */
async function setStatus(id, status) {

    if (!rules.STATUS_KEYS.includes(status)) throw httpError("Unbekannter Status.", 422);

    const contract = mongoose.isValidObjectId(id) ? await Contract.findOne({ _id: id, isDeleted: false }) : null;

    if (!contract) throw httpError("Vertrag nicht gefunden.", 404);

    if (!rules.canTransition(contract.status, status)) {
        throw httpError(`Von „${rules.STATUSES[contract.status].label}“ geht es nicht direkt zu „${rules.STATUSES[status].label}“ – bitte im Formular ändern.`, 422);
    }

    contract.status = status;

    // Signiert → mindestens vom Kunden unterschrieben
    if (status === "signed" && contract.signatureStatus === "unsigned") contract.signatureStatus = "customer";

    await contract.save();

    return contract;

}

async function remove(id) {

    if (!mongoose.isValidObjectId(id)) throw httpError("Vertrag nicht gefunden.", 404);

    const contract = await Contract.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: { isDeleted: true } }, { returnDocument: "after" });

    if (!contract) throw httpError("Vertrag nicht gefunden.", 404);

    return contract;

}

module.exports = {
    NOTICE_WARNING_DAYS,
    fromForm,
    findAll,
    findById,
    findByCompany,
    summary,
    create,
    update,
    setStatus,
    remove
};
