"use strict";

// ----------------------------------------------------
// Dashboard-Karten je Rolle (ohne Datenbank)
// ----------------------------------------------------
//
// Jede Karte sagt, für welche Rollen sie gedacht ist und welches Recht sie
// braucht. Admins bekommen alle Karten (in Abschnitten Technik, Vertrieb,
// Verwaltung), Techniker und Vertrieb nur ihre. Neue Karte: hier eintragen,
// Daten in dashboard.service laden, Ansicht in views/crm/dashboard/index.pug.

const { can } = require("../core/permissions");

const SECTIONS = {
    technik: { label: "Technik", icon: "bi-tools" },
    vertrieb: { label: "Vertrieb", icon: "bi-briefcase" },
    verwaltung: { label: "Verwaltung", icon: "bi-gear" }
};

// Reihenfolge = Anzeige
const CARDS = [
    // Technik
    { key: "techKpis", section: "technik", roles: ["technician"], permission: "tickets.view" },
    { key: "myTickets", section: "technik", roles: ["technician"], permission: "tickets.view" },
    { key: "unassigned", section: "technik", roles: ["technician"], permission: "tickets.view" },
    { key: "attention", section: "technik", roles: ["technician"], permission: "assets.view" },
    { key: "assets", section: "technik", roles: ["technician"], permission: "assets.view" },
    { key: "action1", section: "technik", roles: ["technician"], permission: "assets.view" },

    // Vertrieb
    { key: "salesKpis", section: "vertrieb", roles: ["sales"], permission: "sales.view" },
    { key: "salesTodo", section: "vertrieb", roles: ["sales"], permission: "sales.view" },
    { key: "contractsDue", section: "vertrieb", roles: ["sales", "accounting"], permission: "contracts.view" },
    { key: "recentCompanies", section: "vertrieb", roles: ["sales", "accounting"], permission: "companies.view" },
    { key: "recentContacts", section: "vertrieb", roles: ["sales"], permission: "contacts.view" },

    // Verwaltung (nur Admin)
    { key: "overviewKpis", section: "verwaltung", roles: [], permission: "tickets.view" },
    { key: "adminHealth", section: "verwaltung", roles: [], permission: "surveys.view" },
    { key: "recentTickets", section: "verwaltung", roles: [], permission: "tickets.view" }
];

const KEYS = CARDS.map((card) => card.key);

function roleOf(user) {

    return user && typeof user === "object" ? user.role : user;

}

/**
 * Karten für diesen Benutzer, in Anzeige-Reihenfolge
 *
 * @returns {string[]}
 */
function cardsFor(user) {

    const role = roleOf(user);

    return CARDS
        .filter((card) => (role === "admin" || card.roles.includes(role)) && can(user, card.permission))
        .map((card) => card.key);

}

/**
 * Abschnitte mit ihren Karten (leere Abschnitte fallen weg)
 *
 * @returns {Array<{key, label, icon, cards: string[]}>}
 */
function sectionsFor(user) {

    const visible = new Set(cardsFor(user));

    return Object.entries(SECTIONS)
        .map(([key, section]) => ({ key, ...section, cards: CARDS.filter((c) => c.section === key && visible.has(c.key)).map((c) => c.key) }))
        .filter((section) => section.cards.length);

}

// Dringlichkeit für die Sortierung der Ticketlisten
const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

function byUrgency(a, b) {

    const pa = PRIORITY_ORDER[a.priority] === undefined ? 9 : PRIORITY_ORDER[a.priority];
    const pb = PRIORITY_ORDER[b.priority] === undefined ? 9 : PRIORITY_ORDER[b.priority];

    if (pa !== pb) return pa - pb;

    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);

}

module.exports = {
    SECTIONS,
    CARDS,
    KEYS,
    cardsFor,
    sectionsFor,
    byUrgency
};
