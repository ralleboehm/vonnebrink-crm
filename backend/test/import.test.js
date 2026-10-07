"use strict";

// Ausführen mit:  node --test test/
// Benötigt keine Datenbank und keine zusätzlichen Pakete.

const test = require("node:test");
const assert = require("node:assert/strict");

const csv = require("../src/services/import/csvParser.service");
const mapping = require("../src/services/import/mapping.service");
const engine = require("../src/services/import/engine");
const { toCsv, escapeCell } = require("../src/services/export/csvWriter");

const companyEntity = require("../src/services/import/entities/company");
const contactEntity = require("../src/services/import/entities/contact");

// Entity-Kopie ohne Datenbank: Lookups werden fest vorgegeben
function withLookups(entity, lookups) {
    return { ...entity, loadLookups: async () => lookups };
}

// ----------------------------------------------------
// CSV Parser
// ----------------------------------------------------

test("erkennt Semikolon, Komma und Tab als Trennzeichen", () => {
    assert.equal(csv.detectDelimiter("a;b;c\n1;2;3"), ";");
    assert.equal(csv.detectDelimiter("a,b,c\n1,2,3"), ",");
    assert.equal(csv.detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
    assert.equal(csv.detectDelimiter("nur eine spalte"), ";");
});

test("Trennzeichen in Anführungszeichen werden nicht mitgezählt", () => {
    assert.equal(csv.detectDelimiter("\"a,b\";c;d"), ";");
});

test("Anführungszeichen, maskierte Zeichen und Zeilenumbrüche in Feldern", () => {
    const text = "Firma;Notiz\r\n\"Müller; Söhne\";\"Er sagte \"\"Hallo\"\"\"\r\nMeier;\"Zeile 1\nZeile 2\"\r\n";
    const { rows, lines } = csv.parseText(text, ";");

    assert.deepEqual(rows, [
        ["Firma", "Notiz"],
        ["Müller; Söhne", "Er sagte \"Hallo\""],
        ["Meier", "Zeile 1\nZeile 2"]
    ]);

    assert.deepEqual(lines, [1, 2, 3]);
});

test("Zeilennummern bleiben nach mehrzeiligen Feldern korrekt", () => {
    const text = "a;b\n\"x\ny\";1\nz;2\n";
    const { lines } = csv.parseText(text, ";");
    assert.deepEqual(lines, [1, 2, 4]);
});

test("leere Zeilen werden übersprungen, letzte Zeile ohne Zeilenende wird gelesen", () => {
    const { rows } = csv.parseText("a;b\n\n1;2\n;\n3;4", ";");
    assert.deepEqual(rows, [["a", "b"], ["1", "2"], ["3", "4"]]);
});

test("Windows-1252 wird erkannt, UTF-8 mit BOM ebenfalls", () => {
    const cp1252 = Buffer.from([0x46, 0x69, 0x72, 0x6d, 0x61, 0x3b, 0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);
    const a = csv.decode(cp1252);
    assert.equal(a.encoding, "windows-1252");
    assert.equal(a.text, "Firma;Müller");

    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Firma;Müller", "utf8")]);
    const b = csv.decode(bom);
    assert.equal(b.encoding, "utf-8");
    assert.equal(b.text, "Firma;Müller");
});

test("UTF-16 mit BOM wird gelesen", () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("a;b", "utf16le")]);
    assert.equal(csv.decode(buf).text, "a;b");
});

test("parseBuffer: Kopfzeile bereinigen, kurze Zeilen auffüllen", () => {
    const buf = Buffer.from("Firma;;Firma\nACME;x\nBeta;1;2;3\n", "utf8");
    const parsed = csv.parseBuffer(buf);

    assert.deepEqual(parsed.headers, ["Firma", "Spalte 2", "Firma (2)"]);
    assert.deepEqual(parsed.rows, [["ACME", "x", ""], ["Beta", "1", "2"]]);
});

