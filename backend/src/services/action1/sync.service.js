"use strict";

// ----------------------------------------------------
// Action1 -> Assets synchronisieren
// ----------------------------------------------------
//
// Für jede Firma, die mit einer Action1-Organisation verknüpft ist:
//
//   1. Alle verwalteten Endpoints der Organisation laden.
//   2. Je Endpoint das passende Asset suchen:
//        a) über die Action1-Endpoint-ID
//        b) sonst ein von Hand angelegtes Asset derselben Firma mit
//           gleicher Seriennummer (wird dann mit Action1 verknüpft)
//        c) sonst ein neues Asset anlegen
//   3. Technische Felder aktualisieren. Im CRM gepflegte Felder (Typ,
//      Status, Ansprechpartner, Kaufdatum, Garantie, Inventarnummer,
//      Notizen) bleiben unverändert.
//   4. Action1-Assets der Organisation, die nicht mehr geliefert wurden,
//      als "nicht mehr in Action1" markieren. Gelöscht wird nichts.
//
// Im CRM gelöschte Assets werden nicht wiederhergestellt. So lässt sich
// ein Gerät, das nicht ins CRM gehört, dauerhaft ausblenden.
//
// Ein Fehler bei einer Organisation stoppt den Lauf nicht; er wird im
// Protokoll (SyncRun) vermerkt.

const { getSharedClient, isConfigured } = require("./client");
const { mapEndpoint, guessType } = require("./mapping");

let running = false;

// ----------------------------------------------------
// Datenzugriff (für Tests austauschbar)
// ----------------------------------------------------

function mongooseRepo() {

    const Company = require("../../models/company.model");
    const Asset = require("../../models/asset.model");
    const SyncRun = require("../../models/syncRun.model");
    const counterService = require("../counter.service");

    return {

        findMappedCompanies() {
            return Company.find(
                {
                    isDeleted: false,
                    "action1.organizationId": { $type: "string", $ne: "" }
                },
                "companyName action1"
            ).lean();
        },

        findAssetByEndpoint(endpointId) {
            return Asset.findOne({ "action1.endpointId": endpointId }).lean();
        },

        findLinkableAsset(companyId, serialNumber) {
            return Asset.findOne({
                company: companyId,
                isDeleted: false,
                serialNumber,
                "action1.endpointId": { $not: { $type: "string" } }
            }).lean();
        },

        async createAsset(doc) {
            const assetNumber = await counterService.next("asset", "AST");
            return Asset.create({ ...doc, assetNumber });
        },

        updateAsset(id, set) {
            return Asset.updateOne({ _id: id }, { $set: set }, { runValidators: true });
        },

        async markMissing(organizationId, seenEndpointIds, companyId) {
            const result = await Asset.updateMany(
                {
                    isDeleted: false,
                    company: companyId,
                    "action1.organizationId": organizationId,
                    "action1.endpointId": { $type: "string", $nin: seenEndpointIds },
                    "action1.missing": { $ne: true }
                },
                { $set: { "action1.missing": true } }
            );
            return result.modifiedCount || 0;
        },

        startRun(data) {
            return SyncRun.create(data);
        },

        finishRun(id, data) {
            return SyncRun.updateOne({ _id: id }, { $set: data });
        }

    };

}

// ----------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------

/**
 * $set-Objekt für ein bestehendes Asset. Leere Werte aus Action1
 * überschreiben keine vorhandenen Angaben im CRM.
 */
function buildUpdate(mapped, companyId) {

    const set = { company: companyId };

    for (const [key, value] of Object.entries(mapped)) {

        if (key === "action1") continue;

        if (value !== null && value !== undefined && value !== "") {
            set[key] = value;
        }

    }

    // Der Action1-Block wird immer komplett ersetzt. (Einzelne Pfade wie
    // "action1.status" würden bei bisher manuellen Assets mit action1 = null
    // in MongoDB fehlschlagen.)
    set.action1 = { ...mapped.action1 };

    return set;

}

function buildNewAsset(mapped, companyId) {

    return {
        ...mapped,
        company: companyId,
        source: "action1",
        status: "active",
        type: guessType({
            operatingSystem: mapped.operatingSystem,
            manufacturer: mapped.manufacturer,
            model: mapped.model,
            platform: mapped.action1.platform
        }),
        isDeleted: false
    };

}

/**
 * Zählt die Geräte in Action1-Organisationen ohne Firmenzuordnung, damit
 * das Dashboard "gesamt / davon zugeordnet" zeigen kann.
 */
