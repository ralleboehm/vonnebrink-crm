const opportunityService = require("../../services/opportunity.service");
const companyService = require("../../services/company.service");
const contactService = require("../../services/contact.service");
const userService = require("../../services/user.service");
const campaignService = require("../../services/campaign.service");
const rules = require("../../utils/salesRules");
const { can } = require("../../core/permissions");
const { setFlash, takeFlash } = require("../../core/http/flash");
const { safeRedirectTarget } = require("../../core/http/redirect");

const BASE = "/crm/sales";

function staffName(req) {

    const user = req.session.user || {};

    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "CRM";

}

function viewHelpers() {

    return {
        stages: rules.STAGES,
        stageLabels: rules.STAGE_LABELS,
        sources: rules.SOURCES,
        lostReasons: rules.LOST_REASONS,
        euro: rules.formatEuro,
        stepState: rules.nextStepState
    };

}

function readFilters(query) {

    const text = (value, max = 100) => (typeof value === "string" ? value.trim().slice(0, max) : "");

    return {
        search: text(query.search),
        owner: text(query.owner, 30),
        stage: text(query.stage, 20),
        state: ["open", "closed", "all"].includes(query.state) ? query.state : "open"
    };

}

/**
 * Wer darf als zuständig gewählt werden? Admins und Vertrieb.
 */
async function salesUsers() {

    const users = await userService.findAll();

    return users.filter((user) => can(user.role, "sales.view"));

}

async function formData() {

    const [companies, contacts, owners, campaigns] = await Promise.all([
        companyService.getAll(),
        contactService.getAll(),
        salesUsers(),
        campaignService.findAll({ status: "sent" })
    ]);

    return { companies, contacts, owners, campaigns };

}

async function renderForm(res, view, { opportunity, error = null, status = 200, title }) {

    res.status(status).render(view, {
        title,
        opportunity,
        error,
        ...(await formData()),
        ...viewHelpers()
    });

}

/**
 * Pipeline-Tafel
 */
