const marketingService = require("../../services/marketing.service");
const companyService = require("../../services/company.service");
const contactService = require("../../services/contact.service");
const { setFlash, takeFlash } = require("../../core/http/flash");
const { safeRedirectTarget } = require("../../core/http/redirect");

function readFilters(query) {

    return {
        tag: typeof query.tag === "string" ? query.tag.trim().slice(0, 40) : "",
        search: typeof query.search === "string" ? query.search.trim().slice(0, 100) : "",
        show: query.show === "all" ? "all" : "eligible"
    };

}

function staffName(req) {

    const user = req.session.user || {};

    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "CRM";

}

/**
 * Empfänger: wer ist für Kampagnen erreichbar?
 */
exports.recipients = async (req, res, next) => {

    try {

        const filters = readFilters(req.query);

        const [rows, tagStats] = await Promise.all([
            marketingService.listContacts({ tag: filters.tag, search: filters.search }),
            companyService.getTagStats()
        ]);

        res.render("marketing/index", {
            title: "Marketing – Empfänger",
            filters,
            rows: filters.show === "all" ? rows : rows.filter((r) => r.eligible),
            summary: marketingService.summarize(rows),
            tagStats,
            statusLabels: marketingService.STATUS_LABELS,
            sourceLabels: marketingService.SOURCE_LABELS
        });

    } catch (err) {

        next(err);

    }

};

/**
 * CSV-Export (Serienbrief, Anrufliste)
 */
exports.exportCsv = async (req, res, next) => {

    try {

        const filters = readFilters(req.query);

        const rows = await marketingService.listContacts({
            tag: filters.tag,
            search: filters.search,
            onlyEligible: filters.show !== "all"
        });

        const name = filters.tag ? filters.tag.replace(/[^a-z0-9äöüß-]+/gi, "-").toLowerCase() : "alle";
        const date = new Date().toISOString().slice(0, 10);

        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="empfaenger-${name}-${date}.csv"`);

        res.send(marketingService.toExportCsv(rows));

    } catch (err) {

        next(err);

    }

};

/**
 * Gruppen-Übersicht
 */
exports.groups = async (req, res, next) => {

    try {

        const [tagStats, eligible] = await Promise.all([
            companyService.getTagStats(),
            marketingService.eligibleByGroup()
        ]);

        res.render("marketing/groups", {
            title: "Marketing – Gruppen",
            groups: tagStats.map((entry) => ({
                ...entry,
                eligible: eligible.get(entry.tag.toLowerCase()) || 0
            })),
            flash: takeFlash(req)
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Gruppe umbenennen oder zusammenführen
 */
exports.renameGroup = async (req, res, next) => {

    try {

        const from = String(req.body.from || "").trim();
        const to = String(req.body.to || "").trim();

        if (!from || !to) {

            setFlash(req, "warning", "Bitte einen neuen Namen angeben.");

        } else {

            const count = await companyService.renameTag(from, to);

            setFlash(req, "success", `„${from}“ heißt jetzt „${to}“ (${count} ${count === 1 ? "Firma" : "Firmen"}).`);

        }

        res.redirect("/crm/marketing/groups");

    } catch (err) {

        next(err);

    }

};

/**
 * Gruppe bei allen Firmen entfernen
 */
exports.removeGroup = async (req, res, next) => {

    try {

        const tag = String(req.body.tag || "").trim();

        const count = await companyService.removeTag(tag);

        setFlash(req, "success", `„${tag}“ wurde bei ${count} ${count === 1 ? "Firma" : "Firmen"} entfernt.`);

        res.redirect("/crm/marketing/groups");

    } catch (err) {

        next(err);

    }

};

/**
 * Einwilligung eines Kontakts im CRM erfassen oder widerrufen
 */
exports.setContactConsent = async (req, res, next) => {

    const back = `/crm/contacts/${req.params.id}`;

    try {

        const contact = await contactService.findById(req.params.id);

        if (!contact) {
            return res.redirect("/crm/contacts");
        }

        const granted = req.body.consent === "granted";
        const source = req.body.source === "customer" ? "customer" : "crm";

        try {

            await marketingService.setConsent(contact._id, granted, {
                source,
                by: staffName(req),
                note: req.body.note
            });

            setFlash(
                req,
                "success",
                granted
                    ? (source === "customer" ? "Als Bestandskunde für Informationen eingetragen." : "Einwilligung erfasst.")
                    : "Einwilligung widerrufen – der Kontakt erhält keine Kampagnen mehr."
            );

        } catch (err) {

            if (!err.status) throw err;

            setFlash(req, "danger", err.message);

        }

        res.redirect(safeRedirectTarget(req.body.returnTo, back));

    } catch (err) {

        next(err);

    }

};

/**
 * Bestätigungs-E-Mail (Double-Opt-In) an den Kontakt schicken
 */
exports.requestDoubleOptIn = async (req, res) => {

    try {

        const { contact, result } = await marketingService.requestDoubleOptIn(req.params.id, { by: staffName(req) });

        if (result.sent) {
            setFlash(req, "success", `Bestätigungs-E-Mail an ${contact.email} verschickt. Der Link gilt ${marketingService.DOI_VALID_DAYS} Tage.`);
        } else {
            setFlash(req, "warning", `Bestätigungs-E-Mail nicht verschickt: ${result.skipped || "unbekannter Grund"}.`);
        }

    } catch (err) {

        // Fachliche Gründe (bereits eingewilligt, keine Adresse) oder Mailserver-Fehler
        setFlash(req, "danger", err.status ? err.message : `Bestätigungs-E-Mail fehlgeschlagen: ${err.message}`);

    }

    res.redirect(`/crm/contacts/${req.params.id}`);

};
