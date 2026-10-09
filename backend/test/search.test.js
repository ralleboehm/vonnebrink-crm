"use strict";

// Tests für die globale Suche. Die Datenbank wird durch eine kleine
// Attrappe ersetzt, die genau die Filter-Teile versteht, die der
// Suchdienst erzeugt ($and, $or, $regex, $in, Gleichheit).
//
// Ausführen mit:  node --test test/search.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const search = require("../src/services/search.service");

// ----------------------------------------------------
// Mini-Datenbank
// ----------------------------------------------------

function getPath(doc, path) {
    return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), doc);
}

function matches(doc, filter) {

    return Object.entries(filter).every(([key, condition]) => {

        if (key === "$and") return condition.every((f) => matches(doc, f));
        if (key === "$or") return condition.some((f) => matches(doc, f));

        const value = getPath(doc, key);

        if (condition && typeof condition === "object" && "$regex" in condition) {
            return typeof value === "string" &&
                new RegExp(condition.$regex, condition.$options).test(value);
        }

        if (condition && typeof condition === "object" && "$in" in condition) {
            return condition.$in.map(String).includes(String(value));
        }

        return value === condition;

    });

}

function fakeModel(docs, populate = {}) {

    const run = (filter) => docs.filter((doc) => matches(doc, filter));

    const query = (rows) => {

        const q = {
            populate(path) { rows = rows.map((r) => populate[path] ? { ...r, [path]: populate[path](r) } : r); return q; },
            sort() { return q; },
            limit(n) { rows = rows.slice(0, n); return q; },
            lean() { return q; },
            then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); }
        };

        return q;

    };

    return {
        find: (filter) => query(run(filter)),
        findOne: (filter) => ({ lean: async () => run(filter)[0] || null }),
        countDocuments: async (filter) => run(filter).length
    };

}

const companies = [
    { _id: "c1", companyName: "Holz Müller GmbH", customerNumber: "CUS-000001", address: { city: "Heilbronn", postalCode: "74080" }, email: "info@holz-mueller.de", notes: "Gruppen: Terrasse", isDeleted: false },
    { _id: "c2", companyName: "Holzland Jung", customerNumber: "CUS-000002", address: { city: "Ulm" }, isDeleted: false },
    { _id: "c3", companyName: "Gelöscht AG", customerNumber: "CUS-000003", address: {}, isDeleted: true },
    { _id: "c4", companyName: "Regex (Test) [GmbH]", customerNumber: "CUS-000004", address: {}, isDeleted: false }
];

const contacts = [
    { _id: "p1", firstName: "Hans", lastName: "Müller", contactNumber: "CON-000001", email: "hans@holz-mueller.de", company: "c1", isDeleted: false },
    { _id: "p2", firstName: "Anna", lastName: "Jung", contactNumber: "CON-000002", email: "anna@holzland.de", company: "c2", isDeleted: false },
    { _id: "p3", firstName: "Peter", lastName: "Gelöscht", contactNumber: "CON-000003", email: "p@x.de", company: "c1", isDeleted: true }
];

const tickets = [
    { _id: "t1", ticketNumber: "TIC-000001", subject: "Drucker druckt nicht", description: "Kein Toner", company: "c1", contact: "p1", isDeleted: false },
    { _id: "t2", ticketNumber: "TIC-000002", subject: "WLAN langsam", description: "Büro Ulm", company: "c2", contact: null, isDeleted: false },
    { _id: "t3", ticketNumber: "TIC-000003", subject: "Alt", description: "x", company: "c1", contact: null, isDeleted: true }
];

const models = {
    Company: fakeModel(companies),
    Contact: fakeModel(contacts, { company: (r) => companies.find((c) => c._id === r.company) }),
    Ticket: fakeModel(tickets, {
        company: (r) => companies.find((c) => c._id === r.company),
        contact: (r) => contacts.find((c) => c._id === r.contact) || null
    })
};

const ids = (section) => section.items.map((i) => i._id);

// ----------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------

test("normalizeQuery: kürzt, entfernt Steuerzeichen, ignoriert Nicht-Text", () => {
    assert.equal(search.normalizeQuery("  müller \n\t holz  "), "müller holz");
    assert.equal(search.normalizeQuery("x".repeat(500)).length, search.MAX_QUERY_LENGTH);
    assert.equal(search.normalizeQuery(["a"]), "");
    assert.equal(search.normalizeQuery(undefined), "");
    assert.equal(search.normalizeQuery({ $ne: 1 }), "");
});

