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
// ticket.updated
//   Kunde antwortet oder lädt eine Datei im Portal hoch (source "portal"):
//     Glocke + E-Mail (Vorlage ticket-reply-internal) an den zugewiesenen
//     Bearbeiter. Ist niemand (aktiv) zugewiesen, an das ganze Support-Team.
//   Mitarbeiter antwortet oder lädt eine Datei im CRM hoch (source "crm"):
//     E-Mail an den Kunden (Vorlage ticket-reply). Interne Notizen und
//     interne Dateien lösen nichts aus.
//
// ticket.assigned
//   Glocke für den neuen Bearbeiter (außer er hat sich selbst zugewiesen).
//   Beim ERSTEN Zuweisen zusätzlich eine E-Mail an den Kunden
//   (Vorlage ticket-assigned) – bei späterem Umverteilen nicht.
//
// ticket.closed (Status wechselt auf „Gelöst“ oder „Geschlossen“)
//   E-Mail an den Kunden (Vorlage ticket-closed), einmal je Abschluss.
//
// Links ins Kundenportal stehen nur in Kunden-Mails, wenn der Kontakt einen
// aktiven Portalzugang hat – sonst „antworten Sie auf diese E-Mail“.
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

const STATUS_LABELS = {
    open: "Offen",
    in_progress: "In Bearbeitung",
    waiting: "Wartend",
    resolved: "Gelöst",
    closed: "Geschlossen"
};

// Längere Texte in E-Mails kürzen (die ganze Nachricht steht im Ticket)
const EMAIL_MESSAGE_LENGTH = 4000;

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

// ----------------------------------------------------
// ticket.updated
// ----------------------------------------------------

const UPDATE_KINDS = {
    message: { title: "Antwort vom Kunden", icon: "bi-chat-left-text" },
    attachment: { title: "Datei vom Kunden", icon: "bi-paperclip" }
};

const EXCERPT_LENGTH = 160;

/**
 * Kurzer Auszug für die Glocke: Leerraum zusammenfassen, kürzen
 */
function excerpt(text, max = EXCERPT_LENGTH) {

    const clean = String(text || "").replace(/\s+/g, " ").trim();

    if (clean.length <= max) return clean;

    return `${clean.slice(0, max - 1).trimEnd()}…`;

}

/**
 * Wer wird benachrichtigt? Der zugewiesene Bearbeiter, sofern er aktiv
 * zum Support-Team gehört – sonst das ganze Team.
 */
function updateRecipients(ticket, staff) {

    const assignedId = idString(ticket.assignedTo);

    if (assignedId) {

        const assigned = staff.filter((user) => String(user._id) === assignedId);

        if (assigned.length) return assigned;

    }

    return staff;

}

function contactOf(ticket) {

    return ticket.contact && typeof ticket.contact === "object" ? ticket.contact : null;

}

/**
 * Link ins Kundenportal nur, wenn der Kontakt sich dort auch anmelden kann
 */
async function portalLinkFor(ticket, ctx) {

    const contact = contactOf(ticket);

    if (!contact || !contact._id || typeof ctx.hasActivePortalAccount !== "function") return undefined;

    return (await ctx.hasActivePortalAccount(contact._id))
        ? ctx.appUrl(`/portal/tickets/${ticket._id}`)
        : undefined;

}

async function ticketUpdated(payload, ctx) {

    const ticketId = idString(payload.ticket);

    if (!ticketId) {
        throw new Error("ticket.updated ohne Ticket aufgerufen.");
    }

    const kind = UPDATE_KINDS[payload.kind];

    if (!kind) {
        throw new Error(`ticket.updated: unbekannte Art "${payload.kind}".`);
    }

    if (payload.source === "crm") {
        return staffReplied(ticketId, payload, ctx);
    }

    if (payload.source !== "portal") {
        return { ticketNumber: null, notified: 0, skipped: "unbekannte Quelle" };
    }

    const ticket = await ctx.loadTicket(ticketId);

    if (!ticket) {
        throw new Error(`Ticket ${ticketId} nicht gefunden.`);
    }

    const company = ticket.company && typeof ticket.company === "object" ? ticket.company.companyName : "";
    const author = payload.authorName || customerName(contactOf(ticket));

    const detail = payload.kind === "attachment"
        ? excerpt(payload.fileName, 120)
        : excerpt(payload.message);

    const recipients = updateRecipients(ticket, await ctx.getSupportStaff());

    // 1. Glocke
    const notified = await ctx.notifyUsers(recipients.map((user) => user._id), {
        title: `${kind.title} – ${ticket.ticketNumber}`,
        message: [[author, company].filter(Boolean).join(", "), detail].filter(Boolean).join(": "),
        type: notificationType(ticket.priority),
        icon: kind.icon,
        link: `/crm/tickets/${ticket._id}`,
        event: EVENTS.TICKET_UPDATED
    });

    // 2. E-Mail an den zuständigen Techniker (sonst an das Team)
    let staffEmails = 0;

    for (const user of recipients) {

        if (!user.email) continue;

        ctx.queueTemplateEmail("ticket-reply-internal", user.email, {
            agent: user.firstName || fullName(user),
            author: author || "Der Kunde",
            company,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            priority: PRIORITY_LABELS[ticket.priority] || "",
            status: STATUS_LABELS[ticket.status] || "",
            message: payload.kind === "message" ? String(payload.message || "").trim().slice(0, EMAIL_MESSAGE_LENGTH) : "",
            fileName: payload.kind === "attachment" ? String(payload.fileName || "").slice(0, 200) : "",
            ticketLink: ctx.appUrl(`/crm/tickets/${ticket._id}`)
        });

        staffEmails++;

    }

    return {
        ticketNumber: ticket.ticketNumber,
        notified,
        staffEmails
    };

}

