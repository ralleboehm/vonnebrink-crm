const Contact = require("../models/contact.model");
const counterService = require("./counter.service");

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

    return await Contact.findById(id)
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

    return await Contact.findByIdAndUpdate(

        id,

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