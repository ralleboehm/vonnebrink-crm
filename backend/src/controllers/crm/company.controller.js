const companyService = require("../../services/company.service");
const contactService = require("../../services/contact.service");
const ticketService = require("../../services/ticket.service");
const assetService = require("../../services/asset.service");
const assetLabels = require("../../utils/assetLabels");
const tagUtils = require("../../utils/tags");
const opportunityService = require("../../services/opportunity.service");
const salesRules = require("../../utils/salesRules");
const { can } = require("../../core/permissions");

// Alle Firmen anzeigen
exports.index = async (req, res, next) => {

    try {

        const tag = typeof req.query.tag === "string" ? req.query.tag.trim().slice(0, 40) : "";

        const [companies, tagStats] = await Promise.all([
            companyService.getAll({ tag }),
            companyService.getTagStats()
        ]);

        res.render("companies/index", {
            title: "Firmen",
            companies,
            tagStats,
            selectedTag: tag
        });

    } catch (err) {

        next(err);

    }

};

// Formular für neue Firma
exports.create = (req, res) => {

    res.render("companies/create", {
        title: "Neue Firma",
        tagSuggestions: tagUtils.SUGGESTED
    });

};

// Firma speichern
exports.store = async (req, res, next) => {

    try {

        const company = await companyService.create(
            companyService.fromForm(req.body)
        );

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

        // Verkaufschancen nur für Admin und Vertrieb
        const showSales = can(req.session.user, "sales.view");

        const [recentTickets, assets, assetSummary, opportunities] = await Promise.all([
            ticketService.getRecentByCompany(company._id, 5),
            assetService.getByCompany(company._id),
            assetService.summary(company._id),
            showSales ? opportunityService.findByCompany(company._id) : null
        ]);

        res.render("companies/show", {
            title: company.companyName,
            company,
            contacts,
            recentTickets,
            assets,
            assetSummary,
            labels: assetLabels,
            opportunities,
            salesStageLabels: salesRules.STAGE_LABELS,
            salesEuro: salesRules.formatEuro
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

        const tagStats = await companyService.getTagStats();

        res.render("companies/edit", {
            title: "Firma bearbeiten",
            company,
            tagText: tagUtils.tagsToText(company.tags),
            tagSuggestions: [...new Set([...tagStats.map((t) => t.tag), ...tagUtils.SUGGESTED])]
        });

    } catch (err) {

        next(err);

    }

};

// Änderungen speichern
exports.update = async (req, res, next) => {

    try {

        await companyService.update(
            req.params.id,
            companyService.fromForm(req.body)
        );

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