const Asset = require("../models/asset.model");
const counterService = require("./counter.service");
const { escapeRegex } = require("./search.service");
const companyService = require("./company.service");
const contactService = require("./contact.service");

// Felder, die im CRM-Formular bearbeitet werden dürfen
const EDITABLE_FIELDS = [
    "company",
    "contact",
    "name",
    "type",
    "status",
    "manufacturer",
    "model",
    "serialNumber",
    "assetTag",
    "cpu",
    "ram",
    "disk",
    "operatingSystem",
    "ipAddress",
    "macAddress",
    "lastUser",
    "purchaseDate",
    "warrantyUntil",
    "notes"
];

// Bei Action1-Assets kommen diese Felder aus Action1 und werden beim
// nächsten Sync ohnehin überschrieben. Im Formular sind sie gesperrt.
const ACTION1_MANAGED_FIELDS = [
    "name",
    "manufacturer",
    "model",
    "serialNumber",
    "cpu",
    "ram",
    "disk",
    "operatingSystem",
    "ipAddress",
    "macAddress",
    "lastUser"
];

function emptyToNull(value) {

    if (value === undefined || value === null) return null;

    const trimmed = String(value).trim();

    return trimmed === "" ? null : trimmed;

}

/**
 * Formulardaten in Asset-Felder umwandeln
 */
function fromForm(body, { isAction1 = false } = {}) {

    const data = {};

    for (const field of EDITABLE_FIELDS) {

        if (isAction1 && ACTION1_MANAGED_FIELDS.includes(field)) continue;

        if (!(field in body)) continue;

        data[field] = emptyToNull(body[field]);

    }

    for (const field of ["purchaseDate", "warrantyUntil"]) {

        if (data[field]) {

            const date = new Date(data[field]);
            data[field] = Number.isNaN(date.getTime()) ? null : date;

        }

    }

    return data;

}

function buildQuery(filters = {}) {

    const query = { isDeleted: false };

    if (filters.company) query.company = filters.company;
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.source) query.source = filters.source;

    if (filters.online === "online") query["action1.online"] = true;
    if (filters.online === "offline") query["action1.online"] = false;

    if (filters.updates === "critical") {
        query["action1.missingCriticalUpdates"] = { $gt: 0 };
    }

    if (filters.search) {

        const regex = { $regex: escapeRegex(filters.search), $options: "i" };

        query.$or = [
            "assetNumber",
            "name",
            "serialNumber",
            "assetTag",
            "manufacturer",
            "model",
            "operatingSystem",
            "ipAddress",
            "macAddress",
            "lastUser"
        ].map((field) => ({ [field]: regex }));

    }

    return query;

}

exports.TYPES = Asset.TYPES;
exports.STATUSES = Asset.STATUSES;
exports.SOURCES = Asset.SOURCES;

exports.EDITABLE_FIELDS = EDITABLE_FIELDS;
exports.ACTION1_MANAGED_FIELDS = ACTION1_MANAGED_FIELDS;
exports.fromForm = fromForm;
exports.buildQuery = buildQuery;

/**
 * Pflichtfelder prüfen und sicherstellen, dass der Ansprechpartner zur
 * gewählten Firma gehört. Gibt eine Fehlermeldung oder null zurück.
 */
exports.validate = async (data, { checkName = true } = {}) => {

    if (!data.company) {
        return "Bitte eine Firma auswählen.";
    }

    if (checkName && !data.name) {
        return "Bitte einen Gerätenamen angeben.";
    }

    const company = await companyService.getById(data.company);

    if (!company) {
        return "Die gewählte Firma existiert nicht.";
    }

    if (!data.contact) return null;

    const contact = await contactService.getById(data.contact);

    if (!contact) {
        return "Der gewählte Ansprechpartner existiert nicht.";
    }

    const contactCompany = contact.company && (contact.company._id || contact.company);

    if (String(contactCompany) !== String(data.company)) {
        return "Der Ansprechpartner gehört nicht zur gewählten Firma.";
    }

    return null;

};

exports.getAll = async (filters = {}) => {

    return await Asset.find(buildQuery(filters))
        .populate("company", "companyName customerNumber")
        .populate("contact", "firstName lastName")
        .sort({ name: 1 });

};

exports.getById = async (id) => {

    return await Asset.findOne({ _id: id, isDeleted: false })
        .populate("company", "companyName customerNumber")
        .populate("contact", "firstName lastName email phone");

};

exports.getByCompany = async (companyId) => {

    return await Asset.find({ company: companyId, isDeleted: false })
        .populate("contact", "firstName lastName")
        .sort({ type: 1, name: 1 });

};

exports.getByContact = async (contactId) => {

    return await Asset.find({ contact: contactId, isDeleted: false })
        .sort({ name: 1 });

};

/**
 * Kennzahlen für eine Firma bzw. für alle Firmen
 */
exports.summary = async (companyId = null) => {

    const match = { isDeleted: false };

    if (companyId) match.company = companyId;

    const assets = await Asset.find(
        match,
        "type status action1.online action1.missingCriticalUpdates action1.rebootRequired warrantyUntil"
    ).lean();

    const now = new Date();
    const active = assets.filter((a) => a.status === "active");

    return {
        total: assets.length,
        active: active.length,
        workstations: active.filter((a) => ["workstation", "laptop"].includes(a.type)).length,
        servers: active.filter((a) => ["server", "virtual_machine"].includes(a.type)).length,
        online: assets.filter((a) => a.action1 && a.action1.online === true).length,
        offline: assets.filter((a) => a.action1 && a.action1.online === false).length,
        criticalUpdates: assets.filter((a) => a.action1 && a.action1.missingCriticalUpdates > 0).length,
        rebootRequired: assets.filter((a) => a.action1 && a.action1.rebootRequired === true).length,
        warrantyExpired: active.filter((a) => a.warrantyUntil && a.warrantyUntil < now).length
    };

};

exports.create = async (data) => {

    const assetNumber = await counterService.next("asset", "AST");

    return await Asset.create({
        ...data,
        assetNumber,
        source: "manual",
        isDeleted: false
    });

};

exports.update = async (id, data) => {

    return await Asset.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: data },
        { returnDocument: "after", runValidators: true }
    );

};

exports.softDelete = async (id) => {

    return await Asset.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { isDeleted: true },
        { returnDocument: "after" }
    );

};

// Einheitliche Namen (findAll, findById, delete) zusätzlich zu den bisherigen
require("../core/service/crudAliases").applyCrudAliases(exports);
