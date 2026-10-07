"use strict";

// Tests: Autoren (CRM-Benutzer oder Portalzugang) auflösen.
// Ausführen mit:  node --test test/author.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const authorService = require("../src/services/author.service");

const users = [{ _id: "u1", firstName: "Ralf", lastName: "Böhm" }];

const accounts = [
    { _id: "a1", email: "kunde@example.de", contact: { firstName: "Karin", lastName: "Kunde" } },
    { _id: "a2", email: "ohne-kontakt@example.de", contact: null }
];

function fake(rows) {
    return {
        find(filter) {
            const ids = filter._id.$in.map(String);
            let result = rows.filter((r) => ids.includes(String(r._id)));
            const q = { populate() { return q; }, lean: async () => result };
            return q;
        }
    };
}

const models = { User: fake(users), PortalAccount: fake(accounts) };

test("Mitarbeiter und Kunden werden unterschieden", async () => {
    const map = await authorService.resolve(["u1", "a1"], models);

    assert.deepEqual(
        [map.get("u1").kind, map.get("u1").firstName, map.get("u1").lastName],
        ["staff", "Ralf", "Böhm"]
    );

    assert.deepEqual(
        [map.get("a1").kind, map.get("a1").firstName, map.get("a1").lastName],
        ["customer", "Karin", "Kunde"]
    );
});

test("Portalzugang ohne Kontakt: E-Mail als Name statt 'Unbekannt'", async () => {
    const map = await authorService.resolve(["a2"], models);
    assert.equal(map.get("a2").kind, "customer");
    assert.equal(map.get("a2").firstName, "ohne-kontakt@example.de");
});

test("attach: ersetzt die ID durch den Autor, unbekannte IDs werden 'unknown'", async () => {
    const items = [
        { _id: "m1", author: "a1", message: "Hallo" },
        { _id: "m2", author: "u1", message: "Antwort" },
        { _id: "m3", author: "gibtsnicht", message: "?" }
    ];

    const result = await authorService.attach(items, "author", models);

    assert.equal(result[0].author.firstName, "Karin");
    assert.equal(result[0].message, "Hallo");
    assert.equal(result[1].author.kind, "staff");
    assert.equal(result[2].author.kind, "unknown");
    assert.equal(result[2].author.firstName, "Unbekannter");

    // Eingabe bleibt unverändert
    assert.equal(items[0].author, "a1");
});

test("describe: ohne ID null, mit ID der Autor", async () => {
    assert.equal(await authorService.describe(null, models), null);
    assert.equal((await authorService.describe("a1", models)).kind, "customer");
});

test("leere Liste braucht keine Datenbank", async () => {
    const boom = { find() { throw new Error("nicht aufrufen"); } };
    assert.deepEqual(await authorService.attach([], "author", { User: boom, PortalAccount: boom }), []);
});
