const campaignService = require("../../services/campaign.service");
const companyService = require("../../services/company.service");
const marketingService = require("../../services/marketing.service");
const emailService = require("../../services/email.service");
const userService = require("../../services/user.service");
const emailTemplates = require("../../services/emailTemplate.service");
const { setFlash, takeFlash } = require("../../core/http/flash");

const BASE = "/crm/marketing/campaigns";

const STATUS_LABELS = {
    draft: "Entwurf",
    sending: "Wird versendet",
    sent: "Versendet"
};

const DELIVERY_LABELS = {
    pending: "Wartet",
    sent: "Verschickt",
    failed: "Fehlgeschlagen",
    skipped: "Übersprungen"
};

function staffName(req) {

    const user = req.session.user || {};

    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "CRM";

}

/**
 * E-Mail-Adresse des angemeldeten Benutzers (Vorschlag für die Test-Mail)
 */
async function ownEmail(req) {

    const id = req.session.user && req.session.user.id;

    if (!id) return "";

    const user = await userService.findById(id);

    return (user && user.email) || "";

}

function viewHelpers() {

    return {
        statusLabels: STATUS_LABELS,
        deliveryLabels: DELIVERY_LABELS,
        placeholders: campaignService.PLACEHOLDERS
    };

}

/**
 * Gruppen mit Anzahl erreichbarer Kontakte (für die Zielgruppen-Auswahl)
 */
async function audienceOptions() {

    const [tagStats, eligibleByGroup, allEligible] = await Promise.all([
        companyService.getTagStats(),
        marketingService.eligibleByGroup(),
        campaignService.audience([])
    ]);

    return {
        groups: tagStats.map((entry) => ({
            tag: entry.tag,
            eligible: eligibleByGroup.get(entry.tag.toLowerCase()) || 0
        })),
        allEligible: allEligible.length
    };

}

async function renderForm(res, view, { campaign, error = null, flash = null, status = 200, title }) {

    res.status(status).render(view, {
        title,
        campaign,
        error,
        flash,
        ...(await audienceOptions()),
        ...viewHelpers()
    });

}

/**
 * Übersicht
 */
