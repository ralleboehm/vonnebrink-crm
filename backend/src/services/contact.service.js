const Contact = require("../models/contact.model");
const counterService = require("./counter.service");
const portalAccountService = require("./portalAccount.service");

// Alle aktiven Kontakte
exports.getAll = async () => {

    return await Contact.find({

        isDeleted: false

    })
    .populate("company")
    .sort({

        lastName: 1,
        firstName: 1

    });

};

// Kontakt anhand der ID
exports.getById = async (id) => {

    return await Contact.findOne({

        _id: id,
        isDeleted: false

    })
    .populate("company");

};

// Alle Kontakte einer Firma
exports.getByCompany = async (companyId) => {

    return await Contact.find({

        company: companyId,
        isDeleted: false

    }).sort({

        lastName: 1,
        firstName: 1

    });

};

// Neuen Kontakt anlegen
exports.create = async (contactData) => {

    const contactNumber = await counterService.next("contact", "CON");

    return await Contact.create({

        company: contactData.company,

        contactNumber,

        salutation: contactData.salutation,

        firstName: contactData.firstName,

        lastName: contactData.lastName,

        position: contactData.position,

        email: contactData.email,

        phone: contactData.phone,

        mobile: contactData.mobile,

        status: contactData.status || "active",

        notes: contactData.notes,

        isDeleted: false

    });

};

// Kontakt aktualisieren
exports.update = async (id, contactData) => {

    const contact = await Contact.findOneAndUpdate(

        {

            _id: id,
            isDeleted: false

        },

        {

            company: contactData.company,

            salutation: contactData.salutation,

            firstName: contactData.firstName,

            lastName: contactData.lastName,

            position: contactData.position,

            email: contactData.email,

            phone: contactData.phone,

            mobile: contactData.mobile,

            status: contactData.status,

            notes: contactData.notes

        },

        {

            returnDocument: "after",
            runValidators: true

        }

    );

    if (contact) {

        await portalAccountService.updateEmail(
            contact._id,
            contact.email
        ).catch(() => {});

    }

    return contact;

};

// Soft Delete
exports.softDelete = async (id) => {

    return await Contact.findByIdAndUpdate(

        id,

        {

            isDeleted: true

        },

        {

            returnDocument: "after"

        }

    );

};

// Einheitliche Namen (findAll, findById, delete) zusätzlich zu den bisherigen
require("../core/service/crudAliases").applyCrudAliases(exports);
