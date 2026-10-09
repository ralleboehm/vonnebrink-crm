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
    const EmailLog = require("../src/models/emailLog.model");

    await Promise.all([User, Company, Contact, PortalAccount, Ticket, Asset].map((m) => m.init()));

    const PASSWORD = "Smoke-Test-123!";

    const admin = await User.create({ username: "smoke-admin", firstName: "Smoke", lastName: "Admin", email: "admin@smoke.test", password: PASSWORD, role: "admin" });
    const technician = await User.create({ username: "smoke-tech", firstName: "Smoke", lastName: "Techniker", email: "tech@smoke.test", password: PASSWORD, role: "technician" });
    await User.create({ username: "smoke-sales", firstName: "Smoke", lastName: "Vertrieb", email: "sales@smoke.test", password: PASSWORD, role: "sales" });

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
            "/crm/integrations/action1",
            "/crm/email-log",
            "/crm/email-log?status=skipped&search=smoke",
            "/crm/marketing",
            "/crm/marketing?show=all&search=Smoke",
            "/crm/marketing?tag=gibtesnicht",
            "/crm/marketing/groups"
        ];

        for (const url of pages) {
            assertPage(await crm.get(url), url);
        }

        const dashboard = await crm.get("/crm");
        assert.match(dashboard.text, /Verwaltung/, "Navigation: Menü Verwaltung");
        assert.match(dashboard.text, /\/crm\/marketing\/groups/, "Navigation: Menü Marketing");
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

    await t.test("CRM: Firma mit Adresse und Branche / Gruppen", async () => {

        const created = await crm.post("/crm/companies", {
            companyName: "Smoke Praxis",
            status: "active",
            street: "Testweg",
            postalCode: "68623",
            city: "Lampertheim",
            country: "Deutschland",
            tags: "Arztpraxis, Newsletter, arztpraxis"
        });

        assertRedirect(created, "POST /crm/companies");

        const praxis = await Company.findOne({ companyName: "Smoke Praxis" });
        assert.ok(praxis, "Firma gespeichert");
        assert.deepEqual([...praxis.tags], ["Arztpraxis", "Newsletter"]);
        assert.equal(praxis.address.city, "Lampertheim", "Adresse aus dem Formular gespeichert");
        assert.equal(praxis.address.street, "Testweg");

        assertPage(await crm.get(`/crm/companies/${praxis._id}/edit`), "Bearbeiten mit Schlagwörtern");

        assertRedirect(await crm.post(`/crm/companies/${praxis._id}/update`, {
            companyName: "Smoke Praxis",
            status: "active",
            city: "Viernheim",
            tags: "Arztpraxis, VIP"
        }), "Firma ändern");

        const updated = await Company.findById(praxis._id);
        assert.deepEqual([...updated.tags], ["Arztpraxis", "VIP"]);
        assert.equal(updated.address.city, "Viernheim");
        assert.equal(updated.address.street, "Testweg", "nicht gesendete Adressteile bleiben");

        const filtered = await crm.get("/crm/companies?tag=arztpraxis");
        assertPage(filtered, "Filter nach Schlagwort");
        assert.match(filtered.text, /Smoke Praxis/);
        assert.doesNotMatch(filtered.text, /Fremde AG/);

        assertPage(await crm.get(`/crm/companies/${praxis._id}`), "Detailseite mit Schlagwörtern");

        assert.match((await crm.get("/crm/search?q=VIP")).text, /Smoke Praxis/, "Suche findet Schlagwort");
        assert.match((await crm.get("/crm/import/export/companies/download")).text, /Arztpraxis, VIP/, "Export enthält Schlagwörter");

    });

    await t.test("CRM: Marketing-Einwilligung im Kontakt", async () => {

        const url = `/crm/contacts/${contact._id}/marketing`;
        const status = async (id = contact._id) => (await Contact.findById(id)).marketing;

        // Ohne Nachweis wird nichts eingetragen
        assertRedirect(await crm.post(url, { consent: "granted", note: "" }), "Einwilligung ohne Notiz", `/crm/contacts/${contact._id}`);
        assert.equal((await status()).status, "none", "ohne Notiz keine Einwilligung");
        assert.match((await crm.get(`/crm/contacts/${contact._id}`)).text, /Bitte angeben/, "Hinweis im Kontakt");

        // Mit Nachweis
        assertRedirect(await crm.post(url, { consent: "granted", note: "schriftlich am 01.10." }), "Einwilligung mit Notiz");
        let marketing = await status();
        assert.equal(marketing.status, "granted");
        assert.equal(marketing.source, "crm");
        assert.equal(marketing.history.length, 1);
        assert.equal(marketing.history[0].by, "Smoke Admin");
        assert.equal(marketing.history[0].note, "schriftlich am 01.10.");
        assert.ok(marketing.unsubscribeToken, "Abmeldelink entsteht mit der Einwilligung");

        const page = await crm.get(`/crm/contacts/${contact._id}`);
        assert.match(page.text, new RegExp(`/email/abmelden/${marketing.unsubscribeToken}`), "Abmeldelink im Kontakt");

        // Gleicher Status: kein doppelter Verlauf
        assertRedirect(await crm.post(url, { consent: "granted", note: "nochmal" }), "doppelt");
        assert.equal((await status()).history.length, 1);

        // Hans erreichbar, Fritz (keine Einwilligung) nicht
        const eligible = await crm.get("/crm/marketing");
        assertPage(eligible, "/crm/marketing");
        assert.match(eligible.text, /hans@smoke\.test/);
        assert.doesNotMatch(eligible.text, /fritz@smoke\.test/);

        const all = await crm.get("/crm/marketing?show=all");
        assert.match(all.text, /fritz@smoke\.test/);
        assert.match(all.text, /Keine Einwilligung/);

        // Bestandskunde (§ 7 Abs. 3 UWG): ohne Portalzugang, nur solange die Firma aktiv ist
        const fritzUrl = `/crm/contacts/${otherContact._id}/marketing`;
        assertRedirect(await crm.post(fritzUrl, { consent: "granted", source: "customer", note: "" }), "Bestandskunde ohne Notiz");
        assert.equal((await status(otherContact._id)).status, "none");

        assertRedirect(await crm.post(fritzUrl, { consent: "granted", source: "customer", note: "Hinweis im Vertrag vom 01.01." }), "Bestandskunde");
        assert.equal((await status(otherContact._id)).source, "customer");
        assert.match((await crm.get("/crm/marketing")).text, /fritz@smoke\.test/, "Bestandskunde ohne Portal erreichbar");

        await Company.updateOne({ _id: otherCompany._id }, { $set: { status: "inactive" } });
        assert.doesNotMatch((await crm.get("/crm/marketing")).text, /fritz@smoke\.test/, "inaktive Firma: Ausnahme gilt nicht");
        assert.match((await crm.get("/crm/marketing?show=all")).text, /Kein aktiver Kunde/);
        await Company.updateOne({ _id: otherCompany._id }, { $set: { status: "active" } });

        const csv = await crm.get("/crm/marketing/export");
        assert.equal(csv.status, 200, "Empfänger-Export");
        assert.match(csv.contentType, /text\/csv/);
        assert.match(csv.text, /hans@smoke\.test/);
        assert.match(csv.text, /\/email\/abmelden\//, "Export mit Abmeldelink");
        assert.match(csv.text, /Bestandskunde/);

        // Widerruf im CRM
        assertRedirect(await crm.post(url, { consent: "revoked" }), "Widerruf");
        marketing = await status();
        assert.equal(marketing.status, "revoked");
        assert.equal(marketing.history.length, 2);
        assert.doesNotMatch((await crm.get("/crm/marketing")).text, /hans@smoke\.test/, "nach Widerruf nicht erreichbar");

        // Im CRM widerrufen -> Mitarbeiter darf mit Nachweis wieder eintragen
        assertRedirect(await crm.post(url, { consent: "granted", note: "erneut schriftlich" }), "erneut");
        assert.equal((await status()).status, "granted");

        // Bereits eingewilligt: keine Bestätigungs-E-Mail
        assertRedirect(await crm.post(`${url}/double-opt-in`, {}), "DOI bei Einwilligung");
        assert.match((await crm.get(`/crm/contacts/${contact._id}`)).text, /bereits eingewilligt/);

    });

    await t.test("Marketing: Double-Opt-In und Abmeldelink (ohne Anmeldung)", async () => {

        const doris = await Contact.create({ company: company._id, contactNumber: "CON-900003", salutation: "mrs", firstName: "Doris", lastName: "Doi", email: "doris@smoke.test" });
        const status = async () => (await Contact.findById(doris._id)).marketing;
        const visitor = createClient(baseUrl);

        // Bestätigungs-E-Mail anfordern (ohne SMTP: protokolliert, nicht verschickt)
        assertRedirect(await crm.post(`/crm/contacts/${doris._id}/marketing/double-opt-in`, {}), "DOI anfordern", `/crm/contacts/${doris._id}`);

        const log = await EmailLog.findOne({ to: "doris@smoke.test" }).sort({ createdAt: -1 });
        assert.ok(log, "Bestätigungs-E-Mail protokolliert");
        assert.equal(log.template, "marketing-confirm");

        const doiToken = (await status()).doi.token;
        assert.ok(doiToken, "DOI-Schlüssel gespeichert");
        assert.match((await crm.get(`/crm/contacts/${doris._id}`)).text, /noch nicht bestätigt/);

        // GET ändert nichts (Virenscanner öffnen Links vorab)
        const confirmPage = await visitor.get(`/email/bestaetigen/${doiToken}`);
        assertPage(confirmPage, "Bestätigungsseite");
        assert.match(confirmPage.text, /Anmeldung bestätigen/);
        assert.equal((await status()).status, "none");

        // Bestätigen
        assertPage(await visitor.post(`/email/bestaetigen/${doiToken}`, {}), "Bestätigen");
        let marketing = await status();
        assert.equal(marketing.status, "granted");
        assert.equal(marketing.source, "double_opt_in");
        assert.equal(marketing.history.at(-1).by, "doris@smoke.test");
        assert.match(marketing.history.at(-1).note, /Angefordert .* von Smoke Admin, bestätigt/);
        assert.ok(!marketing.doi || !marketing.doi.token, "DOI-Schlüssel verbraucht");
        assert.ok(marketing.unsubscribeToken);

        assert.equal((await visitor.get(`/email/bestaetigen/${doiToken}`)).status, 404, "Link nur einmal gültig");
        assert.match((await crm.get("/crm/marketing")).text, /doris@smoke\.test/, "per Double-Opt-In erreichbar (ohne Portal)");

        // Abmeldelink: GET zeigt nur die Seite
        const unsubscribeUrl = `/email/abmelden/${marketing.unsubscribeToken}`;
        const unsubscribePage = await visitor.get(unsubscribeUrl);
        assertPage(unsubscribePage, "Abmeldeseite");
        assert.match(unsubscribePage.text, /abbestellen/);
        assert.equal((await status()).status, "granted");

        // Ein-Klick-Abmeldung (List-Unsubscribe-Post)
        assertPage(await visitor.post(unsubscribeUrl, { "List-Unsubscribe": "One-Click" }), "Abmelden");
        marketing = await status();
        assert.equal(marketing.status, "revoked");
        assert.equal(marketing.source, "link");
        assert.match((await visitor.get(unsubscribeUrl)).text, /Sie sind abgemeldet/);
        assert.doesNotMatch((await crm.get("/crm/marketing")).text, /doris@smoke\.test/);

        // Selbst abgemeldet: Mitarbeiter darf nicht wieder eintragen
        assertRedirect(await crm.post(`/crm/contacts/${doris._id}/marketing`, { consent: "granted", note: "telefonisch zugesagt" }), "CRM nach Link-Abmeldung");
        assert.equal((await status()).status, "revoked");
        assert.match((await crm.get(`/crm/contacts/${doris._id}`)).text, /selbst abgemeldet/);

        // ... aber sie selbst per neuer Bestätigungs-E-Mail
        assertRedirect(await crm.post(`/crm/contacts/${doris._id}/marketing/double-opt-in`, {}), "DOI erneut");
        const secondToken = (await status()).doi.token;

        // abgelaufen
        await Contact.updateOne({ _id: doris._id }, { $set: { "marketing.doi.requestedAt": new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } });
        assert.equal((await visitor.get(`/email/bestaetigen/${secondToken}`)).status, 410, "abgelaufener Link");
        assert.equal((await visitor.post(`/email/bestaetigen/${secondToken}`, {})).status, 404);
        assert.equal((await status()).status, "revoked");

        // Ungültige Links
        for (const url of ["/email/abmelden/gibtesnichtgibtesnichtgibtesnicht", "/email/abmelden/x", "/email/bestaetigen/gibtesnichtgibtesnichtgibtesnicht"]) {
            assert.equal((await visitor.get(url)).status, 404, url);
        }

        assert.equal((await visitor.post("/email/abmelden/gibtesnichtgibtesnichtgibtesnicht", {})).status, 404);

    });

    await t.test("CRM: Marketing-Gruppen umbenennen, zusammenführen, entfernen", async () => {

        await Company.updateOne({ _id: company._id }, { $set: { tags: ["Newsletter", "Handwerk"] } });

        const groups = await crm.get("/crm/marketing/groups");
        assertPage(groups, "/crm/marketing/groups");
        assert.match(groups.text, /Handwerk/);

        // Erreichbare je Gruppe
        assert.match((await crm.get("/crm/marketing?tag=handwerk")).text, /hans@smoke\.test/);
        assert.doesNotMatch((await crm.get("/crm/marketing?tag=VIP")).text, /hans@smoke\.test/);

        // Umbenennen
        assertRedirect(await crm.post("/crm/marketing/groups/rename", { from: "handwerk", to: "Handwerker" }), "umbenennen", "/crm/marketing/groups");
        assert.deepEqual([...(await Company.findById(company._id)).tags], ["Newsletter", "Handwerker"]);
        assert.match((await crm.get("/crm/marketing/groups")).text, /heißt jetzt/);

        // Zusammenführen: Umbenennen auf einen vorhandenen Namen
        assertRedirect(await crm.post("/crm/marketing/groups/rename", { from: "Handwerker", to: "newsletter" }), "zusammenführen");
        assert.deepEqual([...(await Company.findById(company._id)).tags], ["Newsletter"]);

        // Entfernen (Smoke Praxis behält ihre Schlagwörter)
        assertRedirect(await crm.post("/crm/marketing/groups/remove", { tag: "NEWSLETTER" }), "entfernen", "/crm/marketing/groups");
        assert.deepEqual([...(await Company.findById(company._id)).tags], []);
        assert.deepEqual([...(await Company.findOne({ companyName: "Smoke Praxis" })).tags], ["Arztpraxis", "VIP"]);

        // Ohne neuen Namen passiert nichts
        assertRedirect(await crm.post("/crm/marketing/groups/rename", { from: "VIP", to: "" }), "leer");
        assert.deepEqual([...(await Company.findOne({ companyName: "Smoke Praxis" })).tags], ["Arztpraxis", "VIP"]);

    });

    await t.test("Marketing: Kampagnen anlegen, prüfen, testen, versenden", async () => {

        const Campaign = require("../src/models/campaign.model");
        const campaignService = require("../src/services/campaign.service");
        const emailService = require("../src/services/email.service");

        const base = "/crm/marketing/campaigns";

        await Company.updateOne({ _id: company._id }, { $set: { tags: ["Holzhandel"] } });

        assertPage(await crm.get(base), base);
        assertPage(await crm.get(`${base}/new`), `${base}/new`);
        assert.match((await crm.get("/crm")).text, /\/crm\/marketing\/campaigns/, "Navigation: Kampagnen");

        // Fehler: Formular mit Meldung statt JSON
        const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

        const short = await crm.post(base, { name: "Kurz", subject: "Hallo", format: "html", content: "<p><strong>kurz</strong></p>" });
        assert.equal(short.status, 422);
        assert.match(short.text, /mindestens 10 Zeichen/);
        assert.match(short.text, /<form/);

        const unknown = await crm.post(base, { name: "Tippfehler", subject: "Hallo", format: "html", content: "<p>Hallo {{vornahme}}, wie geht es?</p>" });
        assert.equal(unknown.status, 422);
        assert.match(unknown.text, /Unbekannter Platzhalter/);

        assert.equal(await Campaign.countDocuments(), 0, "nichts gespeichert");

        // Genau die Eingabe, die früher gescheitert ist – so, wie der Editor sie schickt (mit Bild)
        const form = {
            name: "Email an Holzhändler",
            description: "Herbstausgabe",
            subject: "Hallo {{firstName}} {{lastName}} Für eure {{company}} gibt es tolle Herbstangebote",
            format: "html",
            content: "<p>{{anrede}},</p><p><br></p><p>{{firstName}} {{lastName}} Jetzt im Herbst sollte <strong>{{company}}</strong> unbedingt an so etwas denken: https://vonnebrink.com</p>"
                + `<p><img src="data:image/png;base64,${PNG}"></p><script>alert(1)</script>`,
            tags: "Holzhandel"
        };

        const created = await crm.post(base, form);
        assert.equal(created.status, 302, `Anlegen: Status ${created.status}`);

        const campaign = await Campaign.findOne({ name: "Email an Holzhändler" });
        assert.ok(campaign, "gespeichert");
        assert.equal(created.location, `${base}/${campaign._id}`);
        assert.match(campaign.campaignNumber, /^KAM-\d{6}$/);
        assert.deepEqual([...campaign.audience.tags], ["Holzhandel"]);
        assert.equal(campaign.status, "draft");
        assert.equal(campaign.format, "html");
        assert.doesNotMatch(campaign.content, /<script/, "beim Speichern bereinigt");
        assert.match(campaign.content, /<img src="data:image\/png;base64,/);

        const show = await crm.get(`${base}/${campaign._id}`);
        assertPage(show, "Kampagne anzeigen");
        assert.match(show.text, /Kampagne gespeichert/);
        assert.match(show.text, /Mailversand ist nicht eingerichtet/, "ohne SMTP kein Versand-Knopf");
        assert.match(show.text, /value="admin@smoke\.test"/, "eigene Adresse für die Test-Mail");

        // Vorschau mit Beispielwerten
        const preview = await crm.get(`${base}/${campaign._id}/preview`);
        assert.equal(preview.status, 200);
        assert.match(preview.contentType, /text\/html/);
        assert.match(preview.text, /Sehr geehrter Herr Mustermann/);
        assert.match(preview.text, /Max Mustermann Jetzt im Herbst sollte <strong>Muster GmbH<\/strong>/);
        assert.match(preview.text, /<img src="data:image\/png;base64,/, "Bild in der Vorschau");
        assert.match(preview.text, /href="https:\/\/vonnebrink\.com"/);
        assert.match(preview.text, /hier abmelden/);

        const draftPreview = await crm.post(`${base}/preview`, { subject: "Test", format: "html", content: "<p>Ungespeichert <script>alert(1)</script> {{firma}}</p>" });
        assert.equal(draftPreview.status, 200);
        assert.match(draftPreview.text, /Ungespeichert/);
        assert.doesNotMatch(draftPreview.text, /<script>alert/);
        assert.match(draftPreview.text, /Muster GmbH/);

        // Großes Bild (über dem normalen 100-KB-Formularlimit) wird angenommen
        const bigImage = "A".repeat(400 * 1024);
        const bigPreview = await crm.post(`${base}/preview`, { subject: "Groß", format: "html", content: `<p>Mit großem Bild</p><img src="data:image/png;base64,${bigImage}">` });
        assert.equal(bigPreview.status, 200, `großes Bild: Status ${bigPreview.status}`);

        // Bearbeiten
        assertPage(await crm.get(`${base}/${campaign._id}/edit`), "Kampagne bearbeiten");
        assertRedirect(await crm.post(`${base}/${campaign._id}/update`, { ...form, name: "Holzhändler Herbst" }), "speichern", `${base}/${campaign._id}`);
        assert.equal((await Campaign.findById(campaign._id)).name, "Holzhändler Herbst");

        const badUpdate = await crm.post(`${base}/${campaign._id}/update`, { ...form, subject: "" });
        assert.equal(badUpdate.status, 422);
        assert.match(badUpdate.text, /Betreffzeile/);

        // Test-Mail ohne SMTP: protokolliert, nicht verschickt
        assertRedirect(await crm.post(`${base}/${campaign._id}/test`, { email: "ralf@smoke.test" }), "Test-Mail", `${base}/${campaign._id}`);
        assert.match((await crm.get(`${base}/${campaign._id}`)).text, /nicht verschickt: Mailversand nicht konfiguriert/);

        const testLog = await EmailLog.findOne({ template: `kampagne-test ${campaign.campaignNumber}` });
        assert.ok(testLog, "Test-Mail im Protokoll");
        assert.equal(testLog.status, "skipped");
        assert.match(testLog.subject, /^\[Test\] Hallo Max Mustermann/);

        // Versand ohne SMTP wird abgelehnt
        assertRedirect(await crm.post(`${base}/${campaign._id}/send`, {}), "Versand ohne SMTP");
        assert.equal((await Campaign.findById(campaign._id)).status, "draft");

        // Versand mit (simuliertem) Mailserver
        const original = { isConfigured: emailService.isConfigured, send: emailService.send, appUrl: process.env.APP_URL };
        const outbox = [];

        emailService.isConfigured = () => true;

        // CRM nur im Büronetz: kein Versand (Abmeldelinks wären für Kunden tot)
        process.env.APP_URL = "http://192.168.178.35:3000";
        emailService.send = async (message) => {
            outbox.push(message);
            return { sent: true, messageId: `<smoke-${outbox.length}>`, recipients: [message.to] };
        };

        try {

            const lan = await crm.get(`${base}/${campaign._id}`);
            assert.match(lan.text, /Abmeldelinks nicht erreichbar/);
            assert.doesNotMatch(lan.text, /Jetzt an 1 Empfänger senden/);

            assertRedirect(await crm.post(`${base}/${campaign._id}/send`, {}), "Versand mit LAN-Adresse");
            assert.equal((await Campaign.findById(campaign._id)).status, "draft");
            assert.match((await crm.get(`${base}/${campaign._id}`)).text, /192\.168\.178\.35/);
            assert.equal(outbox.length, 0);

            // Öffentliche Adresse (wie später auf der VPS)
            process.env.APP_URL = "https://crm.vonnebrink-smoke.de";

            assert.match((await crm.get(`${base}/${campaign._id}`)).text, /Jetzt an 1 Empfänger senden/);

            assertRedirect(await crm.post(`${base}/${campaign._id}/send`, {}), "Versand", `${base}/${campaign._id}`);
            await campaignService.waitForSending();

            const sent = await Campaign.findById(campaign._id);
            assert.equal(sent.status, "sent");
            assert.equal(sent.stats.total, 1);
            assert.equal(sent.stats.sent, 1);
            assert.equal(sent.deliveries[0].email, "hans@smoke.test");
            assert.equal(sent.deliveries[0].status, "sent");
            assert.ok(sent.sentAt);

            assert.equal(outbox.length, 1);
            assert.equal(outbox[0].to, "hans@smoke.test");
            assert.equal(outbox[0].subject, "Hallo Hans Smoke Für eure Smoke GmbH gibt es tolle Herbstangebote");
            assert.match(outbox[0].html, /Sehr geehrter Herr Smoke/);
            assert.match(outbox[0].html, /<strong>Smoke GmbH<\/strong>/);

            // Bild als Anhang mit Content-ID, nicht als data:-Adresse
            assert.match(outbox[0].html, /src="cid:bild1@kampagne"/);
            assert.doesNotMatch(outbox[0].html, /data:image/);
            assert.equal(outbox[0].attachments.length, 1);
            assert.equal(outbox[0].attachments[0].cid, "bild1@kampagne");
            assert.equal(outbox[0].attachments[0].contentType, "image/png");
            assert.match(outbox[0].html, /https:\/\/crm\.vonnebrink-smoke\.de\/email\/abmelden\//, "Abmeldelink mit öffentlicher Adresse");

            const token = (await Contact.findById(contact._id)).marketing.unsubscribeToken;
            assert.match(outbox[0].html, new RegExp(`/email/abmelden/${token}`), "persönlicher Abmeldelink");
            assert.match(outbox[0].headers["List-Unsubscribe"], new RegExp(token));
            assert.equal(outbox[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

            assert.ok(await EmailLog.exists({ template: `kampagne ${campaign.campaignNumber}`, status: "sent" }), "Kampagnen-Mail im Protokoll");

            // Kein zweiter Versand, keine Änderungen mehr
            assertRedirect(await crm.post(`${base}/${campaign._id}/send`, {}), "erneuter Versand");
            assert.equal(outbox.length, 1, "niemand bekommt die Mail doppelt");

            const afterPage = await crm.get(`${base}/${campaign._id}`);
            assertPage(afterPage, "versendete Kampagne");
            assert.match(afterPage.text, /bereits versendet/);
            assert.match(afterPage.text, /hans@smoke\.test/);

            assertRedirect(await crm.get(`${base}/${campaign._id}/edit`), "Bearbeiten nach Versand", `${base}/${campaign._id}`);
            assertRedirect(await crm.post(`${base}/${campaign._id}/update`, { ...form, name: "geändert" }), "Speichern nach Versand");
            assert.equal((await Campaign.findById(campaign._id)).name, "Holzhändler Herbst");

            // Unterbrochener Versand (Serverneustart): wer sich inzwischen abgemeldet hat, wird übersprungen
            const doris = await Contact.findOne({ email: "doris@smoke.test" });
            assert.equal(doris.marketing.status, "revoked");

            const interrupted = await Campaign.create({
                campaignNumber: "KAM-999999",
                name: "Unterbrochen",
                subject: "Hallo {{vorname}}",
                content: "Ein unterbrochener Versand.",
                status: "sending",
                deliveries: [
                    { contact: contact._id, email: "hans@smoke.test", name: "Hans Smoke", status: "sent", sentAt: new Date() },
                    { contact: doris._id, email: "doris@smoke.test", name: "Doris Doi", status: "pending" }
                ],
                stats: { total: 2, sent: 1, failed: 0, skipped: 0 }
            });

            assert.equal(await campaignService.resumeInterrupted(), 1);
            await campaignService.waitForSending();

            const resumed = await Campaign.findById(interrupted._id);
            assert.equal(resumed.status, "sent");
            assert.equal(resumed.deliveries[1].status, "skipped");
            assert.match(resumed.deliveries[1].error, /Abgemeldet/);
            assert.equal(resumed.stats.skipped, 1);
            assert.equal(outbox.length, 1, "Hans nicht erneut, Doris gar nicht");

        } finally {

            emailService.isConfigured = original.isConfigured;
            emailService.send = original.send;

            if (original.appUrl === undefined) delete process.env.APP_URL;
            else process.env.APP_URL = original.appUrl;

        }

        // Ältere Kampagne im Textformat: im Editor als HTML, nach dem Speichern HTML
        const legacy = await Campaign.create({
            campaignNumber: "KAM-999998",
            name: "Alt",
            subject: "Alt",
            content: "Erste Zeile\n\nZweiter Absatz mit https://vonnebrink.com"
        });

        assert.equal(legacy.format, "text");

        const legacyEdit = await crm.get(`${base}/${legacy._id}/edit`);
        assertPage(legacyEdit, "alte Kampagne bearbeiten");
        assert.match(legacyEdit.text, /&lt;p style=&quot;margin:0 0 14px;&quot;&gt;Zweiter Absatz/);

        assert.match((await crm.get(`${base}/${legacy._id}/preview`)).text, /<a href="https:\/\/vonnebrink\.com"/);

        assertRedirect(await crm.post(`${base}/${legacy._id}/update`, { name: "Alt", subject: "Alt", format: "html", content: "<p>Jetzt aus dem Editor.</p>" }), "alte Kampagne speichern");
        assert.equal((await Campaign.findById(legacy._id)).format, "html");

        // Duplizieren und Löschen
        const copy = await crm.post(`${base}/${campaign._id}/duplicate`, {});
        assert.equal(copy.status, 302);

        const duplicate = await Campaign.findOne({ name: "Kopie von Holzhändler Herbst" });
        assert.ok(duplicate);
        assert.equal(duplicate.status, "draft");
        assert.equal(duplicate.deliveries.length, 0);
        assert.equal(copy.location, `${base}/${duplicate._id}/edit`);
        assert.match((await crm.get(copy.location)).text, /Kopie angelegt/, "Hinweis auf der Bearbeiten-Seite");

        assertRedirect(await crm.post(`${base}/${duplicate._id}/delete`, {}), "löschen", base);
        assert.equal((await Campaign.findById(duplicate._id)).isDeleted, true);
        assert.equal((await crm.get(`${base}/${duplicate._id}`)).status, 404);

        for (const url of [base, `${base}?status=sent`, `${base}?search=Holz`, `${base}?status=quatsch`]) {
            assertPage(await crm.get(url), url);
        }

        assert.equal((await crm.get(`${base}/kaputt`)).status, 404);

        // Rechte
        const tech = createClient(baseUrl);
        assertRedirect(await tech.post("/crm/login", { username: "smoke-tech", password: PASSWORD }), "Login Techniker");
        assert.equal((await tech.get(base)).status, 403, "Techniker: keine Kampagnen");
        assert.equal((await tech.post(`${base}/${campaign._id}/send`, {})).status, 403);

        const sales = createClient(baseUrl);
        assertRedirect(await sales.post("/crm/login", { username: "smoke-sales", password: PASSWORD }), "Login Vertrieb");
        assertPage(await sales.get(base), "Vertrieb Kampagnen");
        assertPage(await sales.get(`${base}/${campaign._id}`), "Vertrieb Kampagne");

        await Company.updateOne({ _id: company._id }, { $set: { tags: [] } });

    });

    await t.test("Rollen: Techniker – Tickets und Assets, kein Marketing", async () => {

        const tech = createClient(baseUrl);
        assertRedirect(await tech.post("/crm/login", { username: "smoke-tech", password: PASSWORD }), "Login Techniker");

        for (const url of ["/crm", "/crm/companies", "/crm/contacts", "/crm/tickets", `/crm/tickets/${ticket._id}`, "/crm/assets", `/crm/assets/${manualAsset._id}/edit`]) {
            assertPage(await tech.get(url), `Techniker ${url}`);
        }

        assert.equal((await tech.get("/crm/marketing")).status, 403, "Techniker: kein Marketing");
        assert.equal((await tech.get("/crm/marketing/groups")).status, 403);
        assert.doesNotMatch((await tech.get("/crm")).text, /\/crm\/marketing/, "kein Marketing-Menü");

        const before = (await Contact.findById(contact._id)).marketing.history.length;
        assert.equal((await tech.post(`/crm/contacts/${contact._id}/marketing`, { consent: "revoked" })).status, 403);
        assert.equal((await Contact.findById(contact._id)).marketing.history.length, before);

        assert.equal((await tech.post("/crm/marketing/groups/rename", { from: "VIP", to: "Gold" })).status, 403);
        assert.deepEqual([...(await Company.findOne({ companyName: "Smoke Praxis" })).tags], ["Arztpraxis", "VIP"]);

    });

    await t.test("Rollen: Vertrieb – Ticketliste ohne Inhalt, Assets lesen, Marketing", async () => {

        const sales = createClient(baseUrl);
        assertRedirect(await sales.post("/crm/login", { username: "smoke-sales", password: PASSWORD }), "Login Vertrieb");

        for (const url of ["/crm", "/crm/companies", `/crm/companies/${company._id}`, "/crm/contacts", `/crm/contacts/${contact._id}`, "/crm/assets", `/crm/assets/${manualAsset._id}`, "/crm/marketing", "/crm/marketing/groups", "/crm/search?q=Smoke"]) {
            assertPage(await sales.get(url), `Vertrieb ${url}`);
        }

        // Liste: Betreff und Status ja, aber kein Link ins Ticket
        const list = await sales.get("/crm/tickets");
        assertPage(list, "Vertrieb Ticketliste");
        assert.match(list.text, /Smoke Drucker/);
        assert.doesNotMatch(list.text, new RegExp(`/crm/tickets/${ticket._id}`), "kein Link ins Ticket");
        assert.doesNotMatch(list.text, /\/crm\/tickets\/new/, "kein Neues Ticket");

        // Suche in der Liste nicht in der Beschreibung
        assert.doesNotMatch((await sales.get("/crm/tickets?search=Druckt")).text, /Smoke Drucker/, "Beschreibung nicht durchsuchbar");

        assert.doesNotMatch((await sales.get(`/crm/companies/${company._id}`)).text, new RegExp(`/crm/tickets/${ticket._id}`), "Firma ohne Ticket-Link");
        assert.doesNotMatch((await sales.get("/crm")).text, new RegExp(`/crm/tickets/${ticket._id}`), "Dashboard ohne Ticket-Link");

        // Ticket selbst gesperrt
        const crmAttachment = await Attachment.findOne({ ticket: ticket._id, originalName: "crm.txt" });

        for (const url of [`/crm/tickets/${ticket._id}`, `/crm/tickets/${ticket._id}/edit`, "/crm/tickets/new", `/crm/tickets/${ticket._id}/attachments/${crmAttachment._id}`]) {
            assert.equal((await sales.get(url)).status, 403, `Vertrieb ${url}`);
        }

        const messages = await mongoose.connection.db.collection("ticketmessages").countDocuments();
        assert.equal((await sales.post(`/crm/tickets/${ticket._id}/messages`, { message: "darf nicht" })).status, 403);
        assert.equal(await mongoose.connection.db.collection("ticketmessages").countDocuments(), messages);
        assert.equal((await sales.post("/crm/tickets", { company: String(company._id), subject: "Vertrieb", description: "x" })).status, 403);
        assert.equal((await sales.post(`/crm/tickets/${ticket._id}/delete`, {})).status, 403);

        // Assets: nur lesen
        assert.equal((await sales.get("/crm/assets/new")).status, 403);
        assert.equal((await sales.get(`/crm/assets/${manualAsset._id}/edit`)).status, 403);
        assert.equal((await sales.post(`/crm/assets/${manualAsset._id}/delete`, {})).status, 403);
        assert.ok(await Asset.exists({ _id: manualAsset._id, isDeleted: false }));
        assert.doesNotMatch((await sales.get(`/crm/assets/${manualAsset._id}`)).text, /Asset löschen/);

        // Suche: keine Tickets, kein Sprung ins Ticket
        assertPage(await sales.get("/crm/search?q=TIC-900001"), "Nummernsprung gesperrt");
        const suggest = JSON.parse((await sales.get("/crm/search/suggest?q=Smoke")).text);
        assert.equal(suggest.tickets.total, 0, "Vorschläge ohne Tickets");
        assert.ok(suggest.companies.total >= 1);

        // Marketing ändern erlaubt
        assertRedirect(await sales.post("/crm/marketing/groups/rename", { from: "VIP", to: "VIP" }), "Vertrieb Gruppen");

        // Verwaltung gesperrt
        assert.equal((await sales.get("/crm/users")).status, 403);

    });

    await t.test("CRM: E-Mail-Protokoll und Test-Mail", async () => {

        // Ohne SMTP: Test-Mail wird nicht verschickt, aber protokolliert
        assertRedirect(await crm.post("/crm/email-log/test", {}), "Test-Mail", "/crm/email-log");

        const entry = await EmailLog.findOne({ to: "admin@smoke.test" }).sort({ createdAt: -1 });
        assert.ok(entry, "Protokolleintrag für die Test-Mail");
        assert.equal(entry.status, "skipped");
        assert.match(entry.error, /nicht konfiguriert/);

        const page = await crm.get("/crm/email-log");
        assertPage(page, "/crm/email-log");
        assert.match(page.text, /Test-Mail nicht verschickt/, "Hinweis nach der Test-Mail");
        assert.match(page.text, /admin@smoke\.test/);

        assertRedirect(await crm.post("/crm/email-log/verify", {}), "Verbindung prüfen", "/crm/email-log");

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

    await t.test("Portal: Marketing selbst an- und abmelden", async () => {

        const page = await portal.get("/portal/profile");
        assert.match(page.text, /Informationen per E-Mail/);

        // Abmelden im Portal
        assertRedirect(await portal.post("/portal/profile/marketing", { marketing: "no" }), "Portal abmelden", "/portal/profile");
        let marketing = (await Contact.findById(contact._id)).marketing;
        assert.equal(marketing.status, "revoked");
        assert.equal(marketing.source, "portal");
        assert.equal(marketing.history.at(-1).by, "Hans Smoke");
        assert.match((await portal.get("/portal/profile")).text, /abgemeldet/i);

        // Mitarbeiter darf ihn jetzt NICHT wieder eintragen
        assertRedirect(await crm.post(`/crm/contacts/${contact._id}/marketing`, { consent: "granted", note: "telefonisch zugesagt" }), "CRM nach Portal-Abmeldung");
        assert.equal((await Contact.findById(contact._id)).marketing.status, "revoked", "Portal-Abmeldung bleibt bestehen");
        assert.match((await crm.get(`/crm/contacts/${contact._id}`)).text, /selbst abgemeldet/);

        // Der Kontakt selbst darf sich wieder anmelden
        assertRedirect(await portal.post("/portal/profile/marketing", { marketing: "yes" }), "Portal anmelden", "/portal/profile");
        marketing = (await Contact.findById(contact._id)).marketing;
        assert.equal(marketing.status, "granted");
        assert.equal(marketing.source, "portal");
        assert.match((await crm.get("/crm/marketing")).text, /hans@smoke\.test/);


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

        const reply = await Notification.findOne({ user: admin._id, event: "ticket.updated", link: `/crm/tickets/${ticket._id}` }).lean();
        assert.ok(reply, "Antwort vom Kunden in der Glocke");
        assert.match(reply.title, /Antwort vom Kunden/);
        assert.match(reply.message, /Antwort vom Kunden/);

        const uploaded = await portal.upload(`/portal/tickets/${ticket._id}/attachments`, uploadForm("portal.txt", "Inhalt aus dem Portal"));
        assertRedirect(uploaded, "Upload Portal", `/portal/tickets/${ticket._id}`);

        assert.ok(await Notification.exists({ user: admin._id, event: "ticket.updated", title: /Datei vom Kunden/, message: /portal\.txt/ }), "Datei vom Kunden in der Glocke");
        assert.match((await crm.get("/crm/notifications")).text, /Datei vom Kunden/, "Übersicht zeigt die Benachrichtigung");

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

    // ------------------------------------------------
    // Beispieldaten (npm run dev:seed)
    // ------------------------------------------------

    await t.test("Beispieldaten: Seeder füllt eine leere Datenbank", async () => {

        // Geschäftsdaten leeren wie reset-demo-data (Benutzer bleiben)
        for (const name of ["companies", "contacts", "portalaccounts", "tickets", "ticketmessages", "attachments", "assets", "notifications", "counters"]) {
            await mongoose.connection.db.collection(name).deleteMany({});
        }

        const { seed } = require("../src/scripts/seed-demo-data");
        const { COMPANIES, PORTAL_PASSWORD } = require("../src/scripts/seed/demoData");

        const summary = await seed({ log: () => {} });

        const expected = (key) => COMPANIES.reduce((n, c) => n + c[key].length, 0);

        assert.equal(summary.companies, COMPANIES.length);
        assert.equal(await Company.countDocuments(), COMPANIES.length);
        assert.equal(await Contact.countDocuments(), expected("contacts"));
        assert.equal(await Asset.countDocuments(), expected("assets"));
        assert.equal(await Ticket.countDocuments(), expected("tickets"));
        assert.equal(await Notification.countDocuments(), 0, "Seeder löst keine Benachrichtigungen aus");

        const first = await Company.findOne({ companyName: COMPANIES[0].companyName });
        assert.equal(first.customerNumber, "CUS-000001", "Nummern beginnen nach dem Reset bei 1");

        assert.ok(await Ticket.exists({ status: "in_progress", assignedTo: admin._id }), "Status und Bearbeiter gesetzt");

        // Zweiter Lauf ohne --force wird abgelehnt
        await assert.rejects(seed({ log: () => {} }), /bereits/);

        // Seiten mit Beispieldaten
        const viewer = createClient(baseUrl);
        assertRedirect(await viewer.post("/crm/login", { username: "smoke-admin", password: PASSWORD }), "Login");

        for (const url of ["/crm", "/crm/companies", "/crm/tickets", "/crm/assets", `/crm/companies/${first._id}`]) {
            const page = await viewer.get(url);
            assertPage(page, url);
        }

        const companyList = (await viewer.get("/crm/companies")).text;
        assert.match(companyList, /Bäckerei Sonnenschein/);
        assert.match(companyList, /Branche \/ Gruppe/, "Schlagwort-Filter mit Beispieldaten");

        // Marketing mit Beispieldaten
        const expectedMarketing = (value) => COMPANIES.flatMap((c) => c.contacts).filter((p) => p.marketing === value).length;
        assert.equal(summary.marketing.granted, expectedMarketing("granted") + expectedMarketing("customer"));
        assert.equal(await Contact.countDocuments({ "marketing.status": "granted", "marketing.source": "portal" }), expectedMarketing("granted"));
        assert.equal(await Contact.countDocuments({ "marketing.status": "granted", "marketing.source": "customer" }), expectedMarketing("customer"));
        assert.equal(await Contact.countDocuments({ "marketing.status": "revoked" }), expectedMarketing("revoked"));

        for (const url of ["/crm/marketing", "/crm/marketing?show=all", "/crm/marketing/groups"]) {
            assertPage(await viewer.get(url), url);
        }

        // Portal-Login mit Beispielzugang
        const customer = createClient(baseUrl);
        assertRedirect(await customer.post("/portal/login", { email: summary.portalAccounts[0], password: PORTAL_PASSWORD }), "Portal-Login Beispielzugang", "/portal");
        assertPage(await customer.get("/portal/tickets"), "/portal/tickets (Beispieldaten)");

    });

});

module.exports = { testDatabaseUri, databaseName };
