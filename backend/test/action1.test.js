"use strict";

// Tests für die Action1-Anbindung (Client, Feldzuordnung, Sync).
// Keine Datenbank, kein Netzwerk: fetch und Datenzugriff sind Attrappen.
//
// Ausführen mit:  node --test test/action1.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const client = require("../src/services/action1/client");
const mapping = require("../src/services/action1/mapping");
const sync = require("../src/services/action1/sync.service");
const labels = require("../src/utils/assetLabels");

// ----------------------------------------------------
// Beispiel-Endpoint (Feldnamen wie in der Action1-API 3.0, fields=*)
// ----------------------------------------------------

function sampleEndpoint(overrides = {}) {

    return {
        id: "ep-1",
        type: "Endpoint",
        self: "https://app.action1.com/api/3.0/endpoints/managed/org-1/ep-1",
        name: "PC-EMPFANG",
        OS: "Windows 11 Pro",
        platform: "Windows_64",
        address: "192.168.10.23",
        external_address: "84.12.34.56",
        status: "Connected",
        last_seen: "2026-10-08_07-15-00",
        user: "EMPFANG\\anna",
        comment: "Empfangstresen",
        agent_version: "5.290.721.1",
        serial: "5CG1234XYZ",
        manufacturer: "HP",
        MAC: "00:11:22:33:44:55",
        CPU_name: "Intel(R) Core(TM) i5-1235U",
        CPU_size: "1x1.3 GHz, 10/12 Cores",
        RAM: "16Gb DDR4",
        disk: "512Gb NVMe",
        last_boot_time: "2026-10-07_06-01-00",
        missing_critical_updates: "2",
        missing_other_updates: 5,
        ...overrides
    };

}

// ----------------------------------------------------
// Mapping
// ----------------------------------------------------

test("mapEndpoint übernimmt die Action1-Felder", () => {

    const syncedAt = new Date("2026-10-08T08:00:00Z");
    const mapped = mapping.mapEndpoint(sampleEndpoint(), "org-1", syncedAt);

    assert.equal(mapped.name, "PC-EMPFANG");
    assert.equal(mapped.operatingSystem, "Windows 11 Pro");
    assert.equal(mapped.serialNumber, "5CG1234XYZ");
    assert.equal(mapped.manufacturer, "HP");
    assert.equal(mapped.cpu, "Intel(R) Core(TM) i5-1235U · 1x1.3 GHz, 10/12 Cores");
    assert.equal(mapped.ram, "16Gb DDR4");
    assert.equal(mapped.ipAddress, "192.168.10.23");
    assert.equal(mapped.externalIp, "84.12.34.56");
    assert.equal(mapped.macAddress, "00:11:22:33:44:55");
    assert.equal(mapped.lastUser, "EMPFANG\\anna");
    assert.equal(mapped.model, null);

    assert.equal(mapped.action1.endpointId, "ep-1");
    assert.equal(mapped.action1.organizationId, "org-1");
    assert.equal(mapped.action1.online, true);
    assert.equal(mapped.action1.missingCriticalUpdates, 2);
    assert.equal(mapped.action1.missingOtherUpdates, 5);
    assert.equal(mapped.action1.lastSeen.toISOString(), "2026-10-08T07:15:00.000Z");
    assert.equal(mapped.action1.lastBootTime.toISOString(), "2026-10-07T06:01:00.000Z");
    assert.equal(mapped.action1.missing, false);
    assert.equal(mapped.action1.lastSyncedAt, syncedAt);

});

test("Platzhalter-Seriennummern werden verworfen", () => {

    for (const value of ["0", "To be filled by O.E.M.", "Default string", "0000000", "System Serial Number", ""]) {
        assert.equal(mapping.cleanSerial(value), null, value);
    }

    assert.equal(mapping.cleanSerial(" PF3ABCD "), "PF3ABCD");

});

