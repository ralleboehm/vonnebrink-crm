"use strict";

// ----------------------------------------------------
// Rollen & Rechte (Architektur, noch ohne Verwaltungsoberfläche)
// ----------------------------------------------------
//
// Rechte heißen "<bereich>.<aktion>", z. B. "tickets.delete".
// Platzhalter: "tickets.*" = alle Ticket-Rechte, "*" = alles.
//
//   const { can, requirePermission } = require("../core/permissions");
//
//   router.post("/:id/delete", requirePermission("tickets.delete"), …)
//   if (can(req.session.user, "invoices.create")) { … }
//   // in Pug-Views: if can("users.manage")
//
// WICHTIG: Die Tabelle unten bildet das HEUTIGE Verhalten ab – Admins
// dürfen alles, Techniker und Vertrieb alles außer Benutzerverwaltung,
// Import/Export und Integrationen. Bestehende Routen nutzen weiterhin
// requireAuth/requireRole; wer eine Route auf requirePermission umstellt,
// ändert also nichts am Verhalten. Engere Rechte (z. B. Vertrieb darf
// keine Tickets löschen) sind eine bewusste spätere Entscheidung hier.
//
// Später: Rollen/Rechte aus der Datenbank (models/role.model.js und
// models/permission.model.js existieren bereits) – dann wird nur
// getRolePermissions() ausgetauscht.

const PERMISSIONS = Object.freeze({

    // Stammdaten
    COMPANIES_VIEW: "companies.view",
    COMPANIES_EDIT: "companies.edit",
    COMPANIES_DELETE: "companies.delete",

    CONTACTS_VIEW: "contacts.view",
    CONTACTS_EDIT: "contacts.edit",
    CONTACTS_DELETE: "contacts.delete",
    PORTAL_ACCOUNTS_MANAGE: "contacts.portal",

    // Support
    TICKETS_VIEW: "tickets.view",
    TICKETS_EDIT: "tickets.edit",
    TICKETS_ASSIGN: "tickets.assign",
    TICKETS_DELETE: "tickets.delete",

    ASSETS_VIEW: "assets.view",
    ASSETS_EDIT: "assets.edit",
    ASSETS_DELETE: "assets.delete",

    // Verwaltung
    USERS_MANAGE: "users.manage",
    IMPORT_RUN: "import.run",
    INTEGRATIONS_MANAGE: "integrations.manage",

    // Allgemein
    SEARCH_USE: "search.use",
    NOTIFICATIONS_VIEW: "notifications.view",

    // Vorbereitet für kommende Module
    SALES_VIEW: "sales.view",
    SALES_EDIT: "sales.edit",
    QUOTES_VIEW: "quotes.view",
    QUOTES_EDIT: "quotes.edit",
    INVOICES_VIEW: "invoices.view",
    INVOICES_EDIT: "invoices.edit",
    CONTRACTS_VIEW: "contracts.view",
    CONTRACTS_EDIT: "contracts.edit",
    REPORTS_VIEW: "reports.view",

    // Kundenportal
    PORTAL_TICKETS_OWN: "portal.tickets"

});

// Alles, was interne Benutzer heute dürfen (außer Admin-Bereichen)
const INTERNAL_DEFAULT = [
    "companies.*",
    "contacts.*",
    "tickets.*",
    "assets.*",
    "search.use",
    "notifications.view"
];

const ROLES = Object.freeze({
    ADMIN: "admin",
    TECHNICIAN: "technician",
    SALES: "sales",
    ACCOUNTING: "accounting",   // vorbereitet, im User-Model noch nicht wählbar
    PORTAL: "portal"            // Kundenportal (eigene Anmeldung)
});

const ROLE_LABELS = Object.freeze({
    admin: "Administrator",
    technician: "Techniker",
    sales: "Vertrieb",
    accounting: "Buchhaltung",
    portal: "Portal-Benutzer"
});

const ROLE_PERMISSIONS = Object.freeze({

    admin: ["*"],

    technician: [...INTERNAL_DEFAULT],

    sales: [...INTERNAL_DEFAULT, "sales.*", "quotes.*"],

    accounting: ["companies.view", "contacts.view", "invoices.*", "contracts.*", "reports.view", "search.use", "notifications.view"],

    portal: ["portal.tickets"]

});

/**
 * Rechte einer Rolle (später aus der Datenbank)
 */
function getRolePermissions(role) {

    return ROLE_PERMISSIONS[role] || [];

}

function matches(granted, permission) {

    if (granted === "*" || granted === permission) return true;

    if (granted.endsWith(".*")) {
        return permission.startsWith(granted.slice(0, -1));
    }

    return false;

}

/**
 * Darf der Benutzer das?
 *
 * @param {object|string|null} subject  Session-Benutzer ({ role }) oder Rollenname
 * @param {string} permission           z. B. "tickets.delete"
 */
function can(subject, permission) {

    if (!subject || !permission) return false;

    const role = typeof subject === "string" ? subject : subject.role;

    return getRolePermissions(role).some((granted) => matches(granted, permission));

}

/**
 * Express-Middleware für CRM-Routen
 */
function requirePermission(...permissions) {

    return (req, res, next) => {

        const user = req.session && req.session.user;

        if (!user) {
            return res.redirect("/crm/login");
        }

        if (!permissions.every((permission) => can(user, permission))) {
            return res.status(403).send("Zugriff verweigert.");
        }

        next();

    };

}

module.exports = {
    PERMISSIONS,
    ROLES,
    ROLE_LABELS,
    ROLE_PERMISSIONS,
    getRolePermissions,
    can,
    requirePermission
};
