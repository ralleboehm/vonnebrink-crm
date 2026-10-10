"use strict";

// Tests für gemeinsame Helfer (core/, utils/).
// Ausführen mit:  node --test test/core.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const format = require("../src/utils/format");
const pagination = require("../src/utils/pagination");
const redirect = require("../src/core/http/redirect");
const flash = require("../src/core/http/flash");
const labels = require("../src/utils/assetLabels");

test("format: Datum, Uhrzeit, relative Zeit", () => {

    assert.equal(format.formatDate(new Date("2026-10-09T10:00:00Z")), "9.10.2026");
    assert.equal(format.formatDateTime(new Date("2026-10-09T10:05:00Z")), "09.10.2026, 12:05");
    assert.equal(format.formatDate(null), "-");
    assert.equal(format.formatDate("kaputt"), "-");
    assert.equal(format.dateInputValue("2026-03-05T00:00:00Z"), "2026-03-05");
    assert.equal(format.timeAgo(new Date("2026-10-09T11:59:30Z"), new Date("2026-10-09T12:00:00Z")), "vor 1 Min.");

    // assetLabels reicht dieselben Funktionen weiter
    assert.equal(labels.formatDateTime, format.formatDateTime);

});

test("pagination: Grenzen und Ergebnisobjekt", () => {

    assert.deepEqual(pagination.parsePagination({ page: "3", perPage: "10" }), { page: 3, perPage: 10, skip: 20 });
    assert.deepEqual(pagination.parsePagination({ page: "-1", perPage: "9999" }), { page: 1, perPage: 100, skip: 0 });
    assert.deepEqual(pagination.parsePagination({}, { perPage: 25 }), { page: 1, perPage: 25, skip: 0 });

    assert.deepEqual(pagination.buildPage(["a"], 51, { page: 2, perPage: 25 }), { items: ["a"], total: 51, page: 2, pages: 3, perPage: 25 });
    assert.equal(pagination.buildPage([], 0, { page: 1, perPage: 25 }).pages, 1);

});

test("redirect: nur interne Ziele", () => {

    for (const ok of ["/crm", "/crm/tickets/1?x=2", "/portal"]) {
        assert.equal(redirect.isInternalPath(ok), true, ok);
    }

    for (const bad of ["https://boese.de", "//boese.de", "/\\boese.de", "javascript:alert(1)", "", null, "/crm\r\nSet-Cookie: x"]) {
        assert.equal(redirect.isInternalPath(bad), false, String(bad));
    }

    assert.equal(redirect.safeRedirectTarget("//boese.de", "/crm"), "/crm");
    assert.equal(redirect.safeRedirectTarget(" /crm/assets ", "/crm"), "/crm/assets");

});

test("flash: einmal setzen, einmal lesen", () => {

    const req = { session: {} };

    flash.setFlash(req, "success", "Gespeichert.");
    assert.deepEqual(flash.takeFlash(req), { type: "success", text: "Gespeichert." });
    assert.equal(flash.takeFlash(req), null);

    flash.setFlash(req, "unbekannt", 42);
    assert.deepEqual(flash.takeFlash(req), { type: "info", text: "42" });

    assert.equal(flash.takeFlash({}), null);

});

// ----------------------------------------------------
// Event-Bus
// ----------------------------------------------------

const bus = require("../src/core/events");

test("Event-Bus: mehrere Zuhörer, Fehler isoliert, Reihenfolge", async () => {

    const seen = [];

    const offA = bus.on(bus.EVENTS.INVOICE_CREATED, async (p) => { seen.push(`a:${p.n}`); return 1; }, { name: "a" });
    const offB = bus.on(bus.EVENTS.INVOICE_CREATED, () => { throw new Error("kaputt"); }, { name: "b" });
    const offC = bus.on(bus.EVENTS.INVOICE_CREATED, (p) => { seen.push(`c:${p.n}`); }, { name: "c" });

    const originalError = console.error;
    console.error = () => {};

    try {

        const results = await bus.emit(bus.EVENTS.INVOICE_CREATED, { n: 7 });

        assert.deepEqual(seen, ["a:7", "c:7"]);
        assert.deepEqual(results.map((r) => [r.listener, r.ok]), [["a", true], ["b", false], ["c", true]]);
        assert.equal(results[1].error, "kaputt");

    } finally {

        console.error = originalError;
        offA(); offB(); offC();

    }

    assert.equal(bus.listenerCount(bus.EVENTS.INVOICE_CREATED), 0);
    assert.deepEqual(await bus.emit(bus.EVENTS.INVOICE_CREATED, {}), []);

});

test("Event-Bus: nur bekannte Ereignisse", async () => {

    assert.throws(() => bus.on("rechnung.erstellt", () => {}), /Unbekanntes Ereignis/);
    await assert.rejects(bus.emit("rechnung.erstellt", {}), /Unbekanntes Ereignis/);

    for (const name of ["ticket.created", "ticket.updated", "asset.created", "asset.updated", "customer.created", "sales.created", "invoice.created"]) {
        assert.equal(bus.isKnownEvent(name), true, name);
    }

});

// ----------------------------------------------------
// Rechte
// ----------------------------------------------------

const permissions = require("../src/core/permissions");

