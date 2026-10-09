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
