"use strict";

// Testet den kompletten Ablauf (Upload -> Zuordnung -> Prüfung -> Import ->
// Ergebnis -> Export) durch den echten Controller.
// Datenbank und Datei-Upload (multer) werden durch einfache Attrappen ersetzt.
//
// Ausführen mit:  node --test test/

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

// Arbeitsverzeichnis wechseln: storage/imports landet im Temp-Ordner
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "import-flow-"));
process.chdir(workdir);

// ----------------------------------------------------
// Attrappe: multer
// ----------------------------------------------------

let nextUpload = null;

function fakeMulter() {

    return {

        single() {

            return (req, res, cb) => {

                if (!nextUpload) {
                    return cb();
                }

                if (nextUpload.error) {
                    return cb(nextUpload.error);
                }

                const filename = `import-${require("crypto").randomUUID()}.csv`;

                fs.writeFileSync(
                    path.join(process.cwd(), "storage", "imports", filename),
                    nextUpload.buffer
                );

                req.file = { filename, originalname: nextUpload.name };

                nextUpload = null;

                cb();

            };

        }

    };

}

fakeMulter.diskStorage = () => ({});

const originalLoad = Module._load;

Module._load = function (request, ...rest) {

    if (request === "multer") {
        return fakeMulter;
    }

    return originalLoad.call(this, request, ...rest);

};

// ----------------------------------------------------
// Attrappe: Datenbank-Modelle
// ----------------------------------------------------

const db = { companies: [], contacts: [], counters: {} };

let idCounter = 0;

const clone = (value) => JSON.parse(JSON.stringify(value));

function query(getDocs) {

    const q = {

        _populate: false,

        sort() { return q; },

        populate() { q._populate = true; return q; },

        lean() { return q; },

        then(resolve, reject) {
            return Promise.resolve(getDocs(q)).then(resolve, reject);
        }

    };

    return q;

}

function matches(doc, filter = {}) {

    return Object.entries(filter).every(([key, value]) => doc[key] === value);

}

function applySet(doc, set) {

    for (const [key, value] of Object.entries(set)) {

        if (key.startsWith("address.")) {
            doc.address = { ...(doc.address || {}), [key.slice(8)]: value };
        } else {
            doc[key] = value;
        }

    }

}

const fakeCompany = {

    find: (filter) => query(() => clone(db.companies.filter((d) => matches(d, filter)))),

    create: async (doc) => {

        if (db.companies.some((c) => c.customerNumber === doc.customerNumber)) {
            const err = new Error("dup");
            err.code = 11000;
            throw err;
        }

        db.companies.push({ _id: `co${++idCounter}`, createdAt: "2026-10-07T10:00:00Z", ...clone(doc) });

    },

    updateOne: async (filter, update) => {

        const doc = db.companies.find((d) => matches(d, filter));

        if (doc) {
            applySet(doc, update.$set);
        }

    }

};

const fakeContact = {

    find: (filter) => query((q) => clone(
        db.contacts
            .filter((d) => matches(d, filter))
            .map((d) => q._populate
                ? { ...d, company: db.companies.find((c) => c._id === d.company) }
                : d)
    )),

    create: async (doc) => {

        db.contacts.push({ _id: `ct${++idCounter}`, createdAt: "2026-10-07T10:00:00Z", ...clone(doc) });

    },

    updateOne: async (filter, update) => {

        const doc = db.contacts.find((d) => matches(d, filter));

        if (doc) {
            applySet(doc, update.$set);
        }

    }

};

const fakeCounter = {

    findOneAndUpdate: async ({ name }) => {

        db.counters[name] = (db.counters[name] || 0) + 1;

        return { sequence: db.counters[name] };

    },

    updateOne: async ({ name }, update) => {

        db.counters[name] = Math.max(db.counters[name] || 0, update.$max.sequence);

    }

};

function injectModule(file, exports) {

    const filename = require.resolve(path.join(__dirname, "../src/models", file));

    require.cache[filename] = {
        id: filename, filename, loaded: true, exports, children: [], paths: []
    };

}

