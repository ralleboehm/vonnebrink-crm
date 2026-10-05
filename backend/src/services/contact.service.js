const bcrypt = require("bcrypt");

const Contact = require("../models/contact.model");
const counterService = require("./counter.service");

const SALT_ROUNDS = 12;

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

    const portal = {

        enabled: contactData.portalEnabled === true,
        mustChangePassword: true

    };

    if (contactData.portalPassword) {

        portal.passwordHash = await bcrypt.hash(
            contactData.portalPassword,
            SALT_ROUNDS
        );

    }

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

        portal,

        notes: contactData.notes,

        isDeleted: false

    });

};

// Kontakt aktualisieren
exports.update = async (id, contactData) => {

    const updateData = {

        company: contactData.company,

        salutation: contactData.salutation,

        firstName: contactData.firstName,

        lastName: contactData.lastName,

        position: contactData.position,

        email: contactData.email,

        phone: contactData.phone,

        mobile: contactData.mobile,

        status: contactData.status,

        notes: contactData.notes,

        "portal.enabled": contactData.portalEnabled === true

    };

    if (contactData.portalPassword) {

        updateData["portal.passwordHash"] = await bcrypt.hash(
            contactData.portalPassword,
            SALT_ROUNDS
        );

        updateData["portal.mustChangePassword"] = true;
        updateData["portal.passwordChangedAt"] = null;
        updateData["portal.failedLoginAttempts"] = 0;
        updateData["portal.lockedUntil"] = null;

    }

    return await Contact.findOneAndUpdate(

        {

            _id: id,
            isDeleted: false

        },

        updateData,

        {

            new: true,
            runValidators: true

        }

    );

};

// Soft Delete
exports.softDelete = async (id) => {

    return await Contact.findByIdAndUpdate(

        id,

        {

            isDeleted: true

        },

        {

            new: true

        }

    );

};