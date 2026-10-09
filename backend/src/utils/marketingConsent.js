"use strict";

// ----------------------------------------------------
// Marketing-Einwilligung: Regeln ohne Datenbank
// ----------------------------------------------------
//
// Genutzt von services/marketing.service.js. Hier getrennt, damit die
// Regeln ohne MongoDB getestet werden können (test/marketing.test.js).

const STATUS_LABELS = {
    none: "Keine Angabe",
    granted: "Eingewilligt",
    revoked: "Abgemeldet"
};

const SOURCE_LABELS = {
    portal: "selbst im Kundenportal",
    crm: "erfasst im CRM"
};

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
 * Nein, wenn sich der Kontakt selbst im Portal abgemeldet hat.
 */
function staffMayGrant(contact) {

    const consent = consentOf(contact);

    return !(consent.status === "revoked" && consent.source === "portal");

}

/**
 * Warum ist der Kontakt nicht für Kampagnen erreichbar?
 * Gibt null zurück, wenn er erreichbar ist.
 */
function ineligibleReason(contact, portalAccount) {

    if (!contact || contact.isDeleted) return "Kontakt archiviert";
    if (contact.status === "inactive") return "Kontakt inaktiv";
    if (!portalAccount) return "Kein Portalzugang";
    if (!portalAccount.active) return "Portalzugang deaktiviert";

    const { status } = consentOf(contact);

    if (status === "revoked") return "Abgemeldet";
    if (status !== "granted") return "Keine Einwilligung";

    return null;

}

function isEligible(contact, portalAccount) {

    return ineligibleReason(contact, portalAccount) === null;

}

module.exports = {
    STATUS_LABELS,
    SOURCE_LABELS,
    consentOf,
    staffMayGrant,
    ineligibleReason,
    isEligible
};
