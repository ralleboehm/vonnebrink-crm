"use strict";

// Kompiliert alle Pug-Vorlagen und rendert die Asset-Seiten mit
// Beispieldaten. Braucht die installierten Abhängigkeiten (npm install),
// aber keine Datenbank.
//
// Ausführen mit:  node --test test/views.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

let pug = null;

try {
    pug = require("pug");
} catch {
    // ohne npm install wird der Test übersprungen
}

const labels = require("../src/utils/assetLabels");

const VIEWS = path.join(__dirname, "../src/views");

function allTemplates(dir) {

    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) return allTemplates(full);

        return entry.name.endsWith(".pug") ? [full] : [];

    });

}

function render(file, locals) {

    return pug.renderFile(path.join(VIEWS, file), {
        session: { user: { id: "u1", firstName: "Ralf", lastName: "Test", username: "ralf", role: "admin" } },
        currentUser: { id: "u1", role: "admin" },
        title: "Test",
        ...locals
    });

}

const TYPES = ["workstation", "laptop", "server", "virtual_machine", "network", "printer", "mobile", "other"];
const STATUSES = ["active", "in_stock", "repair", "retired"];

const company = { _id: "c1", companyName: "Holz Müller GmbH", customerNumber: "CUS-000001" };

const action1Asset = {
    _id: "a1",
    assetNumber: "AST-000001",
    name: "PC-EMPFANG",
    company,
    contact: { _id: "p1", firstName: "Anna", lastName: "Jung" },
    type: "workstation",
    status: "active",
    source: "action1",
    serialNumber: "5CG1234XYZ",
    operatingSystem: "Windows 11 Pro",
    lastUser: "EMPFANG\\anna",
    warrantyUntil: new Date("2020-01-01"),
    createdAt: new Date(),
    updatedAt: new Date(),
    action1: {
        endpointId: "ep-1",
        status: "Connected",
        online: true,
        lastSeen: new Date(),
        missingCriticalUpdates: 2,
        missingOtherUpdates: 0,
        rebootRequired: true,
        missing: true,
        lastSyncedAt: new Date()
    }
};

const manualAsset = {
    _id: "a2",
    assetNumber: "AST-000002",
    name: "Drucker Büro",
    company,
    type: "printer",
    status: "in_stock",
    source: "manual",
    action1: null,
    createdAt: new Date(),
    updatedAt: new Date()
};

const helpers = {
    labels,
    assetTypes: TYPES,
    assetStatuses: STATUSES,
    action1Fields: ["name", "serialNumber", "operatingSystem"]
};

test("alle Pug-Vorlagen lassen sich kompilieren", { skip: !pug && "pug nicht installiert" }, () => {

    for (const file of allTemplates(VIEWS)) {
        assert.doesNotThrow(() => pug.compileFile(file), path.relative(VIEWS, file));
    }

});

test("Asset-Übersicht", { skip: !pug && "pug nicht installiert" }, () => {

    const html = render("crm/assets/index.pug", {
        assets: [action1Asset, manualAsset],
        companies: [company],
        filters: { search: "", company: "c1", type: "", status: "", source: "", online: "", updates: "critical" },
        ...helpers
    });

    assert.match(html, /PC-EMPFANG/);
    assert.match(html, /Drucker Büro/);
    assert.match(html, /Nicht in Action1/);

    const empty = render("crm/assets/index.pug", {
        assets: [],
        companies: [],
        filters: { search: "x" },
        ...helpers
    });

    assert.match(empty, /Keine Assets gefunden/);

});

test("Asset-Detailseite", { skip: !pug && "pug nicht installiert" }, () => {

    const html = render("crm/assets/show.pug", { asset: action1Asset, ...helpers });

    assert.match(html, /PC-EMPFANG/);
    assert.match(html, /2 fehlen/);
    assert.match(html, /Abgelaufen/);

    assert.match(render("crm/assets/show.pug", { asset: manualAsset, ...helpers }), /Manuell/);

});

test("Asset-Formulare (neu, bearbeiten, Action1-Felder gesperrt)", { skip: !pug && "pug nicht installiert" }, () => {

    const contacts = [{ _id: "p1", firstName: "Anna", lastName: "Jung", company }];

    const create = render("crm/assets/create.pug", {
        asset: { company: "c1", type: "workstation", status: "active" },
        companies: [company],
        contacts,
        error: "Bitte einen Gerätenamen angeben.",
        ...helpers
    });

    assert.match(create, /Bitte einen Gerätenamen angeben/);
    assert.match(create, /name="serialNumber"/);

    const edit = render("crm/assets/edit.pug", {
        asset: action1Asset,
        companies: [company],
        contacts,
        error: null,
        ...helpers
    });

    assert.doesNotMatch(edit, /name="serialNumber"/, "Action1-Feld ist gesperrt");
    assert.match(edit, /name="notes"/);

});

