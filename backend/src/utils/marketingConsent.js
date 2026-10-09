"use strict";

// ----------------------------------------------------
// Marketing-Einwilligung: Regeln ohne Datenbank
// ----------------------------------------------------
//
// Genutzt von services/marketing.service.js. Hier getrennt, damit die
// Regeln ohne MongoDB getestet werden können (test/marketing.test.js).
//
// Erreichbar für Kampagnen ist ein Kontakt, wenn
//   - er aktiv, nicht archiviert und per E-Mail erreichbar ist,
//   - seine Einwilligung erteilt ist und
//   - bei der Bestandskunden-Ausnahme (§ 7 Abs. 3 UWG) seine Firma
//     noch aktiver Kunde ist.
// Jede Kampagnen-Mail enthält einen persönlichen Abmeldelink.

const STATUS_LABELS = {
    none: "Keine Angabe",
    granted: "Eingewilligt",
    revoked: "Abgemeldet"
};

const SOURCES = ["portal", "double_opt_in", "link", "crm", "customer"];

const SOURCE_LABELS = {
    portal: "selbst im Kundenportal",
    double_opt_in: "per E-Mail bestätigt (Double-Opt-In)",
    link: "über den Abmeldelink",
    crm: "im CRM mit Nachweis erfasst",
    customer: "Bestandskunde (§ 7 Abs. 3 UWG)"
};

// Quellen, bei denen der Kontakt selbst gehandelt hat
const SELF_SOURCES = ["portal", "double_opt_in", "link"];

// Quellen, die Mitarbeiter im CRM setzen dürfen (Einwilligung erteilen)
const STAFF_GRANT_SOURCES = ["crm", "customer"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function consentOf(contact) {

    const marketing = (contact && contact.marketing) || {};

    return {
        status: marketing.status || "none",
        source: marketing.source || null,
        changedAt: marketing.changedAt || null,
        history: marketing.history || []
    };

}

/**
 * Darf ein Mitarbeiter die Einwilligung im CRM eintragen?
 * Nein, wenn sich der Kontakt selbst abgemeldet hat (Portal oder Abmeldelink).
 */
function staffMayGrant(contact) {

    const consent = consentOf(contact);

    return !(consent.status === "revoked" && SELF_SOURCES.includes(consent.source));

}

/**
 * Warum ist der Kontakt nicht für Kampagnen erreichbar?
 * Gibt null zurück, wenn er erreichbar ist.
 *
 * @param {object} contact
 * @param {object|null} [company]  Firma des Kontakts (für die Bestandskunden-Ausnahme)
 */
function ineligibleReason(contact, company = null) {

    if (!contact || contact.isDeleted) return "Kontakt archiviert";
    if (contact.status === "inactive") return "Kontakt inaktiv";
    if (!contact.email || !EMAIL_PATTERN.test(contact.email)) return "Keine E-Mail-Adresse";

    const { status, source } = consentOf(contact);

    if (status === "revoked") return "Abgemeldet";
    if (status !== "granted") return "Keine Einwilligung";

    if (source === "customer" && (!company || company.status !== "active")) {
        return "Kein aktiver Kunde mehr (Bestandskunden-Ausnahme)";
    }

    return null;

}

function isEligible(contact, company = null) {

    return ineligibleReason(contact, company) === null;

}

/**
 * Prüft eine Einwilligung, die ein Mitarbeiter im CRM erfassen will.
 * Gibt eine Fehlermeldung zurück oder null.
 */
function staffGrantProblem(contact, company, source, note) {

    if (!STAFF_GRANT_SOURCES.includes(source)) {
        return "Unbekannte Art der Einwilligung.";
    }

    if (!staffMayGrant(contact)) {
        return "Der Kontakt hat sich selbst abgemeldet. Nur er selbst kann sich wieder anmelden (Kundenportal oder Bestätigungs-E-Mail).";
    }

    if (source === "customer" && (!company || company.status !== "active")) {
        return "Die Bestandskunden-Ausnahme gilt nur für aktive Kunden (Firmenstatus „Aktiv“).";
    }

    if (String(note || "").trim().length < 3) {
        return source === "customer"
            ? "Bitte angeben, wo der Kunde auf sein Widerspruchsrecht hingewiesen wurde (z. B. „Vertrag vom …“)."
            : "Bitte angeben, wie die Einwilligung erteilt wurde (z. B. „schriftlich am …“).";
    }

    return null;

}

module.exports = {
    STATUS_LABELS,
    SOURCES,
    SOURCE_LABELS,
    SELF_SOURCES,
    STAFF_GRANT_SOURCES,
    consentOf,
    staffMayGrant,
    ineligibleReason,
    isEligible,
    staffGrantProblem
};