test("parseDate versteht verschiedene Formate", () => {

    assert.equal(mapping.parseDate("2024-05-08_14-25-31").toISOString(), "2024-05-08T14:25:31.000Z");
    assert.equal(mapping.parseDate("2024-05-08T14:25:31Z").toISOString(), "2024-05-08T14:25:31.000Z");
    assert.equal(mapping.parseDate(1715178331).toISOString(), "2024-05-08T14:25:31.000Z");
    assert.equal(mapping.parseDate("unbekannt"), null);
    assert.equal(mapping.parseDate(null), null);

});

test("parseOnline und parseBool", () => {

    assert.equal(mapping.parseOnline("Connected"), true);
    assert.equal(mapping.parseOnline("Disconnected"), false);
    assert.equal(mapping.parseOnline("Pending"), null);

    assert.equal(mapping.parseBool("Yes"), true);
    assert.equal(mapping.parseBool("No"), false);
    assert.equal(mapping.parseBool(undefined), null);

});

test("Feldnamen werden auch in anderer Schreibweise gefunden", () => {

    const mapped = mapping.mapEndpoint({ id: "x", os: "Ubuntu 24.04", mac: "aa:bb", ram: "8Gb" }, "org");

    assert.equal(mapped.operatingSystem, "Ubuntu 24.04");
    assert.equal(mapped.macAddress, "aa:bb");
    assert.equal(mapped.ram, "8Gb");
    assert.equal(mapped.name, "x");

});

test("guessType erkennt Server, VMs und Notebooks", () => {

    assert.equal(mapping.guessType({ operatingSystem: "Windows Server 2022 Standard" }), "server");
    assert.equal(mapping.guessType({ operatingSystem: "Windows 11 Pro", manufacturer: "VMware, Inc." }), "virtual_machine");
    assert.equal(mapping.guessType({ operatingSystem: "Windows 11 Pro", manufacturer: "Microsoft Corporation", model: "Virtual Machine" }), "virtual_machine");
    assert.equal(mapping.guessType({ operatingSystem: "Windows 11 Pro", manufacturer: "HP", model: "HP EliteBook 840 G9" }), "laptop");
    assert.equal(mapping.guessType({ operatingSystem: "Windows 11 Pro", manufacturer: "Lenovo", model: "ThinkPad T14" }), "laptop");
    assert.equal(mapping.guessType({ operatingSystem: "Windows 11 Pro", manufacturer: "Dell", model: "OptiPlex 7010" }), "workstation");

});

// ----------------------------------------------------
// Client
// ----------------------------------------------------

function jsonResponse(status, body) {

    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body)
    };

}

function fakeApi({ endpoints = [], organizations = [], failFirstGetWith401 = false } = {}) {

    const calls = [];
    let tokenCount = 0;
    let rejected = false;

    const fetch = async (url, init) => {

        const u = new URL(url);

        calls.push({ method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: init.headers, body: init.body });

        if (u.pathname.endsWith("/oauth2/token")) {
            tokenCount++;
            return jsonResponse(200, { access_token: `token-${tokenCount}`, expires_in: 3600, token_type: "bearer" });
        }

        if (failFirstGetWith401 && !rejected) {
            rejected = true;
            return jsonResponse(401, { message: "expired" });
        }

        const list = u.pathname.endsWith("/organizations") ? organizations : endpoints;
        const from = Number(u.searchParams.get("from") || 0);
        const limit = Number(u.searchParams.get("limit") || 50);

        return jsonResponse(200, {
            type: "ResultPage",
            items: list.slice(from, from + limit),
            total_items: list.length,
            limit
        });

    };

    return { fetch, calls, tokens: () => tokenCount };

}