injectModule("company.model.js", fakeCompany);
injectModule("contact.model.js", fakeContact);
injectModule("counter.model.js", fakeCounter);

const controller = require("../src/controllers/crm/import.controller");

// ----------------------------------------------------
// Attrappen für Request / Response
// ----------------------------------------------------

function makeSession() {

    return {
        user: { username: "admin", role: "admin" },
        save(cb) { cb(); }
    };

}

function makeRes() {

    const res = {
        statusCode: 200,
        headers: {},
        rendered: null,
        redirectedTo: null,
        body: null,

        status(code) { res.statusCode = code; return res; },
        setHeader(key, value) { res.headers[key] = value; },
        render(view, locals) { res.rendered = { view, locals }; },
        redirect(url) { res.redirectedTo = url; },
        send(body) { res.body = body; }
    };

    return res;

}

// Ruft einen Handler auf und wartet, bis er antwortet
async function call(handler, req) {

    const res = makeRes();

    req.params = req.params || {};
    req.query = req.query || {};
    req.body = req.body || {};

    req.importEntity = require("../src/services/import/entities")[req.params.entity];
    req.exportDefinition = require("../src/services/export/export.service").definitions[req.params.entity];

    await new Promise((resolve, reject) => {

        const done = () => setImmediate(resolve);

        const origRender = res.render, origRedirect = res.redirect, origSend = res.send;

        res.render = (...args) => { origRender(...args); done(); };
        res.redirect = (...args) => { origRedirect(...args); done(); };
        res.send = (...args) => { origSend(...args); done(); };

        const next = (err) => (err ? reject(err) : done());

        Promise.resolve(handler(req, res, next)).catch(reject);

    });

    return res;

}

function formBody(headers, mapping, duplicates = "skip") {

    const body = { duplicates };

    headers.forEach((_, i) => { body[`map_${i}`] = mapping[i] || ""; });

    return body;

}

// ----------------------------------------------------
// Testdaten
// ----------------------------------------------------

db.companies.push({
    _id: "co0", customerNumber: "CUS-000007", companyName: "ACME GmbH",
    status: "active", address: { city: "Mannheim" }, isDeleted: false, createdAt: "2026-01-02T10:00:00Z"
});

db.counters.company = 7;

const companiesCsv = Buffer.from(
    "Firma;Straße;PLZ;Ort;Telefon;E-Mail\r\n" +
    "Beta Söhne GmbH;Hauptstr. 5;68159;Mannheim;+49 621 123456;INFO@beta.de\r\n" +
    "ACME GmbH;;;Heidelberg;;\r\n" +
    "X;Nebenweg 1;;;;\r\n" +
    "Gamma AG;Bahnhofplatz 3a;;Ulm;;kaputt\r\n",
    "latin1"
);

// ----------------------------------------------------
// Ablauf
// ----------------------------------------------------