test("tokenize: Duplikate raus, höchstens 6 Wörter", () => {
    assert.deepEqual(search.tokenize("Holz holz Müller"), ["Holz", "Müller"]);
    assert.equal(search.tokenize("a b c d e f g h").length, 6);
});

test("variants: Umlaute in beide Richtungen", () => {
    assert.ok(search.variants("müller").includes("mueller"));
    assert.ok(search.variants("mueller").includes("müller"));
    assert.ok(search.variants("straße").includes("strasse"));
});

test("escapeRegex maskiert Sonderzeichen", () => {
    assert.equal(search.escapeRegex("a.b(c)[d]*"), "a\\.b\\(c\\)\\[d\\]\\*");
});

test("highlight: markiert Treffer, auch mit Umlaut-Variante", () => {
    const parts = search.highlight("Holz Müller GmbH", ["mueller"]);
    assert.deepEqual(parts, [
        { text: "Holz ", hit: false },
        { text: "Müller", hit: true },
        { text: " GmbH", hit: false }
    ]);
    assert.deepEqual(search.highlight(null, ["x"]), []);
    assert.deepEqual(search.highlight("abc", []), [{ text: "abc", hit: false }]);
});

test("highlight: Sonderzeichen im Suchwort brechen nichts", () => {
    assert.doesNotThrow(() => search.highlight("a (b) c", ["(b", "[", "*"]));
});

// ----------------------------------------------------
// Suche
// ----------------------------------------------------

test("findet Firmen, Kontakte und Tickets zu einem Stichwort", async () => {
    const r = await search.searchAll("holz", {}, models);

    assert.deepEqual(ids(r.companies).sort(), ["c1", "c2"]);
    // Kontakte über die Firma (Holz Müller, Holzland) und über die E-Mail
    assert.deepEqual(ids(r.contacts).sort(), ["p1", "p2"]);
    // Tickets der beiden Firmen
    assert.deepEqual(ids(r.tickets).sort(), ["t1", "t2"]);
});

test("alle Wörter müssen vorkommen (UND)", async () => {
    const r = await search.searchAll("holz heilbronn", {}, models);
    assert.deepEqual(ids(r.companies), ["c1"]);
});

test("Umlaute: 'mueller' findet 'Müller'", async () => {
    const r = await search.searchAll("mueller", {}, models);
    assert.deepEqual(ids(r.companies), ["c1"]);
    assert.deepEqual(ids(r.contacts), ["p1"]);
});

test("Vor- und Nachname zusammen, Groß-/Kleinschreibung egal", async () => {
    const r = await search.searchAll("HANS müller", {}, models);
    assert.deepEqual(ids(r.contacts), ["p1"]);
});

test("Tickets werden auch über Kontaktnamen und Firma gefunden", async () => {
    const byContact = await search.searchAll("hans", {}, models);
    assert.deepEqual(ids(byContact.tickets), ["t1"]);

    const byCompany = await search.searchAll("jung", {}, models);
    assert.deepEqual(ids(byCompany.tickets), ["t2"]);
});

test("Ticketnummer und Betreff", async () => {
    assert.deepEqual(ids((await search.searchAll("TIC-000002", {}, models)).tickets), ["t2"]);
    assert.deepEqual(ids((await search.searchAll("drucker", {}, models)).tickets), ["t1"]);
});

test("Notizen werden durchsucht (z. B. Kundengruppe)", async () => {
    const r = await search.searchAll("terrasse", {}, models);
    assert.deepEqual(ids(r.companies), ["c1"]);
});

test("gelöschte Datensätze werden nie gefunden", async () => {
    const r = await search.searchAll("gelöscht", {}, models);
    assert.equal(r.companies.total + r.contacts.total + r.tickets.total, 0);

    const t = await search.searchAll("alt", {}, models);
    assert.ok(!ids(t.tickets).includes("t3"));
});

test("Regex-Zeichen werden wörtlich gesucht und führen nicht zu Fehlern", async () => {
    const r = await search.searchAll("(test) [gmbh]", {}, models);
    assert.deepEqual(ids(r.companies), ["c4"]);

    await assert.doesNotReject(search.searchAll(".*", {}, models));
    await assert.doesNotReject(search.searchAll("(((", {}, models));
    assert.equal((await search.searchAll(".*", {}, models)).companies.total, 0);
});

