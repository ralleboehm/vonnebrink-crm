"use strict";

// Dokumente: Kategorien, Ordner, Rechte, Hilfsfunktionen (ohne Datenbank)
//
// Ausführen mit:  node --test test/documents.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const rules = require("../src/utils/documentRules");
const { can } = require("../src/core/permissions");
const { isKnownEvent } = require("../src/core/events/names");

test("Kundenordner: Name aus Kundennummer und Firma, Unterordner", () => {

    assert.equal(rules.customerFolderName({ customerNumber: "CUS-000001", companyName: "Musterfirma GmbH" }), "CUS-000001 Musterfirma GmbH");
    assert.equal(rules.customerFolderName({ customerNumber: "CUS-000002", companyName: "Müller/Söhne: IT" }), "CUS-000002 Müller-Söhne- IT");
    assert.equal(rules.customerFolderName({}), "Ohne Namen");

    for (const folder of ["Contracts", "Offers", "Invoices", "Manuals", "Licenses", "Reports", "Photos", "Projects", "Downloads", "Other"]) {
        assert.ok(rules.CUSTOMER_FOLDERS.includes(folder), folder);
    }

    assert.equal(rules.CUSTOMER_FOLDERS.includes("Tickets"), false, "Tickets bleiben lokal");
    assert.equal(rules.CUSTOMER_FOLDERS.includes("Assets"), false, "Assets bleiben lokal");

});

test("Kategorien: jede hat Bezeichnung und einen Kundenordner", () => {

    for (const key of ["contract", "offer", "invoice", "license", "manual", "screenshot", "photo", "backup", "configuration", "report", "other"]) {
        assert.ok(rules.isCategory(key), key);
        assert.ok(rules.CATEGORIES[key].label);
        assert.ok(rules.CUSTOMER_FOLDERS.includes(rules.CATEGORIES[key].folder), `${key} → ${rules.CATEGORIES[key].folder}`);
    }

    assert.equal(rules.CATEGORIES.contract.folder, "Contracts");
    assert.equal(rules.CATEGORIES.offer.folder, "Offers");
    assert.equal(rules.isCategory("constructor"), false);
    assert.equal(rules.isCategory("__proto__"), false);

});

test("Kategorien erweitern", () => {

    const added = rules.registerCategory("warranty", { label: "Garantie", folder: "Warranties" });

    assert.equal(added.folder, "Warranties");
    assert.ok(rules.isCategory("warranty"));
    assert.ok(rules.CUSTOMER_FOLDERS.includes("Warranties"));
    assert.throws(() => rules.registerCategory("warranty", { label: "x" }), /gibt es bereits/);
    assert.throws(() => rules.registerCategory("Bad Key", { label: "x" }), /Ungültiger/);

    delete rules.CATEGORIES.warranty;
    rules.CUSTOMER_FOLDERS.splice(rules.CUSTOMER_FOLDERS.indexOf("Warranties"), 1);

});

test("Bezüge: Firma, Kontakt, Ticket, Asset, Vertrag, Angebot, Rechnung", () => {

    for (const type of ["company", "contact", "ticket", "asset", "contract", "offer", "invoice"]) {
        assert.ok(rules.isReferenceType(type), type);
    }

    assert.equal(rules.isReferenceType("user"), false);

});

test("Rechte: Admin alles, Techniker lesen und hochladen, Vertrieb nur Verträge und Angebote", () => {

    for (const permission of ["documents.view", "documents.upload", "documents.edit", "documents.delete", "documents.share"]) {
        assert.equal(can("admin", permission), true, `Admin ${permission}`);
    }

    for (const role of ["technician", "sales"]) {
        assert.equal(can(role, "documents.view"), true, `${role} lesen`);
        assert.equal(can(role, "documents.upload"), true, `${role} hochladen`);
        assert.equal(can(role, "documents.edit"), false, `${role} nicht umbenennen`);
        assert.equal(can(role, "documents.delete"), false, `${role} nicht löschen`);
        assert.equal(can(role, "documents.share"), false, `${role} keine Freigaben`);
    }

    assert.equal(can("portal", "documents.view"), false, "Portal: (noch) nichts");

    assert.deepEqual(rules.allowedCategories({ role: "sales" }), ["contract", "offer"]);
    assert.equal(rules.allowedCategories({ role: "technician" }).length, Object.keys(rules.CATEGORIES).length);
    assert.equal(rules.allowedCategories("admin").length, Object.keys(rules.CATEGORIES).length);
    assert.equal(rules.mayUseCategory({ role: "sales" }, "invoice"), false);
    assert.equal(rules.mayUseCategory({ role: "sales" }, "offer"), true);
    assert.equal(rules.mayUseCategory({ role: "technician" }, "backup"), true);

});