exports.board = async (req, res, next) => {

    try {

        const filters = readFilters(req.query);

        const [pipeline, owners] = await Promise.all([
            opportunityService.pipeline({ owner: filters.owner, search: filters.search }),
            salesUsers()
        ]);

        res.render("sales/board", {
            title: "Vertrieb – Pipeline",
            pipeline,
            owners,
            filters,
            flash: takeFlash(req),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Liste mit Filtern (auch abgeschlossene)
 */
exports.list = async (req, res, next) => {

    try {

        const filters = readFilters(req.query);

        const [opportunities, owners] = await Promise.all([
            opportunityService.findAll({
                ...filters,
                state: filters.state === "all" ? undefined : filters.state
            }),
            salesUsers()
        ]);

        res.render("sales/index", {
            title: "Vertrieb – Verkaufschancen",
            opportunities,
            summary: rules.summarize(opportunities),
            owners,
            filters,
            flash: takeFlash(req),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Formular: neue Verkaufschance (optional mit ?company=…)
 */
exports.create = async (req, res, next) => {

    try {

        await renderForm(res, "sales/create", {
            title: "Neue Verkaufschance",
            opportunity: {
                company: typeof req.query.company === "string" ? req.query.company : null,
                owner: req.session.user && req.session.user.id,
                stage: "new",
                probability: rules.defaultProbability("new"),
                mrr: 0,
                oneTime: 0,
                nextStep: { text: "Erstgespräch vereinbaren", dueDate: new Date(Date.now() + 2 * 86400000) }
            }
        });

    } catch (err) {

        next(err);

    }

};

exports.store = async (req, res, next) => {

    const data = opportunityService.fromForm(req.body);

    try {

        const opportunity = await opportunityService.create(data, {
            by: staffName(req),
            ownerId: req.session.user && req.session.user.id
        });

        setFlash(req, "success", "Verkaufschance angelegt.");

        res.redirect(`${BASE}/${opportunity._id}`);

    } catch (err) {

        if (err.status !== 422) return next(err);

        try {

            await renderForm(res, "sales/create", { title: "Neue Verkaufschance", opportunity: data, error: err.message, status: 422 });

        } catch (renderErr) {

            next(renderErr);

        }

    }

};

/**
 * Detailseite: Angaben, Phase, nächster Schritt, Verlauf
 */
exports.show = async (req, res, next) => {

    try {

        const opportunity = await opportunityService.findById(req.params.id);

        if (!opportunity) {
            return res.status(404).render("errors/404", {
                title: "Verkaufschance nicht gefunden",
                message: "Diese Verkaufschance existiert nicht oder wurde gelöscht."
            });
        }

        res.render("sales/show", {
            title: opportunity.title,
            opportunity,
            history: [...opportunity.history].reverse(),
            flash: takeFlash(req),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

exports.edit = async (req, res, next) => {

    try {

        const opportunity = await opportunityService.findById(req.params.id);

        if (!opportunity) return res.redirect(BASE);

        const data = opportunity.toObject();

        // Für die Auswahlfelder nur die IDs
        for (const field of ["company", "contact", "owner", "campaign"]) {
            data[field] = data[field] && data[field]._id ? String(data[field]._id) : data[field];
        }

        await renderForm(res, "sales/edit", { title: "Verkaufschance bearbeiten", opportunity: data });

    } catch (err) {

        next(err);

    }

};

exports.update = async (req, res, next) => {

    const data = opportunityService.fromForm(req.body);

    try {

        await opportunityService.update(req.params.id, data, { by: staffName(req) });

        setFlash(req, "success", "Änderungen gespeichert.");

        res.redirect(`${BASE}/${req.params.id}`);

    } catch (err) {

        if (err.status === 404) return res.redirect(BASE);
        if (err.status !== 422) return next(err);

        try {

            await renderForm(res, "sales/edit", {
                title: "Verkaufschance bearbeiten",
                opportunity: { ...data, _id: req.params.id },
                error: err.message,
                status: 422
            });

        } catch (renderErr) {

            next(renderErr);

        }

    }

};

/**
 * Phase wechseln – als Formular (Detailseite) oder per fetch (Tafel, JSON)
 */
exports.moveStage = async (req, res, next) => {

    const body = req.body || {};
    const wantsJson = (req.get("accept") || "").includes("application/json");
    const back = safeRedirectTarget(body.returnTo, `${BASE}/${req.params.id}`);

    try {

        const opportunity = await opportunityService.moveStage(req.params.id, body.stage, {
            by: staffName(req),
            lostReason: body.lostReason
        });

        if (wantsJson) {
            return res.json({ ok: true, stage: opportunity.stage, probability: opportunity.probability });
        }

        setFlash(req, "success", `Phase: ${rules.STAGE_LABELS[opportunity.stage]}.${opportunity.stage === "won" ? " Glückwunsch!" : ""}`);

        res.redirect(back);

    } catch (err) {

        if (!err.status) return next(err);

        if (wantsJson) return res.status(err.status).json({ ok: false, error: err.message });

        setFlash(req, "danger", err.message);

        res.redirect(back);

    }

};

/**
 * Nächsten Schritt erledigen (und neuen setzen)
 */
exports.completeStep = async (req, res, next) => {

    const body = req.body || {};
    const back = safeRedirectTarget(body.returnTo, `${BASE}/${req.params.id}`);

    try {

        await opportunityService.completeStep(req.params.id, {
            by: staffName(req),
            nextText: body.nextStepText,
            nextDue: body.nextStepDue
        });

        setFlash(req, "success", body.nextStepText ? "Erledigt – nächster Schritt eingetragen." : "Schritt erledigt.");

    } catch (err) {

        if (!err.status) return next(err);

        setFlash(req, "danger", err.message);

    }

    res.redirect(back);

};

exports.addNote = async (req, res, next) => {

    try {

        await opportunityService.addNote(req.params.id, (req.body || {}).note, { by: staffName(req) });

    } catch (err) {

        if (!err.status) return next(err);

        setFlash(req, "danger", err.message);

    }

    res.redirect(`${BASE}/${req.params.id}`);

};

exports.destroy = async (req, res, next) => {

    try {

        const opportunity = await opportunityService.delete(req.params.id);

        if (opportunity) setFlash(req, "success", `„${opportunity.title}“ gelöscht.`);

        res.redirect(BASE);

    } catch (err) {

        next(err);

    }

};
