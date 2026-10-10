"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { productionProblems } = require("../src/config/production");

const GOOD = {
    NODE_ENV: "production",
    SESSION_SECRET: "a".repeat(64),
    APP_URL: "https://crm.vonnebrink.com",
    PORTAL_URL: "https://portal.vonnebrink.com"
};

test("Produktivbetrieb: vollständige .env ist in Ordnung", () => {

    assert.deepEqual(productionProblems(GOOD), []);
    assert.deepEqual(productionProblems({ ...GOOD, PORTAL_URL: "" }), []);

});

test("Produktivbetrieb: schwaches Geheimnis und http-Adressen werden gemeldet", () => {

    assert.match(productionProblems({ ...GOOD, SESSION_SECRET: "CHANGE_ME" })[0], /SESSION_SECRET/);
    assert.match(productionProblems({ ...GOOD, SESSION_SECRET: "kurz" })[0], /SESSION_SECRET/);
    assert.match(productionProblems({ ...GOOD, APP_URL: "http://192.168.1.5:3000" })[0], /APP_URL/);
    assert.match(productionProblems({ ...GOOD, PORTAL_URL: "http://portal.x.de" })[0], /PORTAL_URL/);

});

test("Entwicklung: keine Prüfung", () => {

    assert.deepEqual(productionProblems({ NODE_ENV: "development" }), []);
    assert.deepEqual(productionProblems({}), []);

});