test("Client: Anmeldung als Formular, Token wird wiederverwendet", async () => {

    const api = fakeApi({ organizations: [{ id: "o1", name: "Kunde A" }] });

    const c = client.createClient({
        baseUrl: "https://app.eu.action1.com",
        clientId: "id",
        clientSecret: "geheim",
        fetch: api.fetch,
        minIntervalMs: 0
    });

    assert.equal(c.baseUrl, "https://app.eu.action1.com/api/3.0");

    await c.listOrganizations();
    await c.listOrganizations();

    assert.equal(api.tokens(), 1);

    const tokenCall = api.calls[0];

    assert.equal(tokenCall.path, "/api/3.0/oauth2/token");
    assert.equal(tokenCall.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.equal(tokenCall.body, "client_id=id&client_secret=geheim");

    assert.equal(api.calls[1].headers.Authorization, "Bearer token-1");

});

test("Client: lädt alle Seiten und fragt fields=* an", async () => {

    const endpoints = Array.from({ length: 120 }, (_, i) => ({ id: `ep-${i}` }));
    const api = fakeApi({ endpoints });

    const c = client.createClient({ clientId: "id", clientSecret: "s", fetch: api.fetch, minIntervalMs: 0 });

    const result = await c.listEndpoints("org 1");

    assert.equal(result.length, 120);

    const pages = api.calls.filter((call) => call.path.includes("/endpoints/managed/"));

    assert.equal(pages.length, 3);
    assert.equal(pages[0].path, "/api/3.0/endpoints/managed/org%201");
    assert.deepEqual(pages.map((p) => p.query.from), ["0", "50", "100"]);
    assert.equal(pages[0].query.fields, "*");

});

test("Client: meldet sich bei 401 einmal neu an", async () => {

    const api = fakeApi({ organizations: [{ id: "o1" }], failFirstGetWith401: true });

    const c = client.createClient({ clientId: "id", clientSecret: "s", fetch: api.fetch, minIntervalMs: 0 });

    const orgs = await c.listOrganizations();

    assert.equal(orgs.length, 1);
    assert.equal(api.tokens(), 2);

});

test("Client: verständliche Fehlermeldung bei falschen Zugangsdaten", async () => {

    const fetch = async () => jsonResponse(401, { error: "invalid_client" });

    const c = client.createClient({ clientId: "id", clientSecret: "falsch", fetch, minIntervalMs: 0 });

    await assert.rejects(c.listOrganizations(), (err) => {
        assert.equal(err.name, "Action1Error");
        assert.match(err.message, /Anmeldung bei Action1 fehlgeschlagen: HTTP 401 – invalid_client/);
        assert.match(err.message, /API-Schlüssel/);
        return true;
    });

});

test("Client: hält den Mindestabstand zwischen Anfragen ein", async () => {

    const api = fakeApi({ organizations: [{ id: "o1" }] });

    let clock = 1000;
    const waits = [];

    const c = client.createClient({
        clientId: "id",
        clientSecret: "s",
        fetch: api.fetch,
        minIntervalMs: 2100,
        now: () => clock,
        sleep: async (ms) => { waits.push(ms); clock += ms; }
    });

    await c.listOrganizations();   // Token + 1 Seite

    assert.deepEqual(waits, [2100]);

});

test("Client: ohne Zugangsdaten gibt es einen klaren Fehler", () => {

    assert.throws(
        () => client.createClient({ clientId: "", clientSecret: "" }),
        /nicht konfiguriert/
    );

    assert.equal(client.isConfigured({}), false);
    assert.equal(client.isConfigured({ ACTION1_CLIENT_ID: "a", ACTION1_CLIENT_SECRET: "b" }), true);
    assert.equal(client.normalizeBaseUrl("https://app.action1.com/"), "https://app.action1.com/api/3.0");
    assert.equal(client.normalizeBaseUrl("https://app.action1.com/api/3.0/"), "https://app.action1.com/api/3.0");

});

// ----------------------------------------------------
// Sync mit Attrappe für den Datenzugriff
// ----------------------------------------------------

function memoryRepo({ companies, assets = [] }) {

    let counter = assets.length;
    const runs = [];

    const repo = {

        assets,
        runs,

        async findMappedCompanies() {
            return companies.filter((c) => c.action1 && c.action1.organizationId);
        },

        async findAssetByEndpoint(endpointId) {
            return assets.find((a) => a.action1 && a.action1.endpointId === endpointId) || null;
        },

        async findLinkableAsset(companyId, serialNumber) {
            return assets.find((a) =>
                a.company === companyId && !a.isDeleted && a.serialNumber === serialNumber &&
                !(a.action1 && a.action1.endpointId)
            ) || null;
        },

        async createAsset(doc) {
            counter++;
            const asset = { _id: `a${counter}`, assetNumber: `AST-${String(counter).padStart(6, "0")}`, ...doc };
            assets.push(asset);
            return asset;
        },

        async updateAsset(id, set) {
            Object.assign(assets.find((a) => a._id === id), set);
        },

        async markMissing(organizationId, seen, companyId) {
            let n = 0;
            for (const a of assets) {
                if (!a.isDeleted && a.company === companyId && a.action1 && a.action1.organizationId === organizationId &&
                    a.action1.endpointId && !seen.includes(a.action1.endpointId) && !a.action1.missing) {
                    a.action1.missing = true;
                    n++;
                }
            }
            return n;
        },

        async startRun(data) {
            const run = { _id: `r${runs.length + 1}`, ...data };
            runs.push(run);
            return run;
        },

        async finishRun(id, data) {
            Object.assign(runs.find((r) => r._id === id), data);
        }

    };

    return repo;

}

function fakeClient(byOrg) {

    return {
        async listEndpoints(orgId) {
            if (byOrg[orgId] instanceof Error) throw byOrg[orgId];
            return byOrg[orgId] || [];
        }
    };

}

test("Sync legt neue Assets an und schätzt den Typ", async () => {

    const repo = memoryRepo({
        companies: [{ _id: "c1", companyName: "Kunde A", action1: { organizationId: "org-1" } }]
    });

    const result = await sync.runSync({
        repo,
        client: fakeClient({
            "org-1": [
                sampleEndpoint(),
                sampleEndpoint({ id: "ep-2", name: "SRV-DC01", OS: "Windows Server 2022 Standard", serial: "VMware-56 4d" , manufacturer: "VMware, Inc." })
            ]
        })
    });

    assert.equal(result.ok, true);
    assert.deepEqual(
        { created: result.stats.created, updated: result.stats.updated, endpoints: result.stats.endpoints },
        { created: 2, updated: 0, endpoints: 2 }
    );

    const [pc, server] = repo.assets;

    assert.equal(pc.company, "c1");
    assert.equal(pc.source, "action1");
    assert.equal(pc.status, "active");
    assert.equal(pc.type, "workstation");
    assert.equal(server.type, "server");

    assert.equal(repo.runs[0].ok, true);
    assert.ok(repo.runs[0].finishedAt);

});

test("Sync aktualisiert nur technische Felder und lässt CRM-Daten in Ruhe", async () => {

    const repo = memoryRepo({
        companies: [{ _id: "c1", companyName: "Kunde A", action1: { organizationId: "org-1" } }],
        assets: [{
            _id: "a1",
            company: "c1",
            name: "ALTER-NAME",
            type: "laptop",
            status: "repair",
            notes: "Akku getauscht",
            warrantyUntil: new Date("2027-01-01"),
            model: "EliteBook 840 G9",
            source: "action1",
            isDeleted: false,
            action1: { endpointId: "ep-1", organizationId: "org-1", missing: true }
        }]
    });

    const result = await sync.runSync({ repo, client: fakeClient({ "org-1": [sampleEndpoint()] }) });

    assert.equal(result.stats.updated, 1);
    assert.equal(result.stats.created, 0);

    const asset = repo.assets[0];

    assert.equal(asset.name, "PC-EMPFANG");
    assert.equal(asset.operatingSystem, "Windows 11 Pro");
    assert.equal(asset.type, "laptop");
    assert.equal(asset.status, "repair");
    assert.equal(asset.notes, "Akku getauscht");
    assert.equal(asset.model, "EliteBook 840 G9", "leeres Feld aus Action1 überschreibt nichts");
    assert.equal(asset.action1.missing, false);
    assert.equal(asset.action1.missingCriticalUpdates, 2);

});

test("Sync verknüpft ein manuelles Asset über die Seriennummer", async () => {

    const repo = memoryRepo({
        companies: [{ _id: "c1", companyName: "Kunde A", action1: { organizationId: "org-1" } }],
        assets: [{
            _id: "a1", company: "c1", name: "Empfang", type: "workstation", status: "active",
            serialNumber: "5CG1234XYZ", source: "manual", isDeleted: false, action1: null,
            purchaseDate: new Date("2024-03-01")
        }]
    });

    const result = await sync.runSync({ repo, client: fakeClient({ "org-1": [sampleEndpoint()] }) });

    assert.equal(result.stats.linked, 1);
    assert.equal(result.stats.created, 0);
    assert.equal(repo.assets.length, 1);

    const asset = repo.assets[0];

    assert.equal(asset.source, "action1");
    assert.equal(asset.action1.endpointId, "ep-1");
    assert.equal(asset.purchaseDate.toISOString().slice(0, 10), "2024-03-01");

});

test("Sync markiert verschwundene Geräte und legt gelöschte nicht neu an", async () => {

    const repo = memoryRepo({
        companies: [{ _id: "c1", companyName: "Kunde A", action1: { organizationId: "org-1" } }],
        assets: [
            { _id: "a1", company: "c1", name: "ALT", source: "action1", isDeleted: false, action1: { endpointId: "ep-old", organizationId: "org-1", missing: false } },
            { _id: "a2", company: "c1", name: "AUSGEBLENDET", source: "action1", isDeleted: true, action1: { endpointId: "ep-1", organizationId: "org-1" } }
        ]
    });

    const result = await sync.runSync({ repo, client: fakeClient({ "org-1": [sampleEndpoint()] }) });

    assert.equal(result.stats.missing, 1);
    assert.equal(result.stats.skipped, 1);
    assert.equal(result.stats.created, 0);
    assert.equal(repo.assets[0].action1.missing, true);
    assert.equal(repo.assets[1].name, "AUSGEBLENDET");

});

test("Ein Fehler bei einer Organisation stoppt die anderen nicht", async () => {

    const repo = memoryRepo({
        companies: [
            { _id: "c1", companyName: "Kunde A", action1: { organizationId: "org-1" } },
            { _id: "c2", companyName: "Kunde B", action1: { organizationId: "org-2" } }
        ]
    });

    const result = await sync.runSync({
        repo,
        client: fakeClient({
            "org-1": new Error("HTTP 403"),
            "org-2": [sampleEndpoint({ id: "ep-9" })]
        })
    });

    assert.equal(result.ok, false);
    assert.equal(result.stats.created, 1);
    assert.equal(result.stats.organizations, 1);
    assert.deepEqual(result.failures, [{ organizationId: "org-1", company: "Kunde A", message: "HTTP 403" }]);
    assert.equal(repo.runs[0].ok, false);

});

test("Es läuft immer nur ein Sync gleichzeitig", async () => {

    let release;
    const gate = new Promise((resolve) => { release = resolve; });

    const repo = memoryRepo({ companies: [{ _id: "c1", companyName: "A", action1: { organizationId: "org-1" } }] });

    const slowClient = { async listEndpoints() { await gate; return []; } };

    const first = sync.runSync({ repo, client: slowClient });

    assert.equal(sync.isRunning(), true);
    await assert.rejects(sync.runSync({ repo, client: slowClient }), /bereits/);

    release();
    await first;

    assert.equal(sync.isRunning(), false);

});

// ----------------------------------------------------
// Anzeige-Helfer
// ----------------------------------------------------

test("assetLabels: Zeitangaben und Garantie", () => {

    const now = new Date("2026-10-08T12:00:00Z");

    assert.equal(labels.timeAgo(new Date("2026-10-08T11:55:00Z"), now), "vor 5 Min.");
    assert.equal(labels.timeAgo(new Date("2026-10-08T09:00:00Z"), now), "vor 3 Std.");
    assert.equal(labels.timeAgo(new Date("2026-10-06T12:00:00Z"), now), "vor 2 Tagen");

    assert.equal(labels.warrantyState(new Date("2026-01-01"), now), "expired");
    assert.equal(labels.warrantyState(new Date("2026-11-01"), now), "soon");
    assert.equal(labels.warrantyState(new Date("2028-01-01"), now), "ok");
    assert.equal(labels.warrantyState(null, now), null);

    assert.equal(labels.dateInputValue(new Date("2026-03-05T00:00:00Z")), "2026-03-05");

});

// ----------------------------------------------------
// Gesamtzahl / nicht zugeordnete Organisationen
// ----------------------------------------------------

function clientWithOrgs(byOrg, orgs, failCount = null) {

    return {
        ...fakeClient(byOrg),
        async listOrganizations() { return orgs; },
        async countEndpoints(id) {
            if (id === failCount) throw new Error("HTTP 500");
            return (byOrg[id] || []).length;
        }
    };

}

test("Sync zählt Geräte in Organisationen ohne Firma mit", async () => {

    const repo = memoryRepo({
        companies: [{ _id: "c1", companyName: "Kunde A", action1: { organizationId: "org-1", organizationName: "Org A" } }]
    });

    const result = await sync.runSync({
        repo,
        client: clientWithOrgs(
            {
                "org-1": [sampleEndpoint()],
                "org-2": [sampleEndpoint({ id: "x1" }), sampleEndpoint({ id: "x2" })]
            },
            [{ id: "org-1", name: "Org A" }, { id: "org-2", name: "Org B" }]
        )
    });

    assert.equal(result.ok, true);
    assert.equal(result.stats.endpoints, 1);
    assert.equal(result.stats.unmapped, 2);
    assert.equal(result.stats.action1Total, 3);
    assert.deepEqual(result.organizations, [
        { id: "org-1", name: "Org A", endpoints: 1, mapped: true },
        { id: "org-2", name: "Org B", endpoints: 2, mapped: false }
    ]);
    assert.equal(repo.runs[0].stats.action1Total, 3);

});

test("Ohne vollständige Zählung gibt es keine Gesamtzahl", async () => {

    const repo = memoryRepo({
        companies: [{ _id: "c1", companyName: "Kunde A", action1: { organizationId: "org-1" } }]
    });

    const result = await sync.runSync({
        repo,
        client: clientWithOrgs(
            { "org-1": [sampleEndpoint()] },
            [{ id: "org-1" }, { id: "org-2", name: "Org B" }],
            "org-2"
        )
    });

    assert.equal(result.ok, false);
    assert.equal(result.stats.action1Total, null);
    assert.equal(result.stats.created, 1, "die Geräte der zugeordneten Firma werden trotzdem übernommen");
    assert.match(result.failures[0].message, /Org B/);

});

test("Client: countEndpoints nutzt total_items mit nur einer Anfrage", async () => {

    const endpoints = Array.from({ length: 7 }, (_, i) => ({ id: `e${i}` }));
    const api = fakeApi({ endpoints });

    const c = client.createClient({ clientId: "id", clientSecret: "s", fetch: api.fetch, minIntervalMs: 0 });

    assert.equal(await c.countEndpoints("org-1"), 7);

    const gets = api.calls.filter((call) => call.method === "GET");

    assert.equal(gets.length, 1);
    assert.equal(gets[0].query.limit, "1");

});

test("coverageFrom: gesamt und zugeordnet", () => {

    const { coverageFrom } = require("../src/utils/action1Coverage");

    assert.equal(coverageFrom(null), null);
    assert.equal(coverageFrom({ stats: { endpoints: 3, action1Total: null } }), null);

    const c = coverageFrom({
        startedAt: new Date(),
        stats: { endpoints: 3, action1Total: 4 },
        organizations: [
            { id: "a", name: "A", endpoints: 3, mapped: true },
            { id: "b", name: "Leer", endpoints: 0, mapped: false },
            { id: "c", name: "C", endpoints: 1, mapped: false }
        ]
    });

    assert.equal(c.total, 4);
    assert.equal(c.assigned, 3);
    assert.equal(c.unassigned, 1);
    assert.equal(c.percent, 75);
    assert.deepEqual(c.unmappedOrgs.map((o) => o.name), ["C"]);

    assert.equal(coverageFrom({ stats: { endpoints: 0, action1Total: 0 } }).percent, 100);

});

