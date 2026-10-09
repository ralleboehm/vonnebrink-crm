const contactService = require("../../services/contact.service");
const companyService = require("../../services/company.service");
const portalAccountService = require("../../services/portalAccount.service");
const marketingService = require("../../services/marketing.service");
const { takeFlash } = require("../../core/http/flash");
const format = require("../../utils/format");
const assetService = require("../../services/asset.service");
const assetLabels = require("../../utils/assetLabels");
const { can } = require("../../core/permissions");

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

        const contact = await contactService.create({

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

        res.redirect(`/crm/contacts/${contact._id}`);

    } catch (err) {

        next(err);

    }

};

// Einzelnen Kontakt anzeigen
exports.show = async (req, res, next) => {

    try {

        const contact = await contactService.getById(req.params.id);

        if (!contact) {
            return res.redirect("/crm/contacts");
        }

        // Zugewiesene Assets nur für Rollen, die Assets sehen dürfen
        const [portalAccount, assets] = await Promise.all([
            portalAccountService.getByContact(contact._id),
            can(req.session.user, "assets.view") ? assetService.getByContact(contact._id) : null
        ]);

        res.render("contacts/show", {
            title: `${contact.firstName} ${contact.lastName}`,
            contact,
            portalAccount,
            assets,
            labels: assetLabels,
            generatedPassword: req.session.generatedPortalPassword || null,
            marketing: {
                consent: marketingService.consentOf(contact),
                reason: marketingService.ineligibleReason(contact, contact.company),
                staffMayGrant: marketingService.staffMayGrant(contact),
                companyActive: Boolean(contact.company && contact.company.status === "active"),
                unsubscribeUrl: marketingService.unsubscribeUrl(contact),
                doiPending: contact.marketing && contact.marketing.doi && contact.marketing.doi.requestedAt
                    ? contact.marketing.doi
                    : null,
                statusLabels: marketingService.STATUS_LABELS,
                sourceLabels: marketingService.SOURCE_LABELS
            },
            flash: takeFlash(req),
            format
        });

        delete req.session.generatedPortalPassword;

    } catch (err) {

        next(err);

    }

};

// Formular "Kontakt bearbeiten"
exports.edit = async (req, res, next) => {

    try {

        const contact = await contactService.getById(req.params.id);

        if (!contact) {
            return res.redirect("/crm/contacts");
        }

        const companies = await companyService.getAll();
        const portalAccount = await portalAccountService.getByContact(contact._id);

        res.render("contacts/edit", {
            title: "Kontakt bearbeiten",
            contact,
            companies,
            portalAccount,
            generatedPassword: req.session.generatedPortalPassword || null
        });

        delete req.session.generatedPortalPassword;

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

        res.redirect(`/crm/contacts/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

// Soft Delete
exports.destroy = async (req, res, next) => {

    try {

        const contact = await contactService.getById(req.params.id);

        if (!contact) {
            return res.redirect("/crm/contacts");
        }

        await contactService.softDelete(req.params.id);

        res.redirect(`/crm/companies/${contact.company._id}`);

    } catch (err) {

        next(err);

    }

};