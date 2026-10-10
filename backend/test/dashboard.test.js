"use strict";

// Dashboard-Karten je Rolle (ohne Datenbank)
//
// Ausführen mit:  node --test test/dashboard.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const cards = require("../src/utils/dashboardCards");

test("Techniker: Tickets und Geräte, kein Vertrieb, keine Verwaltung", () => {

    const list = cards.cardsFor({ role: "technician" });

    assert.deepEqual(list, ["techKpis", "myTickets", "unassigned", "attention", "assets", "action1"]);
    assert.deepEqual(cards.sectionsFor({ role: "technician" }).map((s) => s.key), ["technik"]);

});

test("Vertrieb: Pipeline, Verträge, Kunden – keine Tickets oder Geräte", () => {

    const list = cards.cardsFor({ role: "sales" });

    assert.deepEqual(list, ["salesKpis", "salesTodo", "contractsDue", "recentCompanies", "recentContacts"]);
    assert.deepEqual(cards.sectionsFor({ role: "sales" }).map((s) => s.key), ["vertrieb"]);

});

test("Admin: alle Karten in drei Abschnitten", () => {

    assert.deepEqual(cards.cardsFor({ role: "admin" }), cards.KEYS);
    assert.deepEqual(cards.sectionsFor({ role: "admin" }).map((s) => s.label), ["Technik", "Vertrieb", "Verwaltung"]);

});

test("Unbekannte Rolle: nichts; Buchhaltung: nur passende Karten", () => {

    assert.deepEqual(cards.cardsFor({ role: "portal" }), []);
    assert.deepEqual(cards.cardsFor(null), []);
    assert.deepEqual(cards.cardsFor({ role: "accounting" }), ["contractsDue", "recentCompanies"]);

});

test("Ticketlisten: dringend zuerst, dann älteste", () => {

    const list = [
        { id: 1, priority: "normal", createdAt: "2026-10-01" },
        { id: 2, priority: "urgent", createdAt: "2026-10-05" },
        { id: 3, priority: "high", createdAt: "2026-10-02" },
        { id: 4, priority: "urgent", createdAt: "2026-10-03" }
    ];

    assert.deepEqual(list.sort(cards.byUrgency).map((t) => t.id), [4, 2, 3, 1]);

});