test("Firmen: kompletter Ablauf mit Zeichensatz Windows-1252", async () => {

    const session = makeSession();

    // 1. Upload
    nextUpload = { buffer: companiesCsv, name: "firmen.csv" };

    let res = await call(controller.upload, { session, params: { entity: "companies" } });

    assert.equal(res.redirectedTo, "/crm/import/companies/map");
    assert.equal(session.importJob.encoding, "windows-1252");
    assert.equal(session.importJob.totalRows, 4);
    assert.deepEqual(session.importJob.mapping, [
        "companyName", "street", "postalCode", "city", "phone", "email"
    ]);

    // 2. Zuordnungsseite
    res = await call(controller.mapForm, { session, params: { entity: "companies" } });

    assert.equal(res.rendered.view, "crm/import/map");
    assert.deepEqual(res.rendered.locals.samples[0], ["Beta Söhne GmbH", "ACME GmbH", "X"]);

    // 2b. Ungültige Zuordnung wird abgelehnt
    res = await call(controller.mapSubmit, {
        session,
        params: { entity: "companies" },
        body: formBody(session.importJob.headers, ["", "street"])
    });

    assert.equal(res.statusCode, 400);
    assert.match(res.rendered.locals.errors[0], /Firma/);

    // 2c. Gültige Zuordnung
    res = await call(controller.mapSubmit, {
        session,
        params: { entity: "companies" },
        body: formBody(session.importJob.headers, session.importJob.mapping)
    });

    assert.equal(res.redirectedTo, "/crm/import/companies/review");

    // 3. Prüfung: nichts darf gespeichert sein
    const before = db.companies.length;

    res = await call(controller.review, { session, params: { entity: "companies" } });

    assert.equal(res.rendered.view, "crm/import/review");
    assert.deepEqual(res.rendered.locals.counts, { total: 4, create: 1, update: 0, skip: 1, error: 2 });
    assert.equal(res.rendered.locals.importable, 1);
    assert.equal(db.companies.length, before);

    // 4. Import
    res = await call(controller.commit, { session, params: { entity: "companies" } });

    assert.equal(res.redirectedTo, "/crm/import/companies/result");
    assert.equal(session.importJob, undefined);
    assert.deepEqual(fs.readdirSync("storage/imports"), []);

    const beta = db.companies.find((c) => c.companyName === "Beta Söhne GmbH");

    assert.equal(beta.customerNumber, "CUS-000008");
    assert.equal(beta.status, "prospect");
    assert.equal(beta.email, "info@beta.de");
    assert.equal(beta.phone, "+49 621 123456");
    assert.deepEqual(beta.address, {
        street: "Hauptstr.", houseNumber: "5", postalCode: "68159", city: "Mannheim"
    });
    assert.equal(db.companies.find((c) => c._id === "co0").address.city, "Mannheim");

    // 5. Ergebnis und Fehlerbericht
    res = await call(controller.result, { session, params: { entity: "companies" } });

    assert.equal(res.rendered.locals.result.counts.create, 1);
    assert.equal(res.rendered.locals.result.errors.length, 2);

    res = await call(controller.errorReport, { session, params: { entity: "companies" } });

    assert.match(res.headers["Content-Disposition"], /fehler-companies\.csv/);
    assert.ok(res.body.includes("Fehlermeldung"));
    assert.ok(res.body.includes("Nebenweg 1"));
    assert.ok(res.body.includes("keine gültige E-Mail"));

});

test("Firmen: Aktualisieren-Modus ändert nur Felder mit Wert", async () => {

    const session = makeSession();

    nextUpload = {
        buffer: Buffer.from("Kundennummer;Firma;Ort;Telefon\nCUS-000007;ACME GmbH;Heidelberg;\n"),
        name: "update.csv"
    };

    await call(controller.upload, { session, params: { entity: "companies" } });

    await call(controller.mapSubmit, {
        session,
        params: { entity: "companies" },
        body: formBody(session.importJob.headers, session.importJob.mapping, "update")
    });

    await call(controller.commit, { session, params: { entity: "companies" } });

    const acme = db.companies.find((c) => c._id === "co0");

    assert.equal(acme.address.city, "Heidelberg");
    assert.equal(acme.phone, undefined);
    assert.equal(acme.customerNumber, "CUS-000007");

});

