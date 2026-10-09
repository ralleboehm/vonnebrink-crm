"use strict";

// ----------------------------------------------------
// Smoke-Test: die ganze Anwendung einmal durchklicken
// ----------------------------------------------------
//
// Startet die App gegen eine EIGENE Testdatenbank, legt Beispieldaten an,
// meldet sich im CRM (Admin) und im Kundenportal an und ruft jede Seite
// auf. Dazu einige Aktionen: Ticket anlegen (CRM & Portal), Nachricht,
// Datei hoch- und herunterladen, Asset anlegen, Benachrichtigungen.
//
// Sicherheit:
//   - Datenbank: Name aus MONGODB_URI + "_test" (z. B. vonnebrinkCRM_test).
//     Der Test bricht ab, wenn der Name nicht auf "_test" endet.
//   - Dateien: Uploads landen in einem temporären Ordner, nicht in storage/.
//   - E-Mail und Action1 sind während des Tests abgeschaltet.
//
// Ausführen (braucht eine laufende MongoDB):
//   npm run test:smoke

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENABLED = process.env.SMOKE_TEST === "1";

const BACKEND_DIR = path.join(__dirname, "..");

// ----------------------------------------------------
// Testdatenbank bestimmen
// ----------------------------------------------------

function testDatabaseUri(uri) {

    if (process.env.MONGODB_TEST_URI) {
        return process.env.MONGODB_TEST_URI;
    }

    // mongodb://host:port/datenbank?optionen -> datenbank_test
    const match = uri.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^?]*)(\?.*)?$/);

    if (!match) {
        throw new Error("MONGODB_URI hat kein erkennbares Format; bitte MONGODB_TEST_URI setzen.");
    }

    const [, base, name, query = ""] = match;

    return `${base}/${name || "vonnebrinkCRM"}_test${query}`;

}

function databaseName(uri) {

    const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);

    return match ? match[1] : "";

}

// ----------------------------------------------------
// Kleiner HTTP-Client mit Cookie (Session)
// ----------------------------------------------------

function createClient(baseUrl) {

    let cookie = "";

    async function request(method, url, { form, formData } = {}) {

        const headers = { Accept: "text/html" };
        let body;

        if (cookie) headers.Cookie = cookie;

        if (form) {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            body = new URLSearchParams(form).toString();
        }

        if (formData) {
            body = formData;
        }

        const response = await fetch(`${baseUrl}${url}`, { method, headers, body, redirect: "manual" });

        const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];

        if (setCookies.length) {
            cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        return {
            status: response.status,
            location: response.headers.get("location"),
            contentType: response.headers.get("content-type") || "",
            buffer,
            text: buffer.toString("utf8")
        };

    }

    return {
        get: (url) => request("GET", url),
        post: (url, form) => request("POST", url, { form }),
        upload: (url, formData) => request("POST", url, { formData })
    };

}

function assertPage(response, url) {

    assert.equal(response.status, 200, `${url}: Status ${response.status}${response.location ? ` -> ${response.location}` : ""}`);
    assert.doesNotMatch(response.text, /Serverfehler|Interner Serverfehler/, `${url}: Fehlerseite`);

}

function assertRedirect(response, url, target) {

    assert.equal(response.status, 302, `${url}: Status ${response.status}, erwartet 302`);

    if (target) {
        assert.equal(response.location, target, `${url}: Weiterleitung nach ${response.location}`);
    }

}

function uploadForm(name, content) {

    const form = new FormData();

    form.append("attachment", new Blob([content], { type: "text/plain" }), name);

    return form;

}

// ----------------------------------------------------
// Test
// ----------------------------------------------------

