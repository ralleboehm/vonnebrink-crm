const contactService = require("../services/contact.service");
const companyService = require("../services/company.service");

// Alle Kontakte anzeigen
exports.index = async (req, res, next) => {

    try {

        const contacts = await contactService.getAll();

        res.render("contacts/index", {
            title: "Kontakte",
            contacts
        });

    } catch (err) {

        next(err);

    }

};

// Formular "Neuer Kontakt"
exports.create = async (req, res, next) => {

    try {

        const companies = await companyService.getAll();

        res.render("contacts/create", {
            title: "Neuer Kontakt",
            companies,
            selectedCompany: req.query.company || null
        });

    } catch (err) {

        next(err);

    }

};

// Neuen Kontakt speichern
exports.store = async (req, res, next) => {

    try {

        await contactService.create({

            company: req.body.company,
            salutation: req.body.salutation,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            position: req.body.position,
            email: req.body.email,
            phone: req.body.phone,
            mobile: req.body.mobile,
            status: req.body.status,
            notes: req.body.notes

        });

        res.redirect(`/companies/${req.body.company}`);

    } catch (err) {

        next(err);

    }

};

// Einzelnen Kontakt anzeigen
exports.show = async (req, res, next) => {

    try {

        const contact = await contactService.getById(req.params.id);

        if (!contact) {
            return res.redirect("/contacts");
        }

        res.render("contacts/show", {
            title: `${contact.firstName} ${contact.lastName}`,
            contact
        });

    } catch (err) {

        next(err);

    }

};

// Formular "Kontakt bearbeiten"
exports.edit = async (req, res, next) => {

    try {

        const contact = await contactService.getById(req.params.id);

        if (!contact) {
            return res.redirect("/contacts");
        }

        const companies = await companyService.getAll();

        res.render("contacts/edit", {
            title: "Kontakt bearbeiten",
            contact,
            companies
        });

    } catch (err) {

        next(err);

    }

};

// Änderungen speichern
exports.update = async (req, res, next) => {

    try {

        await contactService.update(req.params.id, {

            company: req.body.company,
            salutation: req.body.salutation,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            position: req.body.position,
            email: req.body.email,
            phone: req.body.phone,
            mobile: req.body.mobile,
            status: req.body.status,
            notes: req.body.notes

        });

        res.redirect(`/companies/${req.body.company}`);

    } catch (err) {

        next(err);

    }

};

// Soft Delete
exports.destroy = async (req, res, next) => {

    try {

        const contact = await contactService.getById(req.params.id);

        if (!contact) {
            return res.redirect("/contacts");
        }

        await contactService.softDelete(req.params.id);

        res.redirect(`/companies/${contact.company._id}`);

    } catch (err) {

        next(err);

    }

};