test("Firmen: Kundennummern aus der Datei werden ignoriert, das CRM vergibt eigene", async () => {

    const session = makeSession();

    nextUpload = { buffer: Buffer.from("Kundennummer;Firma\nCUS-000050;Delta GmbH\nK-1;Epsilon AG\n"), name: "n.csv" };

    await call(controller.upload, { session, params: { entity: "companies" } });

    // Die Nummern-Spalte wird nicht vorgeschlagen
    assert.deepEqual(session.importJob.mapping, ["", "companyName"]);

    await call(controller.mapSubmit, {
        session,
        params: { entity: "companies" },
        body: formBody(session.importJob.headers, session.importJob.mapping)
    });

    await call(controller.commit, { session, params: { entity: "companies" } });

    const delta = db.companies.find((c) => c.companyName === "Delta GmbH");
    const epsilon = db.companies.find((c) => c.companyName === "Epsilon AG");

    assert.equal(delta.customerNumber, "CUS-000009");
    assert.equal(epsilon.customerNumber, "CUS-000010");
    assert.ok(!db.companies.some((c) => c.customerNumber === "CUS-000050"));
    assert.equal(db.counters.company, 10);

    // Selbst wenn jemand die Nummer manuell zuordnet (manipuliertes Formular), wird sie nicht verwendet
    nextUpload = { buffer: Buffer.from("Nr;Firma\nCUS-000777;Zeta GmbH\n"), name: "z.csv" };

    await call(controller.upload, { session, params: { entity: "companies" } });

    await call(controller.mapSubmit, {
        session,
        params: { entity: "companies" },
        body: { ...formBody(session.importJob.headers, ["", "companyName"]), map_0: "customerNumber" }
    });

    await call(controller.commit, { session, params: { entity: "companies" } });

    assert.equal(db.companies.find((c) => c.companyName === "Zeta GmbH").customerNumber, "CUS-000011");
});

test("Kontakte: Zuordnung über Firmennamen, Vollname, Anrede, eigene Kontaktnummern", async () => {

    const session = makeSession();

    nextUpload = {
        buffer: Buffer.from(
            "Kundennr;Firma;Anrede;Name;E-Mail;Mobil\n" +
            "K-77;acme gmbh;Frau;Beck, Anna;Anna@ACME.de;+49 170 1234567\n" +
            "K-78;Beta Söhne GmbH;Herr;Bernd Clausen;bernd@beta.de;\n" +
            "K-79;Unbekannt AG;Herr;Carl Dorn;carl@x.de;\n",
            "utf8"
        ),
        name: "kontakte.csv"
    };

    let res = await call(controller.upload, { session, params: { entity: "contacts" } });

    assert.equal(res.redirectedTo, "/crm/import/contacts/map");
    assert.deepEqual(session.importJob.mapping, [
        "", "companyName", "salutation", "fullName", "email", "mobile"
    ]);

    await call(controller.mapSubmit, {
        session,
        params: { entity: "contacts" },
        body: formBody(session.importJob.headers, session.importJob.mapping)
    });

    res = await call(controller.review, { session, params: { entity: "contacts" } });

    assert.deepEqual(res.rendered.locals.counts, { total: 3, create: 2, update: 0, skip: 0, error: 1 });
    assert.match(res.rendered.locals.problems[0].messages[0], /Unbekannt AG.*nicht gefunden/);

    await call(controller.commit, { session, params: { entity: "contacts" } });

    const anna = db.contacts.find((c) => c.email === "anna@acme.de");

    assert.equal(anna.company, "co0");
    assert.equal(anna.firstName, "Anna");
    assert.equal(anna.lastName, "Beck");
    assert.equal(anna.salutation, "mrs");
    assert.equal(anna.contactNumber, "CON-000001");
    assert.equal(anna.mobile, "+49 170 1234567");

    // Zweiter Import: Vorhandenes wird übersprungen
    nextUpload = {
        buffer: Buffer.from("Firma;Vorname;Nachname;E-Mail\nACME GmbH;Anna;Beck;anna@acme.de\n"),
        name: "nochmal.csv"
    };

    await call(controller.upload, { session, params: { entity: "contacts" } });

    await call(controller.mapSubmit, {
        session,
        params: { entity: "contacts" },
        body: formBody(session.importJob.headers, session.importJob.mapping)
    });

    res = await call(controller.review, { session, params: { entity: "contacts" } });

    assert.equal(res.rendered.locals.counts.skip, 1);
    assert.equal(res.rendered.locals.importable, 0);

});

