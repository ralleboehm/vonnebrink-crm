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

    return await Company.findById(id);

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

    return await Company.findByIdAndUpdate(

        id,

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

    return await Company.findByIdAndUpdate(

        id,

        {

            isDeleted: true

        },

        {

            new: true

        }

    );

};