test("Firmenseite mit Assets", { skip: !pug && "pug nicht installiert" }, () => {

    const html = render("crm/companies/show.pug", {
        company: { ...company, status: "active", address: {}, action1: { organizationId: "o1", organizationName: "Holz Müller" } },
        contacts: [],
        recentTickets: [],
        assets: [action1Asset],
        assetSummary: { active: 1, workstations: 1, servers: 0, criticalUpdates: 1 },
        labels
    });

    assert.match(html, /PC-EMPFANG/);
    assert.match(html, /Holz Müller/);

});

test("Action1-Seite (eingerichtet, nicht eingerichtet, Sync läuft)", { skip: !pug && "pug nicht installiert" }, () => {

    const base = {
        baseUrl: "https://app.action1.com/api/3.0",
        syncInterval: 60,
        organizations: [{ id: "o1", name: "Holz Müller", description: "" }],
        apiError: null,
        companies: [company],
        companyByOrg: { o1: company },
        orphaned: [],
        deviceCounts: { o1: 4 },
        runs: [{
            startedAt: new Date(), finishedAt: new Date(), trigger: "schedule", ok: false,
            stats: { endpoints: 3, created: 1, updated: 2, linked: 0, missing: 0 },
            failures: [{ company: "Kunde B", message: "HTTP 403" }]
        }],
        summary: { total: 3, online: 2, offline: 1, criticalUpdates: 1, rebootRequired: 0 },
        running: false,
        flash: { type: "success", text: "Zuordnung gespeichert." },
        labels
    };

    const html = render("crm/integrations/action1.pug", { ...base, configured: true });

    assert.match(html, /name="mapping\[o_o1\]"/);
    assert.match(html, /HTTP 403/);

    assert.match(render("crm/integrations/action1.pug", { ...base, configured: false }), /ACTION1_CLIENT_ID/);
    assert.match(render("crm/integrations/action1.pug", { ...base, configured: true, running: true }), /window\.location\.reload/);

});

test("Dashboard mit Assets und Action1-Abdeckung", { skip: !pug && "pug nicht installiert" }, () => {

    const { coverageFrom } = require("../src/utils/action1Coverage");

    const base = {
        companyCount: 3,
        contactCount: 5,
        userCount: 1,
        openTicketCount: 2,
        inProgressTicketCount: 1,
        recentCompanies: [{ ...company, status: "active" }],
        recentContacts: [{ _id: "p1", firstName: "Anna", lastName: "Jung", company }],
        recentTickets: [{ _id: "t1", ticketNumber: "TIC-000001", subject: "Drucker", status: "open", company }],
        assetSummary: { total: 3, active: 2, workstations: 1, servers: 1, online: 1, offline: 1, criticalUpdates: 1, rebootRequired: 0, warrantyExpired: 1 },
        attentionAssets: [action1Asset],
        lastRun: null,
        labels
    };

    const coverage = coverageFrom({
        startedAt: new Date(),
        stats: { endpoints: 1, action1Total: 2 },
        organizations: [{ id: "o2", name: "Org ohne Firma", endpoints: 1, mapped: false }]
    });

    const html = render("crm/dashboard/index.pug", { ...base, coverage });

    assert.match(html, /Verwaltete Assets/);
    assert.match(html, /von 2 einer Firma zugeordnet/);
    assert.match(html, /Org ohne Firma/);
    assert.match(html, /PC-EMPFANG/);

    assert.match(render("crm/dashboard/index.pug", { ...base, coverage: null }), /Noch kein Sync gelaufen/);

});

test("Glocke in der Navigation und Benachrichtigungsseite", { skip: !pug && "pug nicht installiert" }, () => {

    const items = [
        { _id: "n1", title: "Neues Ticket TIC-000007", message: "Holz Müller – Drucker", type: "danger", icon: "bi-ticket-detailed", link: "/crm/tickets/t1", isRead: false, createdAt: new Date() },
        { _id: "n2", title: "Alte Meldung", message: "", type: "info", icon: "bi-bell", link: null, isRead: true, createdAt: new Date(Date.now() - 86400000) }
    ];

    const bell = { unreadCount: 1, recent: items, timeAgo: labels.timeAgo, returnTo: "/crm" };

    const page = render("crm/notifications/index.pug", {
        result: { items, total: 2, page: 1, pages: 1, perPage: 25 },
        unreadOnly: false,
        labels,
        notificationBell: bell
    });

    assert.match(page, /Neues Ticket TIC-000007/);
    assert.match(page, /\/crm\/notifications\/n1\/open/);
    assert.match(page, /\/crm\/notifications\/n1\/read/);
    assert.doesNotMatch(page, /\/crm\/notifications\/n2\/read/, "gelesene ohne Häkchen-Knopf");
    assert.match(page, /bi-bell-fill/, "Glocke mit ungelesenen");
    assert.match(page, /Alle anzeigen/);

    const empty = render("crm/notifications/index.pug", {
        result: { items: [], total: 0, page: 1, pages: 1, perPage: 25 },
        unreadOnly: true,
        labels,
        notificationBell: { unreadCount: 0, recent: [], timeAgo: labels.timeAgo, returnTo: "/crm" }
    });

    assert.match(empty, /Keine ungelesenen Benachrichtigungen/);
    assert.match(empty, /Keine Benachrichtigungen/);

});