test("Rechte: Rollen bilden das heutige Verhalten ab", () => {

    const { can } = permissions;

    assert.equal(can({ role: "admin" }, "users.manage"), true);
    assert.equal(can({ role: "admin" }, "invoices.edit"), true);

    for (const role of ["technician", "sales"]) {
        assert.equal(can({ role }, "companies.edit"), true, role);
        assert.equal(can({ role }, "contacts.edit"), true, role);
        assert.equal(can({ role }, "users.manage"), false, role);
        assert.equal(can({ role }, "import.run"), false, role);
        assert.equal(can({ role }, "integrations.manage"), false, role);
    }

    // Techniker: Tickets und Assets ganz, kein Marketing
    assert.equal(can("technician", "tickets.view"), true);
    assert.equal(can("technician", "tickets.delete"), true);
    assert.equal(can("technician", "assets.edit"), true);
    assert.equal(can("technician", "marketing.view"), false);

    // Vertrieb: keine Tickets und Assets, Marketing
    assert.equal(can("technician", "tickets.list"), true);
    assert.equal(can("technician", "assets.view"), true);
    assert.equal(can("sales", "tickets.list"), false);
    assert.equal(can("sales", "assets.view"), false);
    assert.equal(can("sales", "tickets.view"), false);
    assert.equal(can("sales", "tickets.edit"), false);
    assert.equal(can("sales", "assets.edit"), false);
    assert.equal(can("sales", "marketing.manage"), true);

    assert.equal(can("sales", "quotes.edit"), true);
    assert.equal(can("technician", "quotes.edit"), false);
    assert.equal(can("accounting", "invoices.edit"), true);
    assert.equal(can("accounting", "tickets.view"), false);
    assert.equal(can("portal", "tickets.view"), false);
    assert.equal(can(null, "tickets.view"), false);
    assert.equal(can({ role: "unbekannt" }, "tickets.view"), false);

});

test("Rechte: requirePermission-Middleware", () => {

    const run = (user, ...perms) => {
        const result = {};
        const res = {
            redirect: (to) => { result.redirect = to; },
            status: (code) => { result.status = code; return { send: () => {} }; }
        };
        permissions.requirePermission(...perms)({ session: { user } }, res, () => { result.next = true; });
        return result;
    };

    assert.deepEqual(run({ role: "admin" }, "users.manage"), { next: true });
    assert.deepEqual(run({ role: "sales" }, "users.manage"), { status: 403 });
    assert.deepEqual(run(null, "tickets.view"), { redirect: "/crm/login" });
    assert.deepEqual(run({ role: "technician" }, "tickets.view", "users.manage"), { status: 403 });

});

// ----------------------------------------------------
// Einheitliche Service-Namen
// ----------------------------------------------------

test("CRUD-Aliase ergänzen, überschreiben aber nichts", async () => {

    const { applyCrudAliases } = require("../src/core/service/crudAliases");

    const service = {
        getAll: async () => "liste",
        getById: async (id) => `datensatz ${id}`,
        softDelete: async (id) => `gelöscht ${id}`
    };

    applyCrudAliases(service);

    assert.equal(await service.findAll(), "liste");
    assert.equal(await service.findById(3), "datensatz 3");
    assert.equal(await service.delete(4), "gelöscht 4");

    const own = applyCrudAliases({ delete: () => "eigenes delete", softDelete: () => "soft" });
    assert.equal(own.delete(), "eigenes delete");

    class Klasse { async getById(id) { return this.prefix + id; } }
    const instance = applyCrudAliases(Object.assign(new Klasse(), { prefix: "K" }));
    assert.equal(await instance.findById(1), "K1");

});

// ----------------------------------------------------
// Zeitstempel im Log
// ----------------------------------------------------

test("Log-Zeitstempel: Format und morgan-Kanal", () => {

    const logging = require("../src/core/logging/timestamps");

    assert.equal(logging.timestamp(new Date("2026-10-09T10:44:03Z")), "2026-10-09 12:44:03");
    assert.equal(logging.timestamp(new Date("2026-01-15T08:00:00Z")), "2026-01-15 09:00:00", "Winterzeit");

    let written = "";
    logging.morganStream({ write: (s) => { written += s; } }).write("GET /crm 200\n");

    assert.match(written, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} GET \/crm 200\n$/);

});

// ----------------------------------------------------
// Schlagwörter (Branche / Gruppen)
// ----------------------------------------------------

test("Schlagwörter: Trennzeichen, Dubletten, Grenzen", () => {

    const { normalizeTags, tagsToText, MAX_TAGS } = require("../src/utils/tags");

    assert.deepEqual(normalizeTags("Arztpraxis, Newsletter;  Lampertheim |#VIP\nNewsletter"), ["Arztpraxis", "Newsletter", "Lampertheim", "VIP"]);
    assert.deepEqual(normalizeTags(["Bau", "bau", " Handwerk , Bau "]), ["Bau", "Handwerk"]);
    assert.deepEqual(normalizeTags(""), []);
    assert.deepEqual(normalizeTags(null), []);
    assert.equal(normalizeTags("x".repeat(80))[0].length, 40);
    assert.equal(normalizeTags(Array.from({ length: 30 }, (_, i) => `T${i}`)).length, MAX_TAGS);
    assert.equal(tagsToText(["A", "B"]), "A, B");
    assert.equal(tagsToText(undefined), "");

});
