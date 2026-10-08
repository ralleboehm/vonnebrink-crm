const Company = require("../models/company.model");
const counterService = require("./counter.service");

// Alle aktiven Firmen
exports.getAll = async () => {

    return await Company.find({

        isDeleted: false

    }).sort({

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

        isDeleted: false

    });

};

// Firma aktualisieren
exports.update = async (id, companyData) => {

    return await Company.findOneAndUpdate(

        {

            _id: id,
            isDeleted: false

        },

        {

            companyName: companyData.companyName,

            status: companyData.status,

            phone: companyData.phone,

            email: companyData.email,

            website: companyData.website,

            address: companyData.address

        },

        {

            new: true,

            runValidators: true

        }

    );

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

            new: true

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
