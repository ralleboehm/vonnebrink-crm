const companyService = require("../services/company.service");
const contactService = require("../services/contact.service");

// Alle Firmen anzeigen
exports.index = async (req, res, next) => {

    try {

        const companies = await companyService.getAll();

        res.render("companies/index", {
            title: "Firmen",
            companies
        });

    } catch (err) {

        next(err);

    }

};

// Formular für neue Firma
exports.create = (req, res) => {

    res.render("companies/create", {
        title: "Neue Firma"
    });

};

// Firma speichern
exports.store = async (req, res, next) => {

    try {

        await companyService.create({

            companyName: req.body.companyName,
            status: req.body.status,
            phone: req.body.phone,
            email: req.body.email,
            website: req.body.website,
            address: req.body.address

        });

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};

// Firma anzeigen
exports.show = async (req, res, next) => {

    try {

        const company = await companyService.getById(req.params.id);

        if (!company) {
            return res.redirect("/companies");
        }

        const contacts = await contactService.getByCompany(company._id);

        res.render("companies/show", {
            title: company.companyName,
            company,
            contacts
        });

    } catch (err) {

        next(err);

    }

};

// Formular zum Bearbeiten
exports.edit = async (req, res, next) => {

    try {

        const company = await companyService.getById(req.params.id);

        if (!company) {
            return res.redirect("/companies");
        }

        res.render("companies/edit", {
            title: "Firma bearbeiten",
            company
        });

    } catch (err) {

        next(err);

    }

};

// Änderungen speichern
exports.update = async (req, res, next) => {

    try {

        await companyService.update(req.params.id, {

            companyName: req.body.companyName,
            status: req.body.status,
            phone: req.body.phone,
            email: req.body.email,
            website: req.body.website,
            address: req.body.address

        });

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};

// Soft Delete
exports.destroy = async (req, res, next) => {

    try {

        const deleted = await companyService.softDelete(req.params.id);

        if (!deleted) {
            return res.redirect("/companies");
        }

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};