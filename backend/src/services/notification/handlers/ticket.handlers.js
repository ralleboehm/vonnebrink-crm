"use strict";

// ----------------------------------------------------
// Benachrichtigungen rund um Tickets
// ----------------------------------------------------
//
// ticket.created
//   1. Interne Benachrichtigung (Glocke) für alle Support-Mitarbeiter
//   2. E-Mail an alle Support-Mitarbeiter (Vorlage ticket-created-internal)
//   3. Eingangsbestätigung an den Kunden (Vorlage ticket-created)
//
// Wer ein Ticket selbst im CRM anlegt, wird darüber nicht benachrichtigt.
// Tickets aus dem Kundenportal benachrichtigen immer das ganze Team.
// Die Eingangsbestätigung an den Kunden geht in beiden Fällen raus,
// sofern ein Ansprechpartner mit E-Mail-Adresse am Ticket hängt.
//
// Handler bekommen alle Werkzeuge über ctx (siehe notification.service.js
// buildContext) und importieren selbst keine Services.

const { EVENTS, register } = require("../events");

const PRIORITY_LABELS = {
    low: "Niedrig",
    normal: "Normal",
    high: "Hoch",
    urgent: "Dringend"
};

const CATEGORY_LABELS = {
    support: "Support",
    hardware: "Hardware",
    software: "Software",
    network: "Netzwerk",
    server: "Server",
    cloud: "Cloud",
    security: "Sicherheit",
    other: "Sonstiges"
};

const SALUTATIONS = {
    mr: "Herr",
    mrs: "Frau"
};

// ----------------------------------------------------
// Hilfsfunktionen (ohne Datenbank, gut testbar)
// ----------------------------------------------------

/**
 * "Herr Müller" / "Frau Jung" / "Alex Schmidt"
 */
function customerName(contact) {

    if (!contact) return "";

    const salutation = SALUTATIONS[contact.salutation];

    if (salutation && contact.lastName) {
        return `${salutation} ${contact.lastName}`;
    }

    return [contact.firstName, contact.lastName].filter(Boolean).join(" ");

}

function fullName(person) {

    if (!person) return "";

    return [person.firstName, person.lastName].filter(Boolean).join(" ");

}

function idString(value) {

    if (!value) return null;

    return String(value._id || value);

}

/**
 * Werte für Vorlagen und Benachrichtigung aus einem (befüllten) Ticket
 */
function ticketData(ticket, ctx) {

    const contact = ticket.contact && typeof ticket.contact === "object" ? ticket.contact : null;
    const company = ticket.company && typeof ticket.company === "object" ? ticket.company : null;

    return {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        company: company ? company.companyName : "",
        customerName: customerName(contact),
        customerEmail: contact && contact.email ? contact.email : null,
        priority: PRIORITY_LABELS[ticket.priority] || ticket.priority || "",
        category: CATEGORY_LABELS[ticket.category] || ticket.category || "",
        ticketLink: ctx.appUrl(`/crm/tickets/${ticket._id}`),
        portalTicketLink: ctx.appUrl(`/portal/tickets/${ticket._id}`)
    };

}

function notificationType(priority) {

    if (priority === "urgent") return "danger";
    if (priority === "high") return "warning";

    return "info";

}

// ----------------------------------------------------
// ticket.created
// ----------------------------------------------------

async function ticketCreated(payload, ctx) {

    const ticketId = idString(payload.ticket);

    if (!ticketId) {
        throw new Error("ticket.created ohne Ticket aufgerufen.");
    }

    // Immer frisch laden, damit Firma und Kontakt befüllt sind
    const ticket = await ctx.loadTicket(ticketId);

    if (!ticket) {
        throw new Error(`Ticket ${ticketId} nicht gefunden.`);
    }

    const data = ticketData(ticket, ctx);
    const fromPortal = payload.source === "portal";
    const creatorId = payload.createdByUserId ? String(payload.createdByUserId) : null;

    // Support-Team ohne den Ersteller selbst
    const staff = (await ctx.getSupportStaff())
        .filter((user) => String(user._id) !== creatorId);

    // 1. Interne Benachrichtigung
    const notified = await ctx.notifyUsers(staff.map((user) => user._id), {
        title: `Neues Ticket ${data.ticketNumber}`,
        message: [data.company, data.subject].filter(Boolean).join(" – "),
        type: notificationType(ticket.priority),
        icon: "bi-ticket-detailed",
        link: `/crm/tickets/${ticket._id}`,
        event: EVENTS.TICKET_CREATED
    });

    // 2. E-Mail an das Support-Team (je Person eine eigene Mail)
    let staffEmails = 0;

    for (const user of staff) {

        if (!user.email) continue;

        ctx.queueTemplateEmail("ticket-created-internal", user.email, {
            ...data,
            agent: user.firstName || fullName(user),
            source: fromPortal ? "über das Kundenportal" : ""
        });

        staffEmails++;

    }

    // 3. Eingangsbestätigung an den Kunden
    let customerEmail = false;

    if (data.customerEmail) {

        ctx.queueTemplateEmail("ticket-created", data.customerEmail, {
            ...data,
            portalLink: fromPortal ? data.portalTicketLink : undefined
        });

        customerEmail = true;

    } else {

        ctx.log(`Ticket ${data.ticketNumber}: kein Ansprechpartner mit E-Mail – keine Eingangsbestätigung.`);

    }

    return {
        ticketNumber: data.ticketNumber,
        notified,
        staffEmails,
        customerEmail
    };

}

register(EVENTS.TICKET_CREATED, ticketCreated);

module.exports = {
    customerName,
    ticketData,
    notificationType,
    ticketCreated
};
