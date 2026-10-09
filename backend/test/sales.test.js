"use strict";

// Vertrieb: Phasen, Prüfung, Kennzahlen, Rechte (ohne Datenbank)
//
// Ausführen mit:  node --test test/sales.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const rules = require("../src/utils/salesRules");
const { can } = require("../src/core/permissions");

const valid = {
    title: "Managed IT für 12 Arbeitsplätze",
    company: "507f1f77bcf86cd799439011",
    stage: "proposal",
    probability: 60,
    mrr: 890,
    oneTime: 2500,
    expectedCloseDate: null,
    source: "referral",
    nextStep: { text: "Angebot nachfassen", dueDate: new Date() },
    notes: ""
};

test("Phasen: Reihenfolge, offene/abgeschlossene, Standard-Wahrscheinlichkeit", () => {

    assert.deepEqual(rules.STAGE_KEYS, ["new", "meeting", "assessment", "proposal", "negotiation", "won", "lost"]);
    assert.deepEqual(rules.OPEN_STAGES, ["new", "meeting", "assessment", "proposal", "negotiation"]);
    assert.equal(rules.defaultProbability("assessment"), 40);
    assert.equal(rules.defaultProbability("won"), 100);
    assert.equal(rules.defaultProbability("lost"), 0);
    assert.equal(rules.defaultProbability("quatsch"), 0);
    assert.equal(rules.STAGE_LABELS.assessment, "IT-Check");

});

test("Geldbeträge im deutschen Format", () => {

    assert.equal(rules.parseMoney("1.250,50"), 1250.5);
    assert.equal(rules.parseMoney("1250.5"), 1250.5);
    assert.equal(rules.parseMoney("1.250"), 1250);
    assert.equal(rules.parseMoney("450 €"), 450);
    assert.equal(rules.parseMoney(""), 0);
    assert.equal(rules.parseMoney(undefined), 0);
    assert.ok(Number.isNaN(rules.parseMoney("viel")));
    assert.equal(rules.parseMoney("1.250,-"), 1250, "kaufmännische Schreibweise");
    assert.equal(rules.parseMoney("EUR 450"), 450);
    assert.ok(Number.isNaN(rules.parseMoney("1,250.50")), "englisches Format wird nicht geraten");

});

test("Wahrscheinlichkeit: leer = Standard der Phase", () => {

    assert.equal(rules.parseProbability("", "meeting"), 20);
    assert.equal(rules.parseProbability("75", "meeting"), 75);
    assert.ok(Number.isNaN(rules.parseProbability("x", "meeting")));

});

test("Prüfung mit deutschen Meldungen", () => {

    assert.equal(rules.validate(valid), null);

    assert.match(rules.validate({ ...valid, title: " " }), /Titel/);
    assert.match(rules.validate({ ...valid, company: null }), /Firma/);
    assert.match(rules.validate({ ...valid, stage: "x" }), /Phase/);
    assert.match(rules.validate({ ...valid, mrr: NaN }), /Monatlicher Wert: bitte eine Zahl/);
    assert.match(rules.validate({ ...valid, oneTime: -1 }), /nicht negativ/);
    assert.match(rules.validate({ ...valid, probability: 120 }), /zwischen 0 und 100/);
    assert.match(rules.validate({ ...valid, expectedCloseDate: undefined }), /Abschlussdatum ist ungültig/);
    assert.match(rules.validate({ ...valid, stage: "lost", lostReason: "" }), /Grund/);
    assert.equal(rules.validate({ ...valid, stage: "lost", lostReason: "Preis" }), null);
    assert.match(rules.validate({ ...valid, nextStep: { text: "", dueDate: new Date() } }), /beschreiben/);
    assert.match(rules.validate({ ...valid, source: "fax" }), /Quelle/);

});

test("Fälligkeit des nächsten Schritts", () => {

    const now = new Date("2026-10-09T12:00:00");
    const at = (iso) => ({ stage: "proposal", nextStep: { text: "x", dueDate: new Date(iso) } });

    assert.equal(rules.nextStepState(at("2026-10-08T09:00:00"), now), "overdue");
    assert.equal(rules.nextStepState(at("2026-10-09T18:00:00"), now), "today");
    assert.equal(rules.nextStepState(at("2026-10-12T09:00:00"), now), "soon");
    assert.equal(rules.nextStepState(at("2026-11-30T09:00:00"), now), "later");
    assert.equal(rules.nextStepState({ stage: "new", nextStep: {} }, now), "none");
    assert.equal(rules.nextStepState({ stage: "won", nextStep: {} }, now), null);

});

test("Kennzahlen: Prognose nur aus offenen Chancen", () => {

    const yesterday = new Date(Date.now() - 86400000);

    const { byStage, totals } = rules.summarize([
        { stage: "proposal", mrr: 500, oneTime: 1000, probability: 60, nextStep: { text: "x", dueDate: yesterday } },
        { stage: "meeting", mrr: 300, probability: 20, nextStep: {} },
        { stage: "won", mrr: 1000, probability: 100 },
        { stage: "lost", mrr: 700, probability: 0 }
    ]);

    assert.equal(totals.open, 2);
    assert.equal(totals.mrr, 800);
    assert.equal(totals.oneTime, 1000);
    assert.equal(totals.weightedMrr, 360);
    assert.equal(totals.overdue, 1);
    assert.equal(totals.withoutStep, 1);
    assert.equal(byStage.won.mrr, 1000);
    assert.equal(byStage.lost.count, 1);

});

test("Euro-Format", () => {

    assert.equal(rules.formatEuro(1234.5).replace(/\s/g, " "), "1.235 €");
    assert.equal(rules.formatEuro(null).replace(/\s/g, " "), "0 €");

});

test("Rechte: Techniker ohne Vertrieb und Marketing, Vertrieb mit beidem, nur Admin verwaltet", () => {

    for (const permission of ["sales.view", "sales.edit", "marketing.view", "marketing.manage"]) {
        assert.equal(can("technician", permission), false, `Techniker: ${permission}`);
        assert.equal(can("sales", permission), true, `Vertrieb: ${permission}`);
        assert.equal(can("admin", permission), true, `Admin: ${permission}`);
    }

    for (const permission of ["users.manage", "import.run", "integrations.manage", "email.log"]) {
        assert.equal(can("admin", permission), true, `Admin: ${permission}`);
        assert.equal(can("sales", permission), false, `Vertrieb: ${permission}`);
        assert.equal(can("technician", permission), false, `Techniker: ${permission}`);
    }

});