test("Smoke-Test: CRM und Kundenportal", { skip: !ENABLED && "nur mit npm run test:smoke", timeout: 120000 }, async (t) => {

    // .env des Backends laden (für MONGODB_URI)
    require("dotenv").config({ path: path.join(BACKEND_DIR, ".env"), quiet: true });

    const sourceUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/vonnebrinkCRM";
    const uri = testDatabaseUri(sourceUri);

    assert.match(databaseName(uri), /_test$/, `Abbruch: Testdatenbank "${databaseName(uri)}" endet nicht auf _test`);

    // Nichts nach außen schicken
    for (const key of ["SMTP_HOST", "MAIL_FROM", "ACTION1_CLIENT_ID", "ACTION1_CLIENT_SECRET", "ACTION1_SYNC_INTERVAL_MINUTES"]) {
        delete process.env[key];
    }

    process.env.NODE_ENV = "test";
    process.env.MONGODB_URI = uri;

    // Uploads in einen temporären Ordner umleiten (storage/ liegt unter cwd)
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "vonnebrink-smoke-"));
    const originalCwd = process.cwd();

    process.chdir(workDir);

    const mongoose = require("mongoose");

    const quiet = { log: console.log, warn: console.warn };
    console.log = () => {};
    console.warn = () => {};

    let server;

    t.after(async () => {

        console.log = quiet.log;
        console.warn = quiet.warn;

        if (server) await new Promise((resolve) => server.close(resolve));

        try {
            await require("../src/services/email.service").flush();
        } catch {
            // egal
        }

        await mongoose.disconnect();

        process.chdir(originalCwd);
        fs.rmSync(workDir, { recursive: true, force: true });

    });

    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase();

    // ------------------------------------------------
    // Beispieldaten
    // ------------------------------------------------

    const User = require("../src/models/user.model");
    const Company = require("../src/models/company.model");
    const Contact = require("../src/models/contact.model");
    const PortalAccount = require("../src/models/portalAccount.model");
    const Ticket = require("../src/models/ticket.model");
    const Asset = require("../src/models/asset.model");
    const Attachment = require("../src/models/attachment.model");
    const Notification = require("../src/models/notification.model");
    const SyncRun = require("../src/models/syncRun.model");

    await Promise.all([User, Company, Contact, PortalAccount, Ticket, Asset].map((m) => m.init()));

    const PASSWORD = "Smoke-Test-123!";

    const admin = await User.create({ username: "smoke-admin", firstName: "Smoke", lastName: "Admin", email: "admin@smoke.test", password: PASSWORD, role: "admin" });
    const technician = await User.create({ username: "smoke-tech", firstName: "Smoke", lastName: "Techniker", email: "tech@smoke.test", password: PASSWORD, role: "technician" });

    const company = await Company.create({ companyName: "Smoke GmbH", customerNumber: "CUS-900001", status: "active", address: { city: "Lampertheim" } });
    const otherCompany = await Company.create({ companyName: "Fremde AG", customerNumber: "CUS-900002", status: "active" });

    const contact = await Contact.create({ company: company._id, contactNumber: "CON-900001", salutation: "mr", firstName: "Hans", lastName: "Smoke", email: "hans@smoke.test" });
    const otherContact = await Contact.create({ company: otherCompany._id, contactNumber: "CON-900002", firstName: "Fritz", lastName: "Fremd", email: "fritz@smoke.test" });

    await PortalAccount.create({ contact: contact._id, email: contact.email, password: PASSWORD, mustChangePassword: false });

    const ticket = await Ticket.create({ ticketNumber: "TIC-900001", subject: "Smoke Drucker", description: "Druckt nicht", company: company._id, contact: contact._id, createdBy: admin._id });
    const otherTicket = await Ticket.create({ ticketNumber: "TIC-900002", subject: "Fremdes Ticket", description: "Geheim", company: otherCompany._id, contact: otherContact._id, createdBy: admin._id });

    const manualAsset = await Asset.create({ assetNumber: "AST-900001", company: company._id, name: "SMOKE-PC", type: "workstation", serialNumber: "SN-SMOKE" });
    const action1Asset = await Asset.create({
        assetNumber: "AST-900002", company: company._id, name: "SMOKE-SRV", type: "server", source: "action1",
        action1: { endpointId: "ep-smoke", organizationId: "org-smoke", status: "Connected", online: true, lastSeen: new Date(), missingCriticalUpdates: 2 }
    });

    const notification = await Notification.create({ user: admin._id, title: "Smoke-Benachrichtigung", link: `/crm/tickets/${ticket._id}` });

    await SyncRun.create({ provider: "action1", startedAt: new Date(), finishedAt: new Date(), ok: true, stats: { endpoints: 1, action1Total: 2 }, organizations: [{ id: "org-x", name: "Ohne Firma", endpoints: 1, mapped: false }] });

    // ------------------------------------------------
    // App starten
    // ------------------------------------------------

    const app = require("../src/app");

    server = await new Promise((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    // ------------------------------------------------
    // Ohne Anmeldung
    // ------------------------------------------------

    await t.test("ohne Anmeldung: Weiterleitung zum Login", async () => {

        const anonymous = createClient(baseUrl);

        assertRedirect(await anonymous.get("/crm/tickets"), "/crm/tickets", "/crm/login");
        assertRedirect(await anonymous.get("/portal/tickets"), "/portal/tickets", "/portal/login");
        assertPage(await anonymous.get("/crm/login"), "/crm/login");
        assertPage(await anonymous.get("/portal/login"), "/portal/login");

        const health = await anonymous.get("/health");
        assert.equal(health.status, 200, "/health");

    });

    // ------------------------------------------------
    // CRM
    // ------------------------------------------------

    const crm = createClient(baseUrl);

    await t.test("CRM: Anmeldung als Admin", async () => {

        const wrong = await crm.post("/crm/login", { username: "smoke-admin", password: "falsch" });
        assert.equal(wrong.status, 200);
        assert.match(wrong.text, /falsch/);

        assertRedirect(await crm.post("/crm/login", { username: "smoke-admin", password: PASSWORD }), "/crm/login", "/crm");

    });

    await t.test("CRM: alle Seiten", async () => {

        const pages = [
            "/crm",
            "/crm/companies",
            "/crm/companies/new",
            `/crm/companies/${company._id}`,
            `/crm/companies/${company._id}/edit`,
            "/crm/contacts",
            "/crm/contacts/new",
            `/crm/contacts/${contact._id}`,
            `/crm/contacts/${contact._id}/edit`,
            "/crm/tickets",
            "/crm/tickets?status=open&search=Smoke",
            "/crm/tickets/new",
            `/crm/tickets/new?company=${company._id}`,
            `/crm/tickets/${ticket._id}`,
            `/crm/tickets/${ticket._id}/edit`,
            "/crm/assets",
            "/crm/assets?updates=critical",
            `/crm/assets?company=${company._id}&online=online`,
            "/crm/assets?company=kaputt",
            "/crm/assets/new",
            `/crm/assets/${manualAsset._id}`,
            `/crm/assets/${manualAsset._id}/edit`,
            `/crm/assets/${action1Asset._id}`,
            `/crm/assets/${action1Asset._id}/edit`,
            "/crm/users",
            "/crm/users/new",
            `/crm/users/${admin._id}`,
            `/crm/users/${admin._id}/edit`,
            "/crm/import",
            "/crm/import/companies",
            "/crm/import/contacts",
            "/crm/import/export/companies",
            "/crm/import/export/contacts",
            "/crm/search?q=Smoke",
            "/crm/search?q=SN-SMOKE",
            "/crm/profile",
            "/crm/profile/edit",
            "/crm/profile/password",
            "/crm/notifications",
            "/crm/notifications?filter=unread",
            "/crm/integrations/action1"
        ];

        for (const url of pages) {
            assertPage(await crm.get(url), url);
        }

        const dashboard = await crm.get("/crm");
        assert.match(dashboard.text, /Verwaltete Assets/);
        assert.match(dashboard.text, /Smoke-Benachrichtigung/, "Glocke zeigt Benachrichtigung");

    });

    await t.test("CRM: Sprünge, Vorschläge, Export, 404", async () => {

        assertRedirect(await crm.get("/crm/search?q=TIC-900001"), "Nummernsprung", `/crm/tickets/${ticket._id}`);
        assertRedirect(await crm.get("/crm/search?q=AST-900001"), "Nummernsprung Asset", `/crm/assets/${manualAsset._id}`);

        const suggest = await crm.get("/crm/search/suggest?q=Smoke");
        assert.equal(suggest.status, 200);
        const json = JSON.parse(suggest.text);
        assert.ok(json.companies.total >= 1 && json.assets.total >= 1);

        const csv = await crm.get("/crm/import/export/companies/download");
        assert.equal(csv.status, 200, "CSV-Export");
        assert.match(csv.text, /Smoke GmbH/);

        const missing = await crm.get("/crm/tickets/000000000000000000000000");
        assert.equal(missing.status, 404, "unbekanntes Ticket -> 404");

        const invalid = await crm.get("/crm/companies/kaputt");
        assert.notEqual(invalid.status, 500, "ungültige ID -> kein 500");

    });

    await t.test("CRM: Ticket anlegen löst Benachrichtigung aus", async () => {

        const before = await Notification.countDocuments({ user: technician._id });

        const created = await crm.post("/crm/tickets", {
            company: String(company._id),
            contact: String(contact._id),
            subject: "Smoke neues Ticket",
            description: "Aus dem Smoke-Test",
            priority: "high",
            category: "support"
        });

        assertRedirect(created, "POST /crm/tickets");

        assert.ok(await Ticket.exists({ subject: "Smoke neues Ticket" }), "Ticket gespeichert");
        assert.equal(await Notification.countDocuments({ user: technician._id }), before + 1, "Techniker benachrichtigt");
        assert.equal(await Notification.countDocuments({ user: admin._id, title: /Smoke neues|Neues Ticket/ }), 0, "Ersteller nicht benachrichtigt");

    });

    await t.test("CRM: Nachricht, Datei hoch- und herunterladen", async () => {

        assertRedirect(await crm.post(`/crm/tickets/${ticket._id}/messages`, { message: "Smoke-Nachricht" }), "Nachricht");

        const uploaded = await crm.upload(`/crm/tickets/${ticket._id}/attachments`, uploadForm("crm.txt", "Inhalt aus dem CRM"));
        assertRedirect(uploaded, "Upload CRM", `/crm/tickets/${ticket._id}`);

        const attachment = await Attachment.findOne({ ticket: ticket._id, originalName: "crm.txt" });
        assert.ok(attachment, "Anhang gespeichert");

        const download = await crm.get(`/crm/tickets/${ticket._id}/attachments/${attachment._id}`);
        assert.equal(download.status, 200, "Download CRM");
        assert.equal(download.text, "Inhalt aus dem CRM");

        assertPage(await crm.get(`/crm/tickets/${ticket._id}`), "Ticket mit Anhang");

    });

    await t.test("CRM: Asset anlegen, Benachrichtigungen lesen", async () => {

        const created = await crm.post("/crm/assets", { company: String(company._id), name: "SMOKE-NEU", type: "laptop", status: "active" });
        assertRedirect(created, "POST /crm/assets");
        assert.ok(await Asset.exists({ name: "SMOKE-NEU" }));

        const invalid = await crm.post("/crm/assets", { company: "", name: "" });
        assert.equal(invalid.status, 422, "Validierung");
        assert.match(invalid.text, /Firma/);

        assertRedirect(await crm.get(`/crm/notifications/${notification._id}/open`), "Benachrichtigung öffnen", `/crm/tickets/${ticket._id}`);
        assert.equal((await Notification.findById(notification._id)).isRead, true);

        assertRedirect(await crm.post("/crm/notifications/read-all", { returnTo: "https://boese.example.com" }), "read-all", "/crm/notifications");

    });

    // ------------------------------------------------
    // Kundenportal
    // ------------------------------------------------

    const portal = createClient(baseUrl);

    await t.test("Portal: Anmeldung", async () => {

        assertRedirect(await portal.post("/portal/login", { email: "hans@smoke.test", password: PASSWORD }), "/portal/login", "/portal");

    });

    await t.test("Portal: alle Seiten", async () => {

        for (const url of ["/portal", "/portal/tickets", "/portal/tickets/new", `/portal/tickets/${ticket._id}`, "/portal/profile", "/portal/profile/password"]) {
            assertPage(await portal.get(url), url);
        }

    });

    await t.test("Portal: fremde Tickets sind gesperrt", async () => {

        assertRedirect(await portal.get(`/portal/tickets/${otherTicket._id}`), "fremdes Ticket", "/portal/tickets");
        assertRedirect(await portal.post(`/portal/tickets/${otherTicket._id}/messages`, { message: "Hallo" }), "fremde Nachricht", "/portal/tickets");

        const upload = await portal.upload(`/portal/tickets/${otherTicket._id}/attachments`, uploadForm("boese.txt", "x"));
        assertRedirect(upload, "fremder Upload", "/portal/tickets");
        assert.equal(await Attachment.countDocuments({ ticket: otherTicket._id }), 0, "kein Anhang am fremden Ticket");

        const crmAttachment = await Attachment.findOne({ ticket: ticket._id, originalName: "crm.txt" });
        const foreign = await portal.get(`/portal/tickets/${otherTicket._id}/attachments/${crmAttachment._id}`);
        assertRedirect(foreign, "fremder Download", "/portal/tickets");

    });

    await t.test("Portal: Ticket, Nachricht, Datei", async () => {

        const adminBefore = await Notification.countDocuments({ user: admin._id });

        const created = await portal.post("/portal/tickets/new", { subject: "Smoke Portal-Ticket", description: "Aus dem Portal", category: "support", priority: "normal" });
        assertRedirect(created, "POST /portal/tickets/new");
        assert.ok(await Ticket.exists({ subject: "Smoke Portal-Ticket", company: company._id }));
        assert.equal(await Notification.countDocuments({ user: admin._id }), adminBefore + 1, "Admin benachrichtigt");

        assertRedirect(await portal.post(`/portal/tickets/${ticket._id}/messages`, { message: "Antwort vom Kunden" }), "Nachricht Portal", `/portal/tickets/${ticket._id}`);

        const uploaded = await portal.upload(`/portal/tickets/${ticket._id}/attachments`, uploadForm("portal.txt", "Inhalt aus dem Portal"));
        assertRedirect(uploaded, "Upload Portal", `/portal/tickets/${ticket._id}`);

        const attachment = await Attachment.findOne({ ticket: ticket._id, originalName: "portal.txt" });
        assert.ok(attachment, "Portal-Anhang gespeichert");

        const download = await portal.get(`/portal/tickets/${ticket._id}/attachments/${attachment._id}`);
        assert.equal(download.status, 200, "Download Portal");
        assert.equal(download.text, "Inhalt aus dem Portal");

        // Auch im CRM abrufbar
        const viaCrm = await crm.get(`/crm/tickets/${ticket._id}/attachments/${attachment._id}`);
        assert.equal(viaCrm.text, "Inhalt aus dem Portal");

    });

    await t.test("Abmelden", async () => {

        assertRedirect(await portal.get("/portal/logout"), "/portal/logout");
        assertRedirect(await portal.get("/portal/tickets"), "nach Logout", "/portal/login");

        assertRedirect(await crm.get("/crm/logout"), "/crm/logout", "/crm/login");
        assertRedirect(await crm.get("/crm"), "nach Logout", "/crm/login");

    });

});

module.exports = { testDatabaseUri, databaseName };