test("zu kurze oder leere Eingabe: kein Treffer, keine Datenbankabfrage", async () => {
    const boom = { find() { throw new Error("darf nicht aufgerufen werden"); } };
    const none = { Company: boom, Contact: boom, Ticket: boom };

    assert.equal((await search.searchAll("a", {}, none)).tooShort, true);
    assert.equal((await search.searchAll("", {}, none)).tooShort, false);
    assert.equal((await search.searchAll(undefined, {}, none)).companies.total, 0);
});

test("Treffer, die mit dem Suchwort beginnen, stehen oben (innerhalb der geladenen Treffer); Limit wirkt, Gesamtzahl bleibt", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
        _id: "x" + i, companyName: i === 7 ? "Alpha" : `Beta Alpha ${i}`, customerNumber: "CUS-9" + i, address: {}, isDeleted: false
    }));

    const r = await search.searchAll("alpha", { limit: 5 }, { ...models, Company: fakeModel(many) });

    assert.equal(r.companies.total, 40);
    assert.equal(r.companies.items.length, 5);
    assert.equal(r.companies.items[0].companyName, "Alpha");
});

test("findByNumber: springt zum richtigen Datensatz", async () => {
    assert.equal(await search.findByNumber("CUS-000002", models), "/crm/companies/c2");
    assert.equal(await search.findByNumber("con-000001", models), "/crm/contacts/p1");
    assert.equal(await search.findByNumber("TIC-000001", models), "/crm/tickets/t1");
    assert.equal(await search.findByNumber("CUS-000003", models), null);   // gelöscht
    assert.equal(await search.findByNumber("CUS-999999", models), null);
    assert.equal(await search.findByNumber("holz", models), null);
});

// ----------------------------------------------------
// Controller (Vorschläge als JSON)
// ----------------------------------------------------

test("Controller suggest: liefert JSON ohne Rohdaten und ohne Caching", async () => {
    const Module = require("module");
    const original = Module._load;
    const service = require("../src/services/search.service");
    const realSearchAll = service.searchAll;

    service.searchAll = (q, o) => realSearchAll(q, o, models);

    try {
        const controller = require("../src/controllers/crm/search.controller");
        const headers = {};
        let body = null;

        const res = {
            set: (k, v) => { headers[k] = v; },
            json: (b) => { body = b; },
            status() { return res; }
        };

        await controller.suggest({ query: { q: "holz" }, session: { user: { role: "admin" } } }, res);

        assert.equal(headers["Cache-Control"], "no-store");
        assert.equal(body.companies.total, 2);
        assert.equal(body.companies.items[0].url.startsWith("/crm/companies/"), true);
        assert.ok(body.tickets.items.every((t) => /^TIC-\d+ – /.test(t.title)));
        assert.equal(JSON.stringify(body).includes("isDeleted"), false);

        // Vertrieb: keine Tickets in den Vorschlägen
        await controller.suggest({ query: { q: "holz" }, session: { user: { role: "sales" } } }, res);
        assert.equal(body.tickets.total, 0);
        assert.equal(body.companies.total, 2);
    } finally {
        service.searchAll = realSearchAll;
        Module._load = original;
    }
});

// ----------------------------------------------------
// Assets
// ----------------------------------------------------

const assets = [
    { _id: "a1", assetNumber: "AST-000001", name: "PC-EMPFANG", serialNumber: "5CG1234XYZ", lastUser: "anna", company: "c1", isDeleted: false },
    { _id: "a2", assetNumber: "AST-000002", name: "SRV-DC01", serialNumber: "VMW-77", company: "c2", isDeleted: false },
    { _id: "a3", assetNumber: "AST-000003", name: "PC-ALT", serialNumber: "5CG0000", company: "c1", isDeleted: true }
];

const modelsWithAssets = {
    ...models,
    Asset: fakeModel(assets, { company: (r) => companies.find((c) => c._id === r.company) })
};

test("Assets: Suche nach Seriennummer, Gerätename und Firma", async () => {
    let r = await search.searchAll("5cg", {}, modelsWithAssets);
    assert.deepEqual(ids(r.assets), ["a1"]);   // gelöschtes Asset fehlt

    r = await search.searchAll("srv-dc01", {}, modelsWithAssets);
    assert.deepEqual(ids(r.assets), ["a2"]);

    r = await search.searchAll("heilbronn", {}, modelsWithAssets);
    assert.deepEqual(ids(r.assets), ["a1"]);   // über die Firma
});

test("Assets: findByNumber springt zum Asset", async () => {
    assert.equal(await search.findByNumber("AST-000002", modelsWithAssets), "/crm/assets/a2");
    assert.equal(await search.findByNumber("AST-000003", modelsWithAssets), null);
});
