const Company = require("../models/company.model");

// Alle Firmen anzeigen
exports.index = async (req, res, next) => {
    try {

        const companies = await Company.find({
            isDeleted: false
        }).sort({
            companyName: 1
        });

        res.render("companies/index", {
            title: "Firmen",
            companies
        });

    } catch (err) {
        next(err);
    }
};

// Formular anzeigen
exports.create = (req, res) => {

    res.render("companies/create", {
        title: "Neue Firma"
    });

};

// Firma speichern
exports.store = async (req, res, next) => {

    try {

        await Company.create({

            companyName: req.body.companyName,

            phone: req.body.phone,

            email: req.body.email,

            website: req.body.website

        });

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};

// Detailansicht
exports.show = async (req, res, next) => {

    try {

        const company = await Company.findById(req.params.id);

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

// Formular bearbeiten
exports.edit = async (req, res, next) => {

    try {

        const company = await Company.findById(req.params.id);

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

        await Company.findByIdAndUpdate(

            req.params.id,

            {
                companyName: req.body.companyName,
                phone: req.body.phone,
                email: req.body.email,
                website: req.body.website
            },

            {
                runValidators: true
            }

        );

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};

// Soft Delete
exports.destroy = async (req, res, next) => {

    try {

        await Company.findByIdAndUpdate(req.params.id, {

            isDeleted: true

        });

        res.redirect("/companies");

    } catch (err) {

        next(err);

    }

};