test("Export: Spaltenauswahl, Statusfilter und Round-Trip in den Import", async () => {

    // Firmen, alle Spalten
    let res = await call(controller.exportDownload, {
        session: makeSession(),
        params: { entity: "companies" }
    });

    assert.match(res.headers["Content-Disposition"], /^attachment; filename="firmen-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.ok(res.body.startsWith("﻿Kundennummer;Firma;Status;"));
    assert.ok(res.body.includes("CUS-000007;ACME GmbH;Aktiv;"));

    // Nur ausgewählte Spalten, Statusfilter, unbekannte Spalte wird ignoriert
    res = await call(controller.exportDownload, {
        session: makeSession(),
        params: { entity: "companies" },
        query: { columns: ["companyName", "city", "bogus"], status: "prospect" }
    });

    const lines = res.body.replace("﻿", "").trim().split("\r\n");

    assert.equal(lines[0], "Firma;Ort");
    assert.ok(lines.slice(1).every((line) => !line.startsWith("ACME")));
    assert.ok(lines.some((line) => line.startsWith("Beta Söhne GmbH;Mannheim")));

    // Kontakte enthalten Firma und Kundennummer der Firma
    res = await call(controller.exportDownload, {
        session: makeSession(),
        params: { entity: "contacts" }
    });

    assert.ok(res.body.includes("ACME GmbH;CUS-000007;Frau;Anna;Beck;;anna@acme.de"));

    // Der Export lässt sich ohne Änderung wieder importieren
    const mapping = require("../src/services/import/mapping.service");
    const parsed = require("../src/services/import/csvParser.service").parseBuffer(Buffer.from(res.body, "utf8"));
    const guessed = mapping.guess(parsed.headers, require("../src/services/import/entities").contacts);

    assert.deepEqual(
        guessed.filter(Boolean).sort(),
        ["companyName", "email", "firstName", "lastName", "mobile", "notes", "phone", "position", "salutation", "status"].sort()
    );

});

test("Export: Formeln in Daten werden entschärft", async () => {

    db.companies.push({
        _id: "co99", customerNumber: "CUS-000099", companyName: "=HYPERLINK(\"http://evil\")",
        status: "active", address: {}, isDeleted: false
    });

    const res = await call(controller.exportDownload, {
        session: makeSession(),
        params: { entity: "companies" },
        query: { columns: "companyName" }
    });

    assert.ok(res.body.includes("\"'=HYPERLINK(\"\"http://evil\"\")\""));

});

test("Sicherheit: manipulierte Session und Upload-Fehler", async () => {

    // Dateiname in der Session zeigt auf eine fremde Datei
    const session = makeSession();

    session.importJob = {
        entity: "companies", file: "../../../etc/passwd", originalName: "x.csv",
        headers: ["a"], mapping: ["companyName"], mappingConfirmed: true
    };

    let res = await call(controller.review, { session, params: { entity: "companies" } });

    assert.equal(res.redirectedTo, "/crm/import/companies");

    res = await call(controller.commit, { session, params: { entity: "companies" } });

    assert.equal(res.redirectedTo, "/crm/import/companies");

    // Vorgang einer anderen Art (Kontakte) kann nicht als Firmen-Import fortgesetzt werden
    nextUpload = { buffer: Buffer.from("Firma\nA1\n"), name: "a.csv" };

    await call(controller.upload, { session, params: { entity: "contacts" } });

    res = await call(controller.mapForm, { session, params: { entity: "companies" } });

    assert.equal(res.redirectedTo, "/crm/import/companies");

    // Upload-Fehler (zu groß / falscher Typ) -> Formular mit Meldung
    const big = new Error("x");
    big.code = "LIMIT_FILE_SIZE";
    nextUpload = { error: big };

    res = await call(controller.upload, { session, params: { entity: "companies" } });

    assert.equal(res.statusCode, 400);
    assert.match(res.rendered.locals.error, /zu groß/);

    // Defekte Datei -> Meldung, Datei wird wieder gelöscht
    const before = fs.readdirSync("storage/imports").length;

    nextUpload = { buffer: Buffer.from("a;b\n\"offen;1\n"), name: "kaputt.csv" };

    res = await call(controller.upload, { session: makeSession(), params: { entity: "companies" } });

    assert.equal(res.statusCode, 400);
    assert.match(res.rendered.locals.error, /Anführungszeichen/);
    assert.equal(fs.readdirSync("storage/imports").length, before);

});