exports.index = async (req, res, next) => {

    try {

        const filters = {
            status: typeof req.query.status === "string" ? req.query.status : "",
            search: typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : ""
        };

        const campaigns = await campaignService.findAll(filters);

        res.render("campaigns/index", {
            title: "Marketing – Kampagnen",
            campaigns,
            filters,
            flash: takeFlash(req),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Formular: neue Kampagne
 */
exports.create = async (req, res, next) => {

    try {

        await renderForm(res, "campaigns/create", {
            title: "Neue Kampagne",
            campaign: {
                name: "",
                description: "",
                subject: "",
                format: "html",
                content: "<p>{{anrede}},</p><p><br></p><p><br></p><p>Mit freundlichen Grüßen</p>",
                audience: { tags: [] }
            }
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Neue Kampagne speichern
 */
exports.store = async (req, res, next) => {

    const data = campaignService.fromForm(req.body);

    try {

        const campaign = await campaignService.create(data, { by: staffName(req) });

        setFlash(req, "success", "Kampagne gespeichert. Prüfen Sie die Vorschau und schicken Sie sich eine Test-Mail.");

        res.redirect(`${BASE}/${campaign._id}`);

    } catch (err) {

        if (err.status !== 422) return next(err);

        try {

            await renderForm(res, "campaigns/create", { title: "Neue Kampagne", campaign: data, error: err.message, status: 422 });

        } catch (renderErr) {

            next(renderErr);

        }

    }

};

/**
 * Kampagne anzeigen (Vorschau, Test-Mail, Versand, Ergebnis)
 */
exports.show = async (req, res, next) => {

    try {

        const campaign = await campaignService.findById(req.params.id);

        if (!campaign) {
            return res.status(404).render("errors/404", {
                title: "Kampagne nicht gefunden",
                message: "Diese Kampagne existiert nicht oder wurde gelöscht."
            });
        }

        // Für Entwürfe: wie viele würden die Mail jetzt bekommen?
        const recipientCount = campaign.status === "draft"
            ? (await campaignService.audience(campaign.audience.tags)).length
            : campaign.stats.total;

        res.render("campaigns/show", {
            title: campaign.name,
            campaign,
            recipientCount,
            mailConfigured: emailService.isConfigured(),
            appUrlProblem: emailService.publicAppUrlProblem(),
            testAddress: await ownEmail(req),
            flash: takeFlash(req),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

function sendPreview(res, rendered) {

    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(emailTemplates.forBrowser(rendered.html));

}

/**
 * Vorschau der gespeicherten Kampagne (mit Beispielwerten)
 */
exports.preview = async (req, res, next) => {

    try {

        const campaign = await campaignService.findById(req.params.id);

        if (!campaign) return res.status(404).send("Kampagne nicht gefunden.");

        sendPreview(res, await campaignService.render(campaign));

    } catch (err) {

        next(err);

    }

};

/**
 * Vorschau direkt aus dem Formular (noch nicht gespeichert)
 */
exports.previewDraft = async (req, res, next) => {

    try {

        const data = campaignService.fromForm(req.body);

        sendPreview(res, await campaignService.render({
            subject: data.subject || "(ohne Betreff)",
            format: data.format,
            content: data.content
        }));

    } catch (err) {

        next(err);

    }

};

/**
 * Formular: bearbeiten (nur Entwürfe)
 */
exports.edit = async (req, res, next) => {

    try {

        const campaign = await campaignService.findById(req.params.id);

        if (!campaign) return res.redirect(BASE);

        if (campaign.status !== "draft") {
            setFlash(req, "warning", "Versendete Kampagnen können nicht mehr geändert werden. Tipp: duplizieren.");
            return res.redirect(`${BASE}/${campaign._id}`);
        }

        await renderForm(res, "campaigns/edit", { title: "Kampagne bearbeiten", campaign: campaignService.forEditor(campaign), flash: takeFlash(req) });

    } catch (err) {

        next(err);

    }

};

/**
 * Änderungen speichern
 */
exports.update = async (req, res, next) => {

    const data = campaignService.fromForm(req.body);

    try {

        await campaignService.update(req.params.id, data, { by: staffName(req) });

        setFlash(req, "success", "Änderungen gespeichert.");

        res.redirect(`${BASE}/${req.params.id}`);

    } catch (err) {

        if (err.status === 404) return res.redirect(BASE);

        if (err.status === 409) {
            setFlash(req, "warning", err.message);
            return res.redirect(`${BASE}/${req.params.id}`);
        }

        if (err.status !== 422) return next(err);

        try {

            await renderForm(res, "campaigns/edit", {
                title: "Kampagne bearbeiten",
                campaign: { ...data, _id: req.params.id, status: "draft" },
                error: err.message,
                status: 422
            });

        } catch (renderErr) {

            next(renderErr);

        }

    }

};

/**
 * Test-Mail an eine Adresse
 */
exports.sendTest = async (req, res, next) => {

    try {

        const result = await campaignService.sendTest(req.params.id, (req.body || {}).email);

        if (result.sent) {
            setFlash(req, "success", `Test-Mail an ${result.recipients.join(", ")} verschickt.`);
        } else {
            setFlash(req, "warning", `Test-Mail nicht verschickt: ${result.skipped || "unbekannter Grund"}.`);
        }

    } catch (err) {

        if (!err.status) return next(err);

        if (err.status === 404) return res.redirect(BASE);

        setFlash(req, "danger", err.message);

    }

    res.redirect(`${BASE}/${req.params.id}`);

};

/**
 * Versand starten
 */
exports.send = async (req, res, next) => {

    try {

        const { count } = await campaignService.startSending(req.params.id, { by: staffName(req) });

        setFlash(req, "success", `Versand gestartet: ${count} Empfänger. Die Mails gehen nacheinander raus – diese Seite zeigt den Fortschritt.`);

    } catch (err) {

        if (!err.status) return next(err);

        if (err.status === 404) return res.redirect(BASE);

        setFlash(req, "danger", err.message);

    }

    res.redirect(`${BASE}/${req.params.id}`);

};

/**
 * Als neuen Entwurf kopieren
 */
exports.duplicate = async (req, res, next) => {

    try {

        const copy = await campaignService.duplicate(req.params.id, { by: staffName(req) });

        setFlash(req, "success", "Kopie angelegt. Sie können sie jetzt bearbeiten.");

        res.redirect(`${BASE}/${copy._id}/edit`);

    } catch (err) {

        if (err.status === 404) return res.redirect(BASE);

        next(err);

    }

};

/**
 * Löschen (Soft Delete)
 */
exports.destroy = async (req, res, next) => {

    try {

        const campaign = await campaignService.delete(req.params.id);

        if (campaign) setFlash(req, "success", `Kampagne „${campaign.name}“ gelöscht.`);

        res.redirect(BASE);

    } catch (err) {

        if (err.status !== 409) return next(err);

        setFlash(req, "warning", err.message);

        res.redirect(`${BASE}/${req.params.id}`);

    }

};
