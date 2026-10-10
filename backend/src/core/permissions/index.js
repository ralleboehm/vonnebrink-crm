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
// Rollen (Stand: Rechte-Konzept Oktober 2026)
//   Admin:     alles
//   Techniker: Firmen, Kontakte, Tickets, Assets
//   Vertrieb:  Firmen, Kontakte, Marketing, Vertrieb, Verträge – keine
//              Tickets und Assets (offene Tickets einer Firma sieht er nur
//              als Übersicht auf der Firmenseite, ohne Inhalt)
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
    TICKETS_LIST: "tickets.list",     // Liste: Nummer, Betreff, Status – ohne Inhalt
    TICKETS_VIEW: "tickets.view",     // Ticket öffnen, Nachrichten, Anhänge
    TICKETS_EDIT: "tickets.edit",
    TICKETS_ASSIGN: "tickets.assign",
    TICKETS_DELETE: "tickets.delete",

    ASSETS_VIEW: "assets.view",
    ASSETS_EDIT: "assets.edit",
    ASSETS_DELETE: "assets.delete",

    // Dokumente (Nextcloud). Welche Kategorien eine Rolle sieht:
    // utils/documentRules.js (Vertrieb nur Verträge und Angebote)
    DOCUMENTS_VIEW: "documents.view",
    DOCUMENTS_UPLOAD: "documents.upload",
    DOCUMENTS_EDIT: "documents.edit",       // umbenennen, verschieben
    DOCUMENTS_DELETE: "documents.delete",
    DOCUMENTS_SHARE: "documents.share",     // Freigabelinks

    // Verwaltung
    USERS_MANAGE: "users.manage",
    IMPORT_RUN: "import.run",
    INTEGRATIONS_MANAGE: "integrations.manage",
    EMAIL_LOG_VIEW: "email.log",
    SURVEYS_VIEW: "surveys.view",     // Kundenumfragen (NPS) auswerten – nur Admin

    // Allgemein
    SEARCH_USE: "search.use",
    NOTIFICATIONS_VIEW: "notifications.view",

    // Marketing (Gruppen, Empfänger, Einwilligungen, später Kampagnen)
    MARKETING_VIEW: "marketing.view",
    MARKETING_MANAGE: "marketing.manage",

    // Vorbereitet für kommende Module
    SALES_VIEW: "sales.view",
    SALES_EDIT: "sales.edit",
    QUOTES_VIEW: "quotes.view",
    QUOTES_EDIT: "quotes.edit",
    INVOICES_VIEW: "invoices.view",
    INVOICES_EDIT: "invoices.edit",
    CONTRACTS_VIEW: "contracts.view",
    CONTRACTS_EDIT: "contracts.edit",
    CONTRACTS_DELETE: "contracts.delete",
    REPORTS_VIEW: "reports.view",

    // Kundenportal
    PORTAL_TICKETS_OWN: "portal.tickets",
    PORTAL_DOCUMENTS_OWN: "portal.documents"   // vorbereitet: eigene freigegebene Dokumente

});

// Stammdaten und Allgemeines für alle internen Rollen
const INTERNAL_BASE = [
    "companies.*",
    "contacts.*",
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

    technician: [...INTERNAL_BASE, "tickets.*", "assets.*", "documents.view", "documents.upload", "contracts.view"],

    sales: [...INTERNAL_BASE, "marketing.*", "sales.*", "quotes.*", "documents.view", "documents.upload", "contracts.view", "contracts.edit"],

    accounting: ["companies.view", "contacts.view", "invoices.*", "contracts.*", "reports.view", "search.use", "notifications.view", "documents.view", "documents.upload"],

    portal: ["portal.tickets", "portal.documents"]

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
