"use strict";

// ----------------------------------------------------
// Alle Ereignisnamen an einer Stelle
// ----------------------------------------------------
//
// Schema: "<bereich>.<vorgang>" in Kleinbuchstaben, Vergangenheitsform
// (ticket.created, invoice.paid). Mehrteilige Vorgänge in camelCase
// (nextcloud.documentUploaded).
//
// Ein Name muss hier stehen, bevor jemand darauf hört oder ihn auslöst –
// so fallen Tippfehler sofort beim Start auf.

const EVENTS = Object.freeze({

    // Tickets
    TICKET_CREATED: "ticket.created",
    TICKET_UPDATED: "ticket.updated",
    TICKET_ASSIGNED: "ticket.assigned",
    TICKET_CLOSED: "ticket.closed",

    // Stammdaten
    CUSTOMER_CREATED: "customer.created",

    // Assets
    ASSET_CREATED: "asset.created",
    ASSET_UPDATED: "asset.updated",
    ASSET_OFFLINE: "asset.offline",

    // Kundenportal & Benutzer
    PORTAL_WELCOME: "portal.welcome",
    PASSWORD_RESET: "password.reset",

    // Vertrieb & Buchhaltung (kommende Module)
    LEAD_CREATED: "lead.created",
    SALES_CREATED: "sales.created",
    QUOTE_CREATED: "quote.created",
    INVOICE_CREATED: "invoice.created",

    // Integrationen
    ACTION1_ALERT: "action1.alert",
    NEXTCLOUD_DOCUMENT_UPLOADED: "nextcloud.documentUploaded"

});

const KNOWN_EVENTS = new Set(Object.values(EVENTS));

function isKnownEvent(name) {

    return KNOWN_EVENTS.has(name);

}

module.exports = { EVENTS, isKnownEvent };
