const mongoose = require("mongoose");

const assetService = require("../../services/asset.service");
const companyService = require("../../services/company.service");
const contactService = require("../../services/contact.service");
const labels = require("../../utils/assetLabels");

const FILTER_KEYS = ["search", "company", "type", "status", "source", "online", "updates"];

function viewHelpers() {

    return {
        labels,
        assetTypes: assetService.TYPES,
        assetStatuses: assetService.STATUSES,
        action1Fields: assetService.ACTION1_MANAGED_FIELDS
    };

}

async function formData() {

    const [companies, contacts] = await Promise.all([
        companyService.getAll(),
        contactService.getAll()
    ]);

    return { companies, contacts };

}

function isValidationError(err) {

    return err && (err.name === "ValidationError" || err.name === "CastError");

}

/**
 * Übersicht mit Filtern
 */
exports.index = async (req, res, next) => {

    try {

        const filters = {};

        for (const key of FILTER_KEYS) {
            filters[key] = typeof req.query[key] === "string" ? req.query[key].trim().slice(0, 100) : "";
        }

        // Ungültige Firmen-ID im Link ignorieren statt einen Fehler zu zeigen
        if (filters.company && !mongoose.isValidObjectId(filters.company)) {
            filters.company = "";
        }

        const [assets, companies] = await Promise.all([
            assetService.getAll(filters),
            companyService.getAll()
        ]);

        res.render("assets/index", {
            title: "Assets",
            assets,
            companies,
            filters,
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Formular: neues Asset
 */
exports.create = async (req, res, next) => {

    try {

        res.render("assets/create", {
            title: "Neues Asset",
            asset: {
                company: req.query.company || null,
                contact: req.query.contact || null,
                type: "workstation",
                status: "active"
            },
            error: null,
            ...(await formData()),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Neues Asset speichern
 */
exports.store = async (req, res, next) => {

    const data = assetService.fromForm(req.body);

    try {

        const message = await assetService.validate(data);

        if (message) {
            const error = new Error(message);
            error.name = "ValidationError";
            throw error;
        }

        const asset = await assetService.create(data);

        res.redirect(`/crm/assets/${asset._id}`);

    } catch (err) {

        if (!isValidationError(err)) {
            return next(err);
        }

        try {

            res.status(422).render("assets/create", {
                title: "Neues Asset",
                asset: data,
                error: err.message,
                ...(await formData()),
                ...viewHelpers()
            });

        } catch (renderErr) {

            next(renderErr);

        }

    }

};

/**
 * Asset anzeigen
 */
exports.show = async (req, res, next) => {

    try {

        const asset = await assetService.getById(req.params.id);

        if (!asset) {
            return res.status(404).render("errors/404", {
                title: "Asset nicht gefunden",
                message: "Dieses Asset existiert nicht oder wurde gelöscht."
            });
        }

        res.render("assets/show", {
            title: asset.name,
            asset,
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Formular: Asset bearbeiten
 */
exports.edit = async (req, res, next) => {

    try {

        const asset = await assetService.getById(req.params.id);

        if (!asset) {
            return res.redirect("/crm/assets");
        }

        res.render("assets/edit", {
            title: "Asset bearbeiten",
            asset,
            error: null,
            ...(await formData()),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Änderungen speichern
 */
exports.update = async (req, res, next) => {

    try {

        const existing = await assetService.getById(req.params.id);

        if (!existing) {
            return res.redirect("/crm/assets");
        }

        const isAction1 = existing.source === "action1";
        const data = assetService.fromForm(req.body, { isAction1 });

        // Action1-Assets bleiben bei der Firma, die über die Organisation verknüpft ist
        if (isAction1) {
            delete data.company;
        }

        const companyForCheck = data.company || (existing.company && existing.company._id);

        try {

            const message = await assetService.validate(
                { ...data, company: companyForCheck },
                { checkName: !isAction1 }
            );

            if (message) {
                const error = new Error(message);
                error.name = "ValidationError";
                throw error;
            }

            await assetService.update(req.params.id, data);

        } catch (err) {

            if (!isValidationError(err)) {
                throw err;
            }

            const asset = existing.toObject();

            Object.assign(asset, data);

            return res.status(422).render("assets/edit", {
                title: "Asset bearbeiten",
                asset,
                error: err.message,
                ...(await formData()),
                ...viewHelpers()
            });

        }

        res.redirect(`/crm/assets/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

/**
 * Soft Delete
 */
exports.destroy = async (req, res, next) => {

    try {

        const asset = await assetService.softDelete(req.params.id);

        const companyId = asset && asset.company;

        res.redirect(req.body.returnTo === "company" && companyId
            ? `/crm/companies/${companyId}`
            : "/crm/assets");

    } catch (err) {

        next(err);

    }

};

// Für die Firmenansicht
exports.viewHelpers = viewHelpers;
