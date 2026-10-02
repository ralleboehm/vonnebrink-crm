const companyService = require("../services/company.service");

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

// Formular "Neue Firma"
exports.create = (req, res) => {

    res.render("companies/create", {
        title: "Neue Firma"
    });

};

// Neue Firma speichern
exports.store = async (req, res, next) => {

    try {

        await companyService.create(req.body);

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};

// Einzelne Firma anzeigen
exports.show = async (req, res, next) => {

    try {

        const company = await companyService.getById(req.params.id);

        if (!company) {
            return res.status(404).send("Firma nicht gefunden");
        }

        res.render("companies/show", {
            title: company.companyName,
            company
        });

    } catch (err) {

        next(err);

    }

};

// Formular "Firma bearbeiten"
exports.edit = async (req, res, next) => {

    try {

        const company = await companyService.getById(req.params.id);

        if (!company) {
            return res.status(404).send("Firma nicht gefunden");
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

        await companyService.update(req.params.id, req.body);

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};

// Firma löschen (Soft Delete)
exports.destroy = async (req, res, next) => {

    try {

        await companyService.softDelete(req.params.id);

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};