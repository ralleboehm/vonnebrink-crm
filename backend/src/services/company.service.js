const Company = require("../models/company.model");
const counterService = require("./counter.service");

const { normalizeTags } = require("../utils/tags");
const { escapeRegex } = require("./search.service");

const ADDRESS_FIELDS = ["street", "houseNumber", "postalCode", "city", "country"];

/**
 * Formulardaten -> Firmenfelder.
 *
 * Die Formulare schicken die Adresse als einzelne Felder (street, city …);
 * address[...] als Objekt wird ebenfalls verstanden. Nur Felder, die im
 * Formular vorkommen, werden übernommen – fehlende bleiben unverändert.
 */
exports.fromForm = (body = {}) => {

    const data = {};

    for (const key of ["companyName", "status", "phone", "email", "website"]) {
        if (key in body) data[key] = body[key];
    }

    const source = body.address && typeof body.address === "object" ? body.address : body;
    const address = {};

    for (const key of ADDRESS_FIELDS) {
        if (key in source) address[key] = source[key];
    }

    if (Object.keys(address).length) data.address = address;

    if ("tags" in body) data.tags = normalizeTags(body.tags);

    return data;

};

// Alle aktiven Firmen (optional nach Schlagwort gefiltert)
exports.getAll = async (filters = {}) => {

    const query = {

        isDeleted: false

    };

    if (filters.tag) {

        // Groß-/Kleinschreibung egal, ganzes Schlagwort
        query.tags = { $regex: `^${escapeRegex(filters.tag)}$`, $options: "i" };

    }

    return await Company.find(query).sort({

        companyName: 1

    });

};

// Firma anhand der ID
exports.getById = async (id) => {

    return await Company.findOne({

        _id: id,
        isDeleted: false

    });

};

// Neue Firma anlegen
exports.create = async (companyData) => {

    const customerNumber = await counterService.next("company", "CUS");

    return await Company.create({

        customerNumber,

        companyName: companyData.companyName,

        status: companyData.status || "prospect",

        phone: companyData.phone,

        email: companyData.email,

        website: companyData.website,

        address: companyData.address || {},

        tags: normalizeTags(companyData.tags),

        isDeleted: false

    });

};

// Firma aktualisieren (nur übergebene Felder; Adressteile einzeln)
exports.update = async (id, companyData) => {

    const set = {};

    for (const key of ["companyName", "status", "phone", "email", "website"]) {
        if (companyData[key] !== undefined) set[key] = companyData[key];
    }

    if (companyData.address) {
        for (const key of ADDRESS_FIELDS) {
            if (companyData.address[key] !== undefined) set[`address.${key}`] = companyData.address[key];
        }
    }

    if (companyData.tags !== undefined) {
        set.tags = normalizeTags(companyData.tags);
    }

    return await Company.findOneAndUpdate(

        {

            _id: id,
            isDeleted: false

        },

        {
            $set: set
        },

        {

            returnDocument: "after",

            runValidators: true

        }

    );

};

/**
 * Alle verwendeten Schlagwörter mit Anzahl Firmen (für Filter & Vorschläge)
 */
exports.getTagStats = async () => {

    const rows = await Company.aggregate([
        { $match: { isDeleted: false } },
        { $unwind: "$tags" },
        { $group: { _id: { $toLower: "$tags" }, tag: { $first: "$tags" }, count: { $sum: 1 } } },
        { $sort: { count: -1, tag: 1 } }
    ]);

    return rows.map((row) => ({ tag: row.tag, count: row.count }));

};

// Soft Delete
exports.softDelete = async (id) => {

    return await Company.findOneAndUpdate(

        {

            _id: id,
            isDeleted: false

        },

        {

            isDeleted: true

        },

        {

            returnDocument: "after"

        }

    );

};

// ----------------------------------------------------
// Action1-Verknüpfung
// ----------------------------------------------------

// Firmen mit Action1-Organisation
exports.getAction1Mapped = async () => {

    return await Company.find({

        isDeleted: false,
        "action1.organizationId": { $type: "string", $ne: "" }

    }).sort({

        companyName: 1

    });

};

/**
 * Speichert die Zuordnung Action1-Organisation -> Firma.
 *
 * @param {Array<{organizationId: string, organizationName: string, companyId: string|null}>} entries
 */
exports.saveAction1Mapping = async (entries) => {

    const empty = { organizationId: null, organizationName: null };

    // Erst alle betroffenen Organisationen lösen ...
    await Company.updateMany(

        { "action1.organizationId": { $in: entries.map((e) => e.organizationId) } },

        { $set: { action1: empty } }

    );

    // ... dann neu zuordnen
    for (const entry of entries) {

        if (!entry.companyId) continue;

        await Company.updateOne(

            { _id: entry.companyId, isDeleted: false },

            {
                $set: {
                    action1: {
                        organizationId: entry.organizationId,
                        organizationName: entry.organizationName || null
                    }
                }
            }

        );

    }

};

// ----------------------------------------------------
// Gruppen (Schlagwörter) verwalten
// ----------------------------------------------------

function tagMatcher(tag) {

    return { $regex: `^${escapeRegex(String(tag).trim())}$`, $options: "i" };

}

/**
 * Gruppe bei allen Firmen umbenennen. Gibt es den neuen Namen bei einer
 * Firma schon, werden beide zusammengeführt (keine Dubletten).
 *
 * @returns {Promise<number>} Anzahl geänderter Firmen
 */
exports.renameTag = async (from, to) => {

    const [target] = normalizeTags(to);

    if (!from || !target) {
        throw new Error("Bitte alten und neuen Gruppennamen angeben.");
    }

    const companies = await Company.find(
        { isDeleted: false, tags: tagMatcher(from) },
        "tags"
    ).lean();

    const fromKey = String(from).trim().toLowerCase();

    const operations = companies.map((company) => ({
        updateOne: {
            filter: { _id: company._id },
            update: {
                $set: {
                    tags: normalizeTags(company.tags.map((tag) => (tag.toLowerCase() === fromKey ? target : tag)))
                }
            }
        }
    }));

    if (operations.length) {
        await Company.bulkWrite(operations);
    }

    return operations.length;

};

/**
 * Gruppe bei allen Firmen entfernen
 *
 * @returns {Promise<number>} Anzahl geänderter Firmen
 */
exports.removeTag = async (tag) => {

    if (!tag) return 0;

    const companies = await Company.find(
        { isDeleted: false, tags: tagMatcher(tag) },
        "tags"
    ).lean();

    const key = String(tag).trim().toLowerCase();

    const operations = companies.map((company) => ({
        updateOne: {
            filter: { _id: company._id },
            update: { $set: { tags: company.tags.filter((t) => t.toLowerCase() !== key) } }
        }
    }));

    if (operations.length) {
        await Company.bulkWrite(operations);
    }

    return operations.length;

};

// Einheitliche Namen (findAll, findById, delete) zusätzlich zu den bisherigen
require("../core/service/crudAliases").applyCrudAliases(exports);
