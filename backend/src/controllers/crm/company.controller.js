const companyService = require("../../services/company.service");
const contactService = require("../../services/contact.service");
const ticketService = require("../../services/ticket.service");
const assetService = require("../../services/asset.service");
const assetLabels = require("../../utils/assetLabels");

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

        const company = await companyService.create({

            companyName: req.body.companyName,
            status: req.body.status,
            phone: req.body.phone,
            email: req.body.email,
            website: req.body.website,
            address: req.body.address

        });

        res.redirect(`/crm/companies/${company._id}`);

    } catch (err) {

        next(err);

    }

};

// Firma anzeigen
exports.show = async (req, res, next) => {

    try {

        const company = await companyService.getById(req.params.id);

        if (!company) {
            return res.redirect("/crm/companies");
        }

        const contacts = await contactService.getByCompany(company._id);

        const [recentTickets, assets, assetSummary] = await Promise.all([
            ticketService.getRecentByCompany(company._id, 5),
            assetService.getByCompany(company._id),
            assetService.summary(company._id)
        ]);

        res.render("companies/show", {
            title: company.companyName,
            company,
            contacts,
            recentTickets,
            assets,
            assetSummary,
            labels: assetLabels
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
            return res.redirect("/crm/companies");
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

        res.redirect(`/crm/companies/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

// Soft Delete
exports.destroy = async (req, res, next) => {

    try {

        const deleted = await companyService.softDelete(req.params.id);

        if (!deleted) {
            return res.redirect("/crm/companies");
        }

        res.redirect("/crm/companies");

    } catch (err) {

        next(err);

    }

};