test("Schlagworte", () => {

    assert.deepEqual(rules.parseTags("VPN, Firewall; vpn ,  "), ["VPN", "Firewall"]);
    assert.deepEqual(rules.parseTags(["a", "b"]), ["a", "b"]);
    assert.equal(rules.parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(",")).length, 10);
    assert.equal(rules.parseTags("x".repeat(50))[0].length, 30);
    assert.deepEqual(rules.parseTags(undefined), []);

});

test("Vorschau nur für sichere Dateitypen, Symbole, Größen", () => {

    assert.equal(rules.isPreviewable("application/pdf"), true);
    assert.equal(rules.isPreviewable("image/png"), true);
    assert.equal(rules.isPreviewable("image/svg+xml"), false, "SVG kann Skripte enthalten");
    assert.equal(rules.isPreviewable("text/html"), false);
    assert.equal(rules.isOfficeFile("DOCX"), true);
    assert.equal(rules.fileIcon("pdf"), "bi-file-earmark-pdf");
    assert.equal(rules.fileIcon("xyz"), "bi-file-earmark");
    assert.equal(rules.formatSize(512), "512 B");
    assert.equal(rules.formatSize(1536), "1,5 KB");
    assert.equal(rules.formatSize(5 * 1024 * 1024), "5 MB");
    assert.equal(rules.formatSize(null), "—");

});

test("Dateiname im Download-Kopf: Umlaute und keine Kopfzeilen-Tricks", () => {

    assert.equal(rules.contentDisposition("Angebot Müller.pdf"), "attachment; filename=\"Angebot Muller.pdf\"; filename*=UTF-8''Angebot%20M%C3%BCller.pdf");
    assert.match(rules.contentDisposition("a\"b\r\nX-Evil: 1.pdf", true), /^inline; filename="abX-Evil: 1.pdf"/);

});

test("Ereignisse für Dokumente sind angemeldet", () => {

    for (const name of ["document.uploaded", "document.downloaded", "document.updated", "document.deleted", "document.shared", "document.versionCreated", "customer.created"]) {
        assert.ok(isKnownEvent(name), name);
    }

});

test("Kundenportal: nur bestimmte Kategorien, Recht für Portal-Benutzer vorbereitet", () => {

    assert.deepEqual([...rules.PORTAL_CATEGORIES].sort(), ["contract", "download", "invoice", "manual", "offer", "project"]);
    assert.equal(rules.isPortalCategory("backup"), false);
    assert.equal(rules.isPortalCategory("download"), true);
    assert.equal(rules.CATEGORIES.download.folder, "Downloads");
    assert.equal(can("portal", "portal.documents"), true);
    assert.equal(can("portal", "documents.view"), false, "Portal sieht nie das CRM");

});

test("Verträge: Status, Unterschrift, Fristen", () => {

    const contracts = require("../src/utils/contractRules");

    assert.deepEqual(contracts.STATUS_KEYS, ["draft", "sent", "read", "signed", "active", "expired", "terminated"]);
    assert.equal(contracts.STATUSES.terminated.label, "Gekündigt");
    assert.ok(contracts.SIGNATURE_KEYS.includes("complete"));

    const day = (d) => d.toISOString().slice(0, 10);

    assert.equal(day(contracts.endDate("2026-01-01", 12)), "2026-12-31");
    assert.equal(day(contracts.endDate("2026-01-31", 1)), "2026-02-27", "31.1. + 1 Monat → 28.2., Ende ein Tag davor");
    assert.equal(day(contracts.addMonths("2028-01-31", 1)), "2028-02-29", "Schaltjahr");
    assert.equal(contracts.endDate("2026-01-01", 0), null);

    const d = contracts.deadlines({ startDate: "2026-01-01", termMonths: 24, noticePeriodMonths: 3, renewalMonths: 12 });
    assert.equal(day(d.endDate), "2027-12-31");
    assert.equal(day(d.noticeDeadline), "2027-09-30");
    assert.equal(day(d.renewalDate), "2028-01-01");

    assert.equal(contracts.deadlines({ startDate: "2026-01-01", termMonths: 12, noticePeriodMonths: 3 }).renewalDate, null, "ohne Verlängerung");

    const now = new Date("2027-09-10T00:00:00Z");
    assert.equal(contracts.noticeDue({ status: "active", noticeDeadline: d.noticeDeadline }, now), true);
    assert.equal(contracts.noticeDue({ status: "draft", noticeDeadline: d.noticeDeadline }, now), false);
    assert.equal(contracts.noticeDue({ status: "active", noticeDeadline: d.noticeDeadline }, new Date("2027-01-01T00:00:00Z")), false);

});