/**
 * Mitarbeiter hat im CRM geantwortet oder eine Datei hochgeladen:
 * E-Mail an den Kunden (nicht bei internen Notizen/Dateien)
 */
async function staffReplied(ticketId, payload, ctx) {

    if (payload.isInternal) {
        return { ticketNumber: null, customerEmail: false, skipped: "intern" };
    }

    const ticket = await ctx.loadTicket(ticketId);

    if (!ticket) {
        throw new Error(`Ticket ${ticketId} nicht gefunden.`);
    }

    const contact = contactOf(ticket);

    if (!contact || !contact.email) {

        ctx.log(`Ticket ${ticket.ticketNumber}: kein Ansprechpartner mit E-Mail – keine Mail zur Antwort.`);

        return { ticketNumber: ticket.ticketNumber, customerEmail: false };

    }

    const portalLink = await portalLinkFor(ticket, ctx);

    ctx.queueTemplateEmail("ticket-reply", contact.email, {
        customerName: customerName(contact),
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        agent: payload.authorName || "",
        message: payload.kind === "message" ? String(payload.message || "").trim().slice(0, EMAIL_MESSAGE_LENGTH) : "",
        fileName: payload.kind === "attachment" ? String(payload.fileName || "").slice(0, 200) : "",
        portalLink,
        noPortal: portalLink ? "" : "ja"
    });

    return { ticketNumber: ticket.ticketNumber, customerEmail: true };

}

register(EVENTS.TICKET_UPDATED, ticketUpdated);

// ----------------------------------------------------
// ticket.assigned
// ----------------------------------------------------

async function ticketAssigned(payload, ctx) {

    const ticketId = idString(payload.ticket);

    if (!ticketId) {
        throw new Error("ticket.assigned ohne Ticket aufgerufen.");
    }

    const assignedId = idString(payload.assignedTo);

    // Bearbeiter entfernt oder unverändert: nichts zu tun
    if (!assignedId || assignedId === idString(payload.previousAssignedTo)) {
        return { ticketNumber: null, notified: 0, customerEmail: false, skipped: "keine Änderung" };
    }

    const ticket = await ctx.loadTicket(ticketId);

    if (!ticket) {
        throw new Error(`Ticket ${ticketId} nicht gefunden.`);
    }

    const staff = await ctx.getSupportStaff();
    const assignee = ticket.assignedTo && typeof ticket.assignedTo === "object" && ticket.assignedTo.firstName
        ? ticket.assignedTo
        : staff.find((user) => String(user._id) === assignedId) || null;

    const company = ticket.company && typeof ticket.company === "object" ? ticket.company.companyName : "";

    // 1. Glocke für den neuen Bearbeiter (nicht, wenn er es selbst war)
    let notified = 0;

    if (assignedId !== idString(payload.assignedByUserId)) {

        notified = await ctx.notifyUsers([assignedId], {
            title: `Ticket ${ticket.ticketNumber} zugewiesen`,
            message: [company, ticket.subject].filter(Boolean).join(" – "),
            type: notificationType(ticket.priority),
            icon: "bi-person-check",
            link: `/crm/tickets/${ticket._id}`,
            event: EVENTS.TICKET_ASSIGNED
        });

    }

    // 2. Kunde: nur beim ersten Zuweisen
    let customerEmail = false;
    const contact = contactOf(ticket);

    if (!idString(payload.previousAssignedTo) && contact && contact.email && !["resolved", "closed"].includes(ticket.status)) {

        ctx.queueTemplateEmail("ticket-assigned", contact.email, {
            customerName: customerName(contact),
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            agent: fullName(assignee),
            portalLink: await portalLinkFor(ticket, ctx)
        });

        customerEmail = true;

    }

    return { ticketNumber: ticket.ticketNumber, notified, customerEmail };

}

register(EVENTS.TICKET_ASSIGNED, ticketAssigned);

// ----------------------------------------------------
// ticket.closed
// ----------------------------------------------------

async function ticketClosed(payload, ctx) {

    const ticketId = idString(payload.ticket);

    if (!ticketId) {
        throw new Error("ticket.closed ohne Ticket aufgerufen.");
    }

    const ticket = await ctx.loadTicket(ticketId);

    if (!ticket) {
        throw new Error(`Ticket ${ticketId} nicht gefunden.`);
    }

    const contact = contactOf(ticket);

    if (!contact || !contact.email) {

        ctx.log(`Ticket ${ticket.ticketNumber}: kein Ansprechpartner mit E-Mail – keine Abschluss-Mail.`);

        return { ticketNumber: ticket.ticketNumber, customerEmail: false };

    }

    ctx.queueTemplateEmail("ticket-closed", contact.email, {
        customerName: customerName(contact),
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        agent: payload.closedByName || "",
        resolution: payload.resolution ? String(payload.resolution).trim().slice(0, EMAIL_MESSAGE_LENGTH) : "",
        portalLink: await portalLinkFor(ticket, ctx)
    });

    return { ticketNumber: ticket.ticketNumber, customerEmail: true };

}

register(EVENTS.TICKET_CLOSED, ticketClosed);

module.exports = {
    STATUS_LABELS,
    ticketAssigned,
    ticketClosed,
    staffReplied,
    customerName,
    ticketData,
    notificationType,
    excerpt,
    updateRecipients,
    ticketCreated,
    ticketUpdated
};