test("parseBuffer: nicht geschlossenes Anführungszeichen und leere Datei", () => {
    assert.throws(() => csv.parseBuffer(Buffer.from("a;b\n\"offen;1\n")), /Anführungszeichen/);
    assert.throws(() => csv.parseBuffer(Buffer.from("\n\n")), /leer/);
});

// ----------------------------------------------------
// CSV Writer
// ----------------------------------------------------

test("Writer: Semikolon, BOM, CRLF, Anführungszeichen", () => {
    const out = toCsv(["Firma", "Notiz"], [["Müller; Söhne", "Er sagte \"Hi\""], ["A", "x\ny"]]);

    assert.ok(out.startsWith("﻿"));
    assert.ok(out.includes("Firma;Notiz\r\n"));
    assert.ok(out.includes("\"Müller; Söhne\";\"Er sagte \"\"Hi\"\"\"\r\n"));
    assert.ok(out.includes("A;\"x\ny\"\r\n"));
});

test("Writer: Formel-Schutz, aber Telefonnummern bleiben unverändert", () => {
    assert.equal(escapeCell("=SUM(A1)"), "'=SUM(A1)");
    assert.equal(escapeCell("@cmd"), "'@cmd");
    assert.equal(escapeCell("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
    assert.equal(escapeCell("-2+3"), "'-2+3");

    assert.equal(escapeCell("+49 170 1234567"), "+49 170 1234567");
    assert.equal(escapeCell("+49 (0) 621 / 123-45"), "+49 (0) 621 / 123-45");
    assert.equal(escapeCell("-5"), "-5");
    assert.equal(escapeCell(null), "");
    assert.equal(escapeCell(0), "0");
});

test("Writer und Parser sind zueinander passend (Round-Trip)", () => {
    const rows = [["Müller; \"Söhne\"", "Zeile1\nZeile2", " mit Rand "], ["", "=1+1", "ä ö ü ß"]];
    const parsed = csv.parseBuffer(Buffer.from(toCsv(["A", "B", "C"], rows), "utf8"));

    assert.equal(parsed.delimiter, ";");
    assert.deepEqual(parsed.rows[0], ["Müller; \"Söhne\"", "Zeile1\nZeile2", " mit Rand "]);
    // Apostroph des Formel-Schutzes wird beim Import entfernt
    assert.equal(engine.cleanValue(parsed.rows[1][1]), "=1+1");
});

// ----------------------------------------------------
// Spaltenzuordnung
// ----------------------------------------------------

test("foldKey vereinheitlicht Umlaute, ß und Sonderzeichen", () => {
    assert.equal(mapping.foldKey("Straße"), "strasse");
    assert.equal(mapping.foldKey("E-Mail"), "email");
    assert.equal(mapping.foldKey("Kundennr."), "kundennr");
    assert.equal(mapping.foldKey("  PLZ "), "plz");
    assert.equal(mapping.foldKey("Größe"), "grosse");
});

test("Firmen: typische deutsche Spaltennamen werden erkannt, Nummern-Spalten nicht", () => {
    const headers = ["Kd-Nr.", "Firmenname", "Straße", "PLZ", "Ort", "Land", "Tel.", "E-Mail", "Homepage", "Bemerkung", "Irgendwas"];
    const result = mapping.guess(headers, companyEntity);

    assert.deepEqual(result, [
        "", "companyName", "street", "postalCode", "city",
        "country", "phone", "email", "website", "notes", ""
    ]);
});

test("Kontakte: typische Spaltennamen, Kundennummer wird nicht zugeordnet", () => {
    const headers = ["Kundennummer", "Firma", "Anrede", "Vorname", "Nachname", "E-Mail geschäftlich", "Mobil", "Funktion"];
    const result = mapping.guess(headers, contactEntity);

    assert.deepEqual(result, ["", "companyName", "salutation", "firstName", "lastName", "email", "mobile", "position"]);
});

test("ähnlich klingende Spalten werden nicht fälschlich zugeordnet", () => {
    const contacts = mapping.guess(["Kontaktnummer", "Erstellt am", "Kundengruppe"], contactEntity);
    assert.deepEqual(contacts, ["", "", ""]);

    const companies = mapping.guess(["Kundengruppe", "Kontaktperson", "Hostname"], companyEntity);
    assert.deepEqual(companies, ["", "", ""]);
});

test("jedes CRM-Feld wird höchstens einer Spalte zugeordnet", () => {
    const result = mapping.guess(["E-Mail", "E-Mail 2", "Email privat"], companyEntity);
    assert.equal(result.filter((key) => key === "email").length, 1);
});

test("Zuordnung prüfen: Pflichtfelder und Doppelzuordnung", () => {
    assert.ok(mapping.validate(["street"], companyEntity).length > 0);
    assert.deepEqual(mapping.validate(["companyName"], companyEntity), []);
    assert.ok(mapping.validate(["companyName", "companyName"], companyEntity).length > 0);

    const contactErrors = mapping.validate(["email"], contactEntity);
    assert.equal(contactErrors.length, 2);
    assert.deepEqual(mapping.validate(["companyName", "email", "fullName"], contactEntity), []);
});

test("fromForm ignoriert unbekannte Feldnamen", () => {
    const result = mapping.fromForm(
        { map_0: "companyName", map_1: "hackerField", map_2: "" },
        ["a", "b", "c"],
        companyEntity
    );

    assert.deepEqual(result, ["companyName", "", ""]);
});

// ----------------------------------------------------
// Prüfung der Zeilen
// ----------------------------------------------------

test("Firma: Straße und Hausnummer werden getrennt, Status wird übersetzt", () => {
    const mappedKeys = new Set(["companyName", "street", "status"]);
    const raw = { companyName: "ACME GmbH", street: "Musterstraße 12a", status: "Interessent" };
    const { data, errors } = engine.normalizeRecord(companyEntity, raw, mappedKeys);

    assert.deepEqual(errors, []);
    assert.equal(data.street, "Musterstraße");
    assert.equal(data.houseNumber, "12a");
    assert.equal(data.status, "prospect");
});

test("Firma: mit eigener Hausnummer-Spalte wird die Straße nicht angefasst", () => {
    const mappedKeys = new Set(["companyName", "street", "houseNumber"]);
    const raw = { companyName: "ACME GmbH", street: "Straße des 17. Juni 5" };
    const { data } = engine.normalizeRecord(companyEntity, raw, mappedKeys);

    assert.equal(data.street, "Straße des 17. Juni 5");
});

test("Firma: Straße mit Zahl im Namen und Hausnummer", () => {
    const { data } = engine.normalizeRecord(
        companyEntity,
        { companyName: "ACME", street: "Straße des 17. Juni 5-7" },
        new Set(["companyName", "street"])
    );

    assert.equal(data.street, "Straße des 17. Juni");
    assert.equal(data.houseNumber, "5-7");
});

test("Firma: Fehler bei fehlendem Namen, zu langem Wert, falscher E-Mail, falschem Status", () => {
    const keys = new Set();

    assert.deepEqual(
        engine.normalizeRecord(companyEntity, {}, keys).errors,
        ["Firma fehlt."]
    );

    const long = engine.normalizeRecord(companyEntity, { companyName: "x".repeat(101) }, keys);
    assert.match(long.errors[0], /zu lang/);

    const mail = engine.normalizeRecord(companyEntity, { companyName: "ACME", email: "kein-email" }, keys);
    assert.match(mail.errors[0], /keine gültige E-Mail/);

    const status = engine.normalizeRecord(companyEntity, { companyName: "ACME", status: "vielleicht" }, keys);
    assert.match(status.errors[0], /unbekannter Wert/);
});

test("Kontakt: Vollname wird in Vor- und Nachname zerlegt", () => {
    const keys = new Set(["fullName"]);

    const a = engine.normalizeRecord(contactEntity, { fullName: "Müller, Hans", companyName: "ACME", email: "h@a.de" }, keys);
    assert.deepEqual([a.data.firstName, a.data.lastName], ["Hans", "Müller"]);
    assert.deepEqual(a.errors, []);

    const b = engine.normalizeRecord(contactEntity, { fullName: "Hans Peter Meier", companyName: "ACME", email: "h@a.de" }, keys);
    assert.deepEqual([b.data.firstName, b.data.lastName], ["Hans Peter", "Meier"]);

    const c = engine.normalizeRecord(contactEntity, { fullName: "Hans", companyName: "ACME", email: "h@a.de" }, keys);
    assert.ok(c.errors.some((e) => e.startsWith("Vorname")));
});

test("Kontakt: Anrede wird übersetzt, E-Mail klein geschrieben, Firma ist Pflicht", () => {
    const keys = new Set();

    const ok = engine.normalizeRecord(contactEntity, {
        firstName: "Anna", lastName: "Beck", email: "Anna.Beck@Example.DE", companyName: "ACME GmbH", salutation: "Frau"
    }, keys);

    assert.deepEqual(ok.errors, []);
    assert.equal(ok.data.salutation, "mrs");
    assert.equal(ok.data.email, "anna.beck@example.de");

    const noCompany = engine.normalizeRecord(contactEntity, { firstName: "Anna", lastName: "Beck", email: "a@b.de" }, keys);
    assert.ok(noCompany.errors.some((e) => e.includes("Firma fehlt")));
});

// ----------------------------------------------------
// Plan (Trockenlauf) für Firmen
// ----------------------------------------------------

function parsedFrom(text) {
    return csv.parseBuffer(Buffer.from(text, "utf8"));
}

const existingCompanies = [
    { _id: "id1", customerNumber: "CUS-000001", companyName: "ACME GmbH", isDeleted: false },
    { _id: "id2", customerNumber: "CUS-000002", companyName: "Gelöscht AG", isDeleted: true },
    { _id: "id3", customerNumber: "CUS-000003", companyName: "Doppelt KG", isDeleted: false },
    { _id: "id4", customerNumber: "CUS-000004", companyName: "Doppelt KG", isDeleted: false }
];

test("Plan Firmen: neu, vorhanden (überspringen), Fehler, Datei-Duplikat", async () => {
    const entity = withLookups(companyEntity, companyEntity.buildLookups(existingCompanies));

    const parsed = parsedFrom(
        "Firma;Ort\n" +
        "Neu GmbH;Mannheim\n" +
        "acme gmbh;Heidelberg\n" +
        ";Berlin\n" +
        "Neu GmbH;Köln\n" +
        "Doppelt KG;Ulm\n"
    );

    const plan = await engine.buildPlan({
        entity, parsed, mapping: ["companyName", "city"], duplicates: "skip"
    });

    assert.deepEqual(plan.items.map((i) => i.action), ["create", "skip", "error", "error", "error"]);
    assert.match(plan.items[3].messages[0], /Doppelter Eintrag.*Zeile 2/);
    assert.match(plan.items[4].messages[0], /mehrfach/);
    assert.deepEqual(plan.counts, { total: 5, create: 1, update: 0, skip: 1, error: 3 });
});

test("Plan Firmen: Update über Firmennamen, gelöschte Firmen zählen nicht, Nummern aus der Datei werden ignoriert", async () => {
    const entity = withLookups(companyEntity, companyEntity.buildLookups(existingCompanies));

    // Die Spalte "Nr" wird bewusst nicht zugeordnet
    const parsed = parsedFrom("Nr;Firma\nCUS-000001;ACME GmbH\nCUS-000002;Gelöscht AG\nCUS-000099;Fremd AG\n");

    const plan = await engine.buildPlan({
        entity, parsed, mapping: ["", "companyName"], duplicates: "update"
    });

    assert.deepEqual(plan.items.map((i) => i.action), ["update", "create", "create"]);
    assert.equal(plan.items[0].existingId, "id1");
    assert.ok(plan.items.every((i) => i.data.customerNumber === undefined));
});

test("Plan: mehr als 5000 Zeilen werden abgelehnt", async () => {
    const entity = withLookups(companyEntity, companyEntity.buildLookups([]));
    const rows = Array.from({ length: engine.MAX_ROWS + 1 }, () => ["x"]);
    const parsed = { rows, lines: rows.map((_, i) => i + 2), headers: ["Firma"] };

    await assert.rejects(
        engine.buildPlan({ entity, parsed, mapping: ["companyName"], duplicates: "skip" }),
        /höchstens 5000/
    );
});

// ----------------------------------------------------
// Plan für Kontakte
// ----------------------------------------------------

test("Plan Kontakte: Firma über Namen finden, E-Mail als Schlüssel", async () => {
    const lookups = contactEntity.buildLookups(existingCompanies, [
        { _id: "c1", email: "alt@acme.de", isDeleted: false },
        { _id: "c2", email: "weg@acme.de", isDeleted: true }
    ]);

    const entity = withLookups(contactEntity, lookups);

    const parsed = parsedFrom(
        "Firma;Vorname;Nachname;E-Mail\n" +
        "ACME GmbH;Anna;Beck;anna@acme.de\n" +
        "acme gmbh;Alt;Kontakt;ALT@acme.de\n" +
        "ACME GmbH;Weg;Kontakt;weg@acme.de\n" +
        "Unbekannt AG;Un;Bekannt;un@x.de\n" +
        "Gelöscht AG;Ge;Löscht;ge@x.de\n" +
        "ACME GmbH;Anna;Zwei;anna@acme.de\n" +
        "Doppelt KG;Do;Ppelt;do@x.de\n"
    );

    const plan = await engine.buildPlan({
        entity,
        parsed,
        mapping: ["companyName", "firstName", "lastName", "email"],
        duplicates: "skip"
    });

    assert.deepEqual(
        plan.items.map((i) => i.action),
        ["create", "skip", "error", "error", "error", "error", "error"]
    );

    assert.equal(plan.items[0].companyId, "id1");
    assert.match(plan.items[2].messages[0], /gelöschter Kontakt/);
    assert.match(plan.items[3].messages[0], /Unbekannt AG.*nicht gefunden/);
    assert.match(plan.items[4].messages[0], /Gelöscht AG.*nicht gefunden/);
    assert.match(plan.items[5].messages[0], /Doppelter Eintrag/);
    assert.match(plan.items[6].messages[0], /mehrfach/);
});

test("Plan Kontakte: Vollname aus einer Spalte", async () => {
    const entity = withLookups(contactEntity, contactEntity.buildLookups(existingCompanies, []));

    const parsed = parsedFrom(
        "Firma;Name;Mail\n" +
        "ACME GmbH;Beck, Anna;a@acme.de\n" +
        "ACME GmbH;Bernd Clausen;b@acme.de\n"
    );

    const plan = await engine.buildPlan({
        entity, parsed, mapping: ["companyName", "fullName", "email"], duplicates: "skip"
    });

    assert.deepEqual(plan.items.map((i) => i.action), ["create", "create"]);
    assert.deepEqual([plan.items[0].data.firstName, plan.items[0].data.lastName], ["Anna", "Beck"]);
    assert.deepEqual([plan.items[1].data.firstName, plan.items[1].data.lastName], ["Bernd", "Clausen"]);
});

// ----------------------------------------------------
// Ausführen
// ----------------------------------------------------

test("executePlan: Fehler einer Zeile stoppen den Import nicht", async () => {
    const calls = [];

    const entity = {
        ...companyEntity,
        loadLookups: async () => companyEntity.buildLookups([]),
        apply: async (item) => {
            calls.push(item.data.companyName);
            if (item.data.companyName === "Kaputt") {
                const err = new Error("dup");
                err.code = 11000;
                throw err;
            }
        },
        finalize: async () => {}
    };

    const parsed = parsedFrom("Firma\nEins\nKaputt\nDrei\n");

    const plan = await engine.buildPlan({ entity, parsed, mapping: ["companyName"], duplicates: "skip" });
    const result = await engine.executePlan({ entity, plan });

    assert.deepEqual(calls, ["Eins", "Kaputt", "Drei"]);
    assert.deepEqual(result.counts, { total: 3, create: 2, update: 0, skip: 0, error: 1 });
    assert.match(result.items[1].messages[0], /doppelter Schlüssel/);
});
