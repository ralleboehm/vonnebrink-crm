const mongoose = require("mongoose");

const companyService = require("../../services/company.service");
const assetService = require("../../services/asset.service");
const action1Client = require("../../services/action1/client");
const syncService = require("../../services/action1/sync.service");
const SyncRun = require("../../models/syncRun.model");
const labels = require("../../utils/assetLabels");

function setFlash(req, type, text) {
    req.session.flash = { type, text };
}

function takeFlash(req) {

    const flash = req.session.flash || null;

    delete req.session.flash;

    return flash;

}

/**
 * Action1: Status, Organisationen, Zuordnung, letzte Syncs
 */
exports.action1 = async (req, res, next) => {

    try {

        const configured = action1Client.isConfigured();
        const config = action1Client.configFromEnv();

        const running = syncService.isRunning();

        let organizations = [];
        let apiError = null;

        // Während eines Syncs keine zusätzlichen Anfragen an Action1 stellen
        // (die Seite lädt sich dann alle 5 Sekunden neu).
        if (configured && !running) {

            try {

                organizations = (await action1Client.getSharedClient().listOrganizations())
                    .filter((org) => org && org.id)
                    .map((org) => ({ id: String(org.id), name: org.name || String(org.id), description: org.description || "" }))
                    .sort((a, b) => a.name.localeCompare(b.name, "de"));

            } catch (err) {

                apiError = err.message;

            }

        }

        const [companies, mapped, runs, summary] = await Promise.all([
            companyService.getAll(),
            companyService.getAction1Mapped(),
            SyncRun.find({ provider: "action1" })
                .sort({ startedAt: -1 })
                .limit(10)
                .populate("startedBy", "firstName lastName")
                .lean(),
            assetService.summary()
        ]);

        // Organisation -> Firma
        const companyByOrg = {};

        for (const company of mapped) {
            companyByOrg[company.action1.organizationId] = company;
        }

        // Verknüpfungen zu Organisationen, die Action1 nicht mehr liefert
        const orgIds = new Set(organizations.map((o) => o.id));
        const orphaned = apiError || running ? [] : mapped.filter((c) => !orgIds.has(c.action1.organizationId));

        res.render("integrations/action1", {
            title: "Action1",
            configured,
            baseUrl: config.baseUrl,
            syncInterval: parseInt(process.env.ACTION1_SYNC_INTERVAL_MINUTES, 10) || 0,
            organizations,
            apiError,
            companies,
            companyByOrg,
            orphaned,
            runs,
            summary,
            running,
            flash: takeFlash(req),
            labels
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Zuordnung speichern
 */
exports.saveAction1Mapping = async (req, res, next) => {

    try {

        const mapping = req.body.mapping && typeof req.body.mapping === "object" ? req.body.mapping : {};
        const names = req.body.orgName && typeof req.body.orgName === "object" ? req.body.orgName : {};

        // Schlüssel haben das Präfix "o_", damit der Formular-Parser rein
        // numerische IDs nicht als Array-Index behandelt.
        const entries = Object.entries(mapping)
            .filter(([key]) => key.startsWith("o_") && key.length > 2)
            .map(([key, companyId]) => ({
                organizationId: key.slice(2, 102),
                organizationName: typeof names[key] === "string" ? names[key].slice(0, 255) : null,
                companyId: typeof companyId === "string" && mongoose.isValidObjectId(companyId) ? companyId : null
            }));

        // Eine Firma darf nur einer Organisation zugeordnet sein
        const used = entries.filter((e) => e.companyId).map((e) => e.companyId);
        const duplicates = used.filter((id, i) => used.indexOf(id) !== i);

        if (duplicates.length) {

            setFlash(req, "danger", "Eine Firma kann nur mit einer Action1-Organisation verknüpft werden. Nichts gespeichert.");

            return res.redirect("/crm/integrations/action1");

        }

        await companyService.saveAction1Mapping(entries);

        setFlash(req, "success", "Zuordnung gespeichert. Starten Sie jetzt die Synchronisation, um die Geräte zu übernehmen.");

        res.redirect("/crm/integrations/action1");

    } catch (err) {

        next(err);

    }

};

/**
 * Sync starten (läuft im Hintergrund weiter)
 */
exports.runAction1Sync = async (req, res, next) => {

    try {

        if (syncService.isRunning()) {

            setFlash(req, "warning", "Es läuft bereits eine Synchronisation.");

            return res.redirect("/crm/integrations/action1");

        }

        if (!action1Client.isConfigured()) {

            setFlash(req, "danger", "Action1 ist nicht konfiguriert.");

            return res.redirect("/crm/integrations/action1");

        }

        syncService
            .runSync({ trigger: "manual", userId: req.session.user.id })
            .catch((err) => console.error("❌ Action1-Sync fehlgeschlagen:", err.message));

        setFlash(req, "info", "Synchronisation gestartet. Die Seite aktualisiert sich automatisch.");

        res.redirect("/crm/integrations/action1");

    } catch (err) {

        next(err);

    }

};
