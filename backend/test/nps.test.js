"use strict";

// Kundenumfrage (NPS): Werte, Gruppen, Kennzahlen, Verlauf, Rechte (ohne Datenbank)
//
// Ausführen mit:  node --test test/nps.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const rules = require("../src/utils/npsRules");
const { can } = require("../src/core/permissions");

test("Wert aus Link oder Formular", () => {

    assert.equal(rules.parseScore("0"), 0);
    assert.equal(rules.parseScore("10"), 10);
    assert.equal(rules.parseScore(" 7 "), 7);
    assert.equal(rules.parseScore(9), 9);

    for (const bad of ["11", "-1", "7.5", "abc", "", null, undefined, "1e1", "007"]) {
        assert.equal(rules.parseScore(bad), null, `ungültig: ${bad}`);
    }

});

test("Gruppen: 0–6 Kritiker, 7–8 Passive, 9–10 Promotoren", () => {

    assert.equal(rules.category(0), "detractor");
    assert.equal(rules.category(6), "detractor");
    assert.equal(rules.category(7), "passive");
    assert.equal(rules.category(8), "passive");
    assert.equal(rules.category(9), "promoter");
    assert.equal(rules.category(10), "promoter");
    assert.equal(rules.category(null), null);

});

test("NPS = % Promotoren − % Kritiker", () => {

    const answers = [10, 10, 9, 9, 9, 8, 7, 6, 3, 0].map((score) => ({ score }));
    const s = rules.summarize(answers);

    assert.equal(s.count, 10);
    assert.equal(s.promoters, 5);
    assert.equal(s.passives, 2);
    assert.equal(s.detractors, 3);
    assert.equal(s.nps, 20);
    assert.deepEqual(s.shares, { promoter: 50, passive: 20, detractor: 30 });
    assert.equal(s.average, 7.1);
    assert.equal(s.distribution.length, 11);
    assert.equal(s.distribution[9], 3);
    assert.equal(s.distribution[10], 2);

    assert.equal(rules.summarize([{ score: 0 }]).nps, -100);
    assert.equal(rules.summarize([{ score: 10 }]).nps, 100);

    const empty = rules.summarize([]);
    assert.equal(empty.count, 0);
    assert.equal(empty.nps, null);
    assert.equal(empty.average, null);

    // Unbeantwortete zählen nicht
    assert.equal(rules.summarize([{ score: null }, { score: 9 }]).count, 1);

});

test("Kommentar wird bereinigt und gekürzt", () => {

    assert.equal(rules.cleanComment("  Danke!\r\nTop  "), "Danke!\nTop");
    assert.equal(rules.cleanComment(undefined), "");
    assert.equal(rules.cleanComment("x".repeat(3000)).length, rules.COMMENT_MAX);

});

test("Verlauf: 12 Monate, auch ohne Antworten", () => {

    const now = new Date("2026-10-09T12:00:00Z");

    const trend = rules.monthlyTrend([
        { score: 10, answeredAt: new Date("2026-10-02T10:00:00Z") },
        { score: 2, answeredAt: new Date("2026-10-03T10:00:00Z") },
        { score: 9, answeredAt: new Date("2026-08-15T10:00:00Z") },
        { score: 9, answeredAt: new Date("2024-01-01T10:00:00Z") }
    ], 12, now);

    assert.equal(trend.length, 12);
    assert.equal(trend[0].key, "2025-11");
    assert.equal(trend[11].key, "2026-10");
    assert.equal(trend[11].label, "Okt 26");
    assert.equal(trend[11].count, 2);
    assert.equal(trend[11].nps, 0);
    assert.equal(trend[9].nps, 100);
    assert.equal(trend[10].nps, null);

    // Monatswechsel in deutscher Zeit: 31.10. 23:30 UTC ist schon November
    assert.equal(rules.monthKey(new Date("2026-10-31T23:30:00Z")), "2026-11");

});

test("Rechte: Umfrage-Auswertung nur für Admins", () => {

    assert.equal(can("admin", "surveys.view"), true);
    assert.equal(can("sales", "surveys.view"), false);
    assert.equal(can("technician", "surveys.view"), false);

});