async function countUnmapped({ client, mappedOrgIds, perOrg, failures }) {

    if (typeof client.listOrganizations !== "function" || typeof client.countEndpoints !== "function") {
        return null;
    }

    let organizations;

    try {
        organizations = await client.listOrganizations();
    } catch (err) {
        failures.push({ organizationId: null, company: null, message: `Organisationen nicht abrufbar: ${err.message}` });
        return null;
    }

    let unmapped = 0;
    const names = new Map();

    for (const org of organizations) {

        if (!org || !org.id) continue;

        const id = String(org.id);

        names.set(id, org.name || id);

        if (mappedOrgIds.has(id)) continue;

        try {

            const count = await client.countEndpoints(id);

            unmapped += count;
            perOrg.push({ id, name: org.name || id, endpoints: count, mapped: false });

        } catch (err) {

            failures.push({ organizationId: id, company: null, message: `Geräte nicht zählbar (${org.name || id}): ${err.message}` });
            return null;

        }

    }

    // Namen für die zugeordneten Organisationen nachtragen
    for (const entry of perOrg) {
        if (entry.mapped && names.has(entry.id)) entry.name = names.get(entry.id);
    }

    return unmapped;

}

async function syncCompany({ client, repo, company, stats, now }) {

    const organizationId = company.action1.organizationId;
    const endpoints = await client.listEndpoints(organizationId);

    const before = stats.endpoints;

    const seen = [];

    for (const endpoint of endpoints) {

        if (!endpoint || !endpoint.id) {
            stats.skipped++;
            continue;
        }

        stats.endpoints++;

        const mapped = mapEndpoint(endpoint, organizationId, now);
        const endpointId = mapped.action1.endpointId;

        seen.push(endpointId);

        const existing = await repo.findAssetByEndpoint(endpointId);

        if (existing) {

            if (existing.isDeleted) {
                stats.skipped++;
                continue;
            }

            await repo.updateAsset(existing._id, buildUpdate(mapped, company._id));
            stats.updated++;
            continue;

        }

        if (mapped.serialNumber) {

            const manual = await repo.findLinkableAsset(company._id, mapped.serialNumber);

            if (manual) {

                await repo.updateAsset(manual._id, {
                    ...buildUpdate(mapped, company._id),
                    source: "action1"
                });

                stats.linked++;
                continue;

            }

        }

        await repo.createAsset(buildNewAsset(mapped, company._id));
        stats.created++;

    }

    stats.missing += await repo.markMissing(organizationId, seen, company._id);

    return stats.endpoints - before;

}

// ----------------------------------------------------
// Öffentliche Funktionen
// ----------------------------------------------------

function isRunning() {
    return running;
}

/**
 * Führt einen kompletten Sync aus und gibt das Protokoll zurück.
 *
 * @param {object} [options]
 * @param {"manual"|"schedule"} [options.trigger]
 * @param {string} [options.userId]
 * @param {object} [options.client]  Action1-Client (Tests)
 * @param {object} [options.repo]    Datenzugriff (Tests)
 */
async function runSync(options = {}) {

    if (running) {
        const err = new Error("Es läuft bereits eine Synchronisation.");
        err.status = 409;
        throw err;
    }

    if (!options.client && !isConfigured()) {
        const err = new Error("Action1 ist nicht konfiguriert. Bitte ACTION1_CLIENT_ID und ACTION1_CLIENT_SECRET in der .env setzen.");
        err.status = 400;
        throw err;
    }

    running = true;

    const repo = options.repo || mongooseRepo();
    const now = options.now || new Date();

    const stats = {
        organizations: 0,
        endpoints: 0,
        created: 0,
        updated: 0,
        linked: 0,
        missing: 0,
        skipped: 0,
        action1Total: null,
        unmapped: null
    };

    const failures = [];
    const perOrg = [];

    let run = null;

    try {

        run = await repo.startRun({
            provider: "action1",
            trigger: options.trigger || "manual",
            startedBy: options.userId || null,
            startedAt: now
        });

        const client = options.client || getSharedClient();
        const companies = await repo.findMappedCompanies();

        for (const company of companies) {

            try {

                const count = await syncCompany({ client, repo, company, stats, now });

                stats.organizations++;

                perOrg.push({
                    id: company.action1.organizationId,
                    name: company.action1.organizationName || company.companyName,
                    endpoints: count,
                    mapped: true
                });

            } catch (err) {

                failures.push({
                    organizationId: company.action1.organizationId,
                    company: company.companyName,
                    message: err.message
                });

            }

        }

        const mappedOrgIds = new Set(companies.map((c) => String(c.action1.organizationId)));
        const unmapped = await countUnmapped({ client, mappedOrgIds, perOrg, failures });

        // Gesamtzahl nur, wenn alle Organisationen gezählt werden konnten
        if (unmapped !== null && perOrg.filter((o) => o.mapped).length === companies.length) {
            stats.unmapped = unmapped;
            stats.action1Total = stats.endpoints + unmapped;
        }

    } catch (err) {

        failures.push({ organizationId: null, company: null, message: err.message });

    } finally {

        running = false;

    }

    const result = {
        finishedAt: new Date(),
        ok: failures.length === 0,
        stats,
        failures,
        organizations: perOrg
    };

    if (run) {

        try {
            await repo.finishRun(run._id, result);
        } catch (err) {
            console.error("Action1-Sync: Protokoll konnte nicht gespeichert werden:", err.message);
        }

    }

    return { ...result, startedAt: now };

}

module.exports = {
    runSync,
    isRunning,
    buildUpdate,
    buildNewAsset
};
