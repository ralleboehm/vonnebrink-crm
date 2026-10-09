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

const { can } = require("../src/core/permissions");

// Wie middleware/viewData.middleware.js: can() für die angemeldete Rolle
function render(file, locals, role = "admin") {

    const user = { id: "u1", firstName: "Ralf", lastName: "Test", username: "ralf", role };

    return pug.renderFile(path.join(VIEWS, file), {
        session: { user },
        currentUser: { id: "u1", role },
        can: (permission) => can(user, permission),
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

test("Ticketliste: Vertrieb sieht Betreff, aber keine Links ins Ticket", { skip: !pug && "pug nicht installiert" }, () => {

    const tickets = [{
        _id: "t1", ticketNumber: "TIC-000001", subject: "Drucker defekt", status: "open", priority: "high",
        company, assignedTo: null
    }];

    const locals = { tickets, filters: { search: "", status: "", priority: "", company: "" } };

    const admin = render("crm/tickets/index.pug", locals, "admin");
    assert.match(admin, /href="\/crm\/tickets\/t1"/);
    assert.match(admin, /\/crm\/tickets\/new/);
    assert.match(admin, /Marketing/);

    const sales = render("crm/tickets/index.pug", locals, "sales");
    assert.match(sales, /Drucker defekt/);
    assert.doesNotMatch(sales, /href="\/crm\/tickets\/t1"/);
    assert.doesNotMatch(sales, /\/crm\/tickets\/new/);
    assert.match(sales, /Marketing/);

    const technician = render("crm/tickets/index.pug", locals, "technician");
    assert.match(technician, /href="\/crm\/tickets\/t1"/);
    assert.doesNotMatch(technician, /\/crm\/marketing/);

});

// ----------------------------------------------------
// Kampagnen
// ----------------------------------------------------

const campaignHelpers = {
    statusLabels: { draft: "Entwurf", sending: "Wird versendet", sent: "Versendet" },
    deliveryLabels: { pending: "Wartet", sent: "Verschickt", failed: "Fehlgeschlagen", skipped: "Übersprungen" },
    placeholders: require("../src/utils/campaignContent").PLACEHOLDERS
};

function campaignOf(extra = {}) {

    return {
        _id: "k1",
        campaignNumber: "KAM-000001",
        name: "Herbst Holzhändler",
        description: "Herbstausgabe",
        subject: "Neues für {{firma}}",
        content: "{{anrede}},\n\nText",
        audience: { tags: ["Holzhandel"] },
        status: "draft",
        stats: { total: 0, sent: 0, failed: 0, skipped: 0 },
        deliveries: [],
        createdBy: "Ralf Böhm",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...extra
    };

}

test("Kampagnen: Übersicht", { skip: !pug && "pug nicht installiert" }, () => {

    const sent = campaignOf({ _id: "k2", status: "sent", sentAt: new Date(), audience: { tags: [] }, stats: { total: 3, sent: 2, failed: 1, skipped: 0 } });

    const html = render("crm/campaigns/index.pug", {
        campaigns: [campaignOf(), sent],
        filters: { status: "", search: "" },
        flash: { type: "success", text: "Gespeichert." },
        ...campaignHelpers
    });

    assert.match(html, /KAM-000001/);
    assert.match(html, /Holzhandel/);
    assert.match(html, /Alle erreichbaren Kontakte/);
    assert.match(html, /2 \/ 3/);
    assert.match(html, /\/crm\/marketing\/campaigns\/new/);
    assert.match(html, /Gespeichert\./);

    const empty = render("crm/campaigns/index.pug", { campaigns: [], filters: { status: "sent", search: "" }, flash: null, ...campaignHelpers }, "sales");
    assert.match(empty, /Keine Kampagne passt/);

    const technician = render("crm/campaigns/index.pug", { campaigns: [], filters: { status: "", search: "" }, flash: null, ...campaignHelpers }, "technician");
    assert.doesNotMatch(technician, /href="\/crm\/marketing\/campaigns"/, "Techniker: kein Marketing-Menü");

});

test("Kampagnen: Formular neu und bearbeiten", { skip: !pug && "pug nicht installiert" }, () => {

    const locals = {
        groups: [{ tag: "Holzhandel", eligible: 4 }, { tag: "Arztpraxis", eligible: 0 }],
        allEligible: 9,
        error: null,
        ...campaignHelpers
    };

    const create = render("crm/campaigns/create.pug", { ...locals, campaign: { name: "", description: "", subject: "", format: "html", content: "<p>{{anrede}},</p>", audience: { tags: [] } } });

    // Editor mit Bildern; HTML steht maskiert im versteckten Feld
    assert.match(create, /id="editor"/);
    assert.match(create, /quill@2\.0\.3\/dist\/quill\.js/);
    assert.match(create, /name="format" value="html"/);
    assert.match(create, /<textarea[^>]*name="content"[^>]*>&lt;p&gt;\{\{anrede\}\},&lt;\/p&gt;<\/textarea>/);
    assert.match(create, /bi-image/);

    assert.match(create, /action="\/crm\/marketing\/campaigns"/);
    assert.match(create, /formaction="\/crm\/marketing\/campaigns\/preview"/);
    assert.match(create, /data-placeholder="anrede"/);
    assert.match(create, /alle erreichbaren Kontakte \(9\)/);
    assert.match(create, /4 erreichbar/);

    const edit = render("crm/campaigns/edit.pug", { ...locals, campaign: campaignOf({ audience: { tags: ["holzhandel"] } }), error: "Unbekannter Platzhalter: {{foo}}." });

    assert.match(edit, /action="\/crm\/marketing\/campaigns\/k1\/update"/);
    assert.match(edit, /value="Holzhandel" id="tag-Holzhandel" checked/);
    assert.match(edit, /Unbekannter Platzhalter/);
    assert.match(edit, /Herbst Holzhändler/);

});

test("Kampagnen: Detailseite je Status", { skip: !pug && "pug nicht installiert" }, () => {

    const base = { flash: null, testAddress: "ralf@vonnebrink.com", ...campaignHelpers };

    const draft = render("crm/campaigns/show.pug", { ...base, campaign: campaignOf(), recipientCount: 4, mailConfigured: true });

    assert.match(draft, /Jetzt an 4 Empfänger senden/);
    assert.match(draft, /\/crm\/marketing\/campaigns\/k1\/preview/);
    assert.match(draft, /\/crm\/marketing\/campaigns\/k1\/edit/);
    assert.match(draft, /value="ralf@vonnebrink.com"/);

    const lanOnly = render("crm/campaigns/show.pug", {
        ...base,
        campaign: campaignOf(),
        recipientCount: 4,
        mailConfigured: true,
        appUrlProblem: "APP_URL zeigt auf 192.168.178.35 – diese Adresse können Kunden aus dem Internet nicht öffnen."
    });
    assert.match(lanOnly, /Abmeldelinks nicht erreichbar/);
    assert.match(lanOnly, /192\.168\.178\.35/);
    assert.doesNotMatch(lanOnly, /Jetzt an 4 Empfänger senden/);
    assert.match(lanOnly, /\/crm\/marketing\/campaigns\/k1\/test/, "Test-Mail geht trotzdem");

    const noMail = render("crm/campaigns/show.pug", { ...base, campaign: campaignOf(), recipientCount: 4, mailConfigured: false });
    assert.match(noMail, /Mailversand ist nicht eingerichtet/);
    assert.doesNotMatch(noMail, /Jetzt an 4 Empfänger senden/);

    const deliveries = [
        { contact: "p1", email: "a@x.de", name: "Anna Jung", companyName: "Holz Müller", status: "sent", sentAt: new Date() },
        { contact: "p2", email: "b@x.de", name: "Bert", companyName: "", status: "failed", error: "Mailbox voll", sentAt: new Date() },
        { contact: "p3", email: "c@x.de", name: "Carl", companyName: "", status: "pending", sentAt: null }
    ];

    const sending = render("crm/campaigns/show.pug", {
        ...base,
        campaign: campaignOf({ status: "sending", startedAt: new Date(), deliveries, stats: { total: 3, sent: 1, failed: 1, skipped: 0 } }),
        recipientCount: 3,
        mailConfigured: true
    });

    assert.match(sending, /2 von 3 bearbeitet/);
    assert.match(sending, /window\.location\.reload/);
    assert.match(sending, /Mailbox voll/);
    assert.doesNotMatch(sending, /\/edit"/, "kein Bearbeiten während des Versands");
    assert.doesNotMatch(sending, /\/delete"/, "kein Löschen während des Versands");

    const sent = render("crm/campaigns/show.pug", {
        ...base,
        campaign: campaignOf({ status: "sent", sentAt: new Date(), sentBy: "Ralf Böhm", deliveries: deliveries.slice(0, 2), stats: { total: 2, sent: 1, failed: 1, skipped: 0 } }),
        recipientCount: 2,
        mailConfigured: true
    }, "sales");

    assert.match(sent, /Verschickt/);
    assert.match(sent, /Duplizieren/);
    assert.doesNotMatch(sent, /Jetzt an/);
    assert.doesNotMatch(sent, /window\.location\.reload/);

});

// ----------------------------------------------------
// Kundenportal (Design wie vonnebrink.com)
// ----------------------------------------------------

test("Portal: Anmeldung, Übersicht und Ticketliste im neuen Design", { skip: !pug && "pug nicht installiert" }, () => {

    const login = render("portal/login.pug", { currentPortalUser: null, error: "E-Mail oder Passwort ist falsch.", email: "max@muster.de", title: "Anmelden" });

    assert.match(login, /\/css\/portal\.css/);
    assert.doesNotMatch(login, /\/css\/vonnebrink\.css/, "CRM-Stylesheet nicht im Portal");
    assert.match(login, /logo-wordmark-light\.png/);
    assert.match(login, /E-Mail oder Passwort ist falsch\./, "Fehlermeldung wird angezeigt");
    assert.match(login, /value="max@muster\.de"/);
    assert.match(login, /<body class="vb-portal">/);
    assert.doesNotMatch(login, /Meine Tickets/, "ohne Anmeldung kein Menü");

    const portalUser = { firstName: "Hans", lastName: "Müller", companyName: "Holz Müller GmbH" };
    const day = (n) => new Date(Date.now() - n * 86400000);

    const tickets = [
        { _id: "t1", ticketNumber: "TIC-000001", subject: "Drucker", status: "open", priority: "high", createdAt: day(5), updatedAt: day(1) },
        { _id: "t2", ticketNumber: "TIC-000002", subject: "VPN", status: "in_progress", priority: "normal", createdAt: day(4), updatedAt: day(2) },
        { _id: "t3", ticketNumber: "TIC-000003", subject: "Alt", status: "closed", priority: "low", createdAt: day(30), updatedAt: day(20) },
        { _id: "t4", ticketNumber: "TIC-000004", subject: "Komisch", status: "quatsch", priority: "egal", createdAt: day(3) }
    ];

    const dashboard = render("portal/dashboard.pug", { currentPortalUser: portalUser, currentPath: "/portal", tickets, title: "Übersicht" });

    assert.match(dashboard, /Guten Tag, Hans Müller/);
    assert.match(dashboard, /Holz Müller GmbH/);
    assert.match(dashboard, /Sie haben 2 offene Tickets/);
    assert.match(dashboard, /class="nav-link active" href="\/portal"|href="\/portal" class="nav-link active"/);
    assert.match(dashboard, /vb-badge vb-badge-open[^>]*>Offen/);
    assert.match(dashboard, /vb-badge vb-badge-unknown[^>]*>quatsch/);
    assert.ok(dashboard.indexOf("TIC-000001") < dashboard.indexOf("TIC-000002"), "zuletzt aktualisiert zuerst");

    const empty = render("portal/dashboard.pug", { currentPortalUser: portalUser, tickets: [], title: "Übersicht" });
    assert.match(empty, /keine offenen Tickets/);
    assert.match(empty, /Erstes Ticket erstellen/);

    const list = render("portal/tickets/index.pug", { currentPortalUser: portalUser, currentPath: "/portal/tickets", tickets: tickets.slice(0, 2), title: "Meine Tickets" });
    assert.match(list, /vb-badge-in_progress[^>]*>In Bearbeitung/);
    assert.match(list, /vb-badge-high[^>]*>Hoch/);
    assert.doesNotMatch(list, /table-dark/);

});
