const contractService = require("../../services/contract.service");
const companyService = require("../../services/company.service");
const contactService = require("../../services/contact.service");
const documentService = require("../../services/document.service");
const rules = require("../../utils/contractRules");
const documentRules = require("../../utils/documentRules");
const format = require("../../utils/format");
const { can } = require("../../core/permissions");
const { setFlash, takeFlash } = require("../../core/http/flash");

const BASE = "/crm/contracts";

function viewHelpers() {

    return { statuses: rules.STATUSES, signatures: rules.SIGNATURE_STATUSES, transitions: rules.TRANSITIONS, format };

}

function readFilters(query) {

    const text = (value, max = 100) => (typeof value === "string" ? value.trim().slice(0, max) : "");

    return {
        search: text(query.search),
        status: rules.STATUS_KEYS.includes(query.status) ? query.status : "",
        company: text(query.company, 30),
        due: query.due === "notice" ? "notice" : ""
    };

}

async function renderForm(res, view, { contract, error = null, status = 200, title }) {

    const [companies, contacts] = await Promise.all([companyService.getAll(), contactService.getAll()]);

    res.status(status).render(view, { title, contract, error, companies, contacts, ...viewHelpers() });

}

/**
 * Übersicht
 */
exports.index = async (req, res, next) => {

    try {

        const filters = readFilters(req.query);

        const [contracts, summary, companies] = await Promise.all([
            contractService.findAll(filters),
            contractService.summary(),
            companyService.getAll()
        ]);

        res.render("contracts/index", {
            title: "Verträge",
            contracts,
            summary,
            companies,
            filters,
            flash: takeFlash(req),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

exports.create = async (req, res, next) => {

    try {

        await renderForm(res, "contracts/create", {
            title: "Neuer Vertrag",
            contract: {
                company: typeof req.query.company === "string" ? req.query.company : null,
                status: "draft",
                signatureStatus: "unsigned",
                version: 1
            }
        });

    } catch (err) {

        next(err);

    }

};

exports.store = async (req, res, next) => {

    const data = contractService.fromForm(req.body);

    try {

        const contract = await contractService.create(data);

        setFlash(req, "success", `Vertrag ${contract.contractNumber} angelegt.`);

        res.redirect(`${BASE}/${contract._id}`);

    } catch (err) {

        if (err.status !== 422) return next(err);

        try {
            await renderForm(res, "contracts/create", { title: "Neuer Vertrag", contract: data, error: err.message, status: 422 });
        } catch (renderErr) {
            next(renderErr);
        }

    }

};

/**
 * Detailseite mit Fristen und Vertragsdokumenten
 */
exports.show = async (req, res, next) => {

    try {

        const contract = await contractService.findById(req.params.id);

        if (!contract) return next();

        const documents = can(req.session.user, "documents.view")
            ? await documentService.referencePage("contract", contract, req.session.user, {})
            : null;

        res.render("contracts/show", {
            title: `${contract.contractNumber} – ${contract.title}`,
            contract,
            documents,
            documentRules,
            returnTo: `${BASE}/${contract._id}`,
            maxUploadMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 100,
            flash: takeFlash(req),
            ...viewHelpers()
        });

    } catch (err) {

        next(err);

    }

};

exports.edit = async (req, res, next) => {

    try {

        const contract = await contractService.findById(req.params.id);

        if (!contract) return next();

        await renderForm(res, "contracts/edit", { title: `${contract.contractNumber} bearbeiten`, contract });

    } catch (err) {

        next(err);

    }

};

exports.update = async (req, res, next) => {

    const data = contractService.fromForm(req.body);

    try {

        await contractService.update(req.params.id, data);

        setFlash(req, "success", "Vertrag gespeichert.");

        res.redirect(`${BASE}/${req.params.id}`);

    } catch (err) {

        if (err.status === 404) return next();
        if (err.status !== 422) return next(err);

        try {
            const existing = await contractService.findById(req.params.id);
            await renderForm(res, "contracts/edit", {
                title: "Vertrag bearbeiten",
                contract: { ...data, _id: req.params.id, contractNumber: existing ? existing.contractNumber : "" },
                error: err.message,
                status: 422
            });
        } catch (renderErr) {
            next(renderErr);
        }

    }

};

exports.setStatus = async (req, res, next) => {

    try {

        const contract = await contractService.setStatus(req.params.id, (req.body || {}).status);

        setFlash(req, "success", `Status: ${rules.STATUSES[contract.status].label}.`);

        res.redirect(`${BASE}/${contract._id}`);

    } catch (err) {

        if (err.status === 404) return next();
        if (err.status !== 422) return next(err);

        setFlash(req, "danger", err.message);
        res.redirect(`${BASE}/${req.params.id}`);

    }

};

exports.destroy = async (req, res, next) => {

    try {

        const contract = await contractService.remove(req.params.id);

        setFlash(req, "success", `Vertrag ${contract.contractNumber} gelöscht. Die Dokumente bleiben beim Kunden erhalten.`);

        res.redirect(BASE);

    } catch (err) {

        if (err.status === 404) return next();

        next(err);

    }

};
