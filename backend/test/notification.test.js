"use strict";

// Tests für das Benachrichtigungs- und E-Mail-Framework.
// Keine Datenbank, kein Mailserver: Werkzeuge werden als Attrappen übergeben.
//
// Ausführen mit:  node --test test/notification.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const events = require("../src/services/notification/events");
const templates = require("../src/services/emailTemplate.service");
const email = require("../src/services/email.service");
const ticketHandlers = require("../src/services/notification/handlers/ticket.handlers");

// notification.service braucht mongoose (nach npm install vorhanden)
let notificationService = null;

try {
    require.resolve("mongoose");
    notificationService = require("../src/services/notification.service");
} catch {
    // ohne npm install werden diese Tests übersprungen
}

const needsMongoose = { skip: !notificationService && "mongoose nicht installiert" };

// ----------------------------------------------------
// Ereignis-Register
// ----------------------------------------------------

test("Register: ticket.created ist angemeldet, künftige Ereignisse vorbereitet", () => {

    assert.equal(events.hasHandler(events.EVENTS.TICKET_CREATED), true);

    const quote = events.list().find((e) => e.event === "quote.created");

    assert.deepEqual(quote, { event: "quote.created", implemented: false });

    for (const name of ["invoice.created", "lead.created", "customer.created", "asset.offline", "action1.alert", "nextcloud.documentUploaded"]) {
        assert.ok(Object.values(events.EVENTS).includes(name), name);
    }

});

test("Register: unbekannte Ereignisse und doppelte Handler werden abgelehnt", () => {

    assert.throws(() => events.register("tippfehler.created", async () => {}), /Unbekanntes/);
    assert.throws(() => events.register(events.EVENTS.TICKET_CREATED, async () => {}), /bereits/);
    assert.throws(() => events.register(events.EVENTS.QUOTE_CREATED, "kein Handler"), /Funktion/);

});

// ----------------------------------------------------
// Vorlagen
// ----------------------------------------------------

test("Vorlagen: Platzhalter, Maskierung und {{#if}}", () => {

    const out = templates.fill(
        "Hallo {{name}}{{#if company}} von {{company}}{{/if}}! {{ticket.number}} {{fehlt}}",
        { name: "<b>Anna</b>", company: "", ticket: { number: "TIC-1" } }
    );

    assert.equal(out, "Hallo &lt;b&gt;Anna&lt;/b&gt;! TIC-1 ");

    assert.equal(templates.fill("{{x}}", { x: "<a>" }, { escape: false }), "<a>");
    assert.equal(templates.fill("[{{content}}]", { content: "<p>" }, { raw: { content: "<p>ok</p>" } }), "[<p>ok</p>]");

});

test("Vorlagen: Kopf mit Betreff wird erkannt", () => {

    const parsed = templates.parse("---\nsubject: Hallo {{name}}\n---\n<p>Text</p>");

    assert.equal(parsed.meta.subject, "Hallo {{name}}");
    assert.equal(parsed.body, "<p>Text</p>");

});

test("Vorlagen: alle Vorlagen lassen sich rendern", async () => {

    const names = await templates.list();

    assert.deepEqual(names, [
        "contract-reminder",
        "marketing-confirm",
        "password-reset",
        "portal-welcome",
        "ticket-assigned",
        "ticket-closed",
        "ticket-created",
        "ticket-created-internal",
        "ticket-reply",
        "ticket-reply-internal"
    ]);

    const data = {
        customerName: "Herr Müller",
        ticketNumber: "TIC-000042",
        subject: "Drucker <defekt>",
        company: "Holz Müller GmbH",
        agent: "Ralf",
        priority: "Hoch",
        ticketLink: "https://crm.example.de/crm/tickets/1",
        email: "hans@example.de",
        temporaryPassword: "Abc123xyz",
        confirmLink: "https://crm.example.de/email/bestaetigen/abc",
        message: "Bitte den Drucker\neinmal neu starten.",
        author: "Hans Müller"
    };

    for (const name of names) {

        const r = await templates.render(name, data);

        assert.ok(r.subject && !r.subject.includes("{{"), `${name}: Betreff`);
        assert.ok(!r.html.includes("{{"), `${name}: offene Platzhalter im HTML`);
        assert.ok(!/<\/?(p|br|a|td|tr|table|strong|ul|li)\b/i.test(r.text), `${name}: Textfassung enthält HTML`);
        assert.ok(r.html.includes("Vonnebrink IT Operations"), `${name}: Layout`);

    }

    const created = await templates.render("ticket-created", data);

    assert.equal(created.subject, "Ihr Ticket TIC-000042 ist bei uns eingegangen");
    assert.match(created.html, /Drucker &lt;defekt&gt;/);
    assert.match(created.text, /Guten Tag Herr Müller,/);

});

test("Vorlagen: ungültige oder fehlende Namen", async () => {

    await assert.rejects(templates.render("../../etc/passwd"), /Ungültiger Vorlagenname/);
    await assert.rejects(templates.render("gibt-es-nicht"), /nicht gefunden/);

});

test("htmlToText: Links, Listen und Zeilenumbrüche", () => {

    const text = templates.htmlToText(
        "<p>Hallo<br>\nWelt</p>\n<ul>\n<li>eins</li>\n<li>zwei</li>\n</ul>\n<p><a href=\"https://x.de\">Portal</a> &amp; mehr</p>"
    );

    assert.equal(text, "Hallo\nWelt\n\n- eins\n- zwei\n\nPortal (https://x.de) & mehr");

});

// ----------------------------------------------------
// E-Mail-Service
// ----------------------------------------------------

test("E-Mail: Empfänger werden bereinigt", () => {

    assert.deepEqual(
        email.normalizeRecipients(["A@Example.de", "a@example.de", "kaputt", "", null, "b@x.de"]),
        ["a@example.de", "b@x.de"]
    );

    assert.deepEqual(email.normalizeRecipients("x@y.de, z@y.de"), []);

});

test("E-Mail: Konfiguration und Links aus der Umgebung", () => {

    assert.equal(email.isConfigured({}), false);
    assert.equal(email.isConfigured({ SMTP_HOST: "smtp.x.de", MAIL_FROM: "a@x.de" }), true);

    assert.equal(email.configFromEnv({ SMTP_PORT: "465" }).secure, true);
    assert.equal(email.configFromEnv({ SMTP_PORT: "587" }).secure, false);
    assert.equal(email.configFromEnv({ SMTP_PORT: "587", SMTP_SECURE: "true" }).secure, true);

    assert.equal(email.appUrl("/portal", { APP_URL: "https://crm.x.de/" }), "https://crm.x.de/portal");
    assert.equal(email.appUrl("portal", { PORT: "4000" }), "http://localhost:4000/portal");

});

test("E-Mail: ohne SMTP wird nichts verschickt, nur protokolliert", async () => {

    const saved = { host: process.env.SMTP_HOST, from: process.env.MAIL_FROM };

    delete process.env.SMTP_HOST;
    delete process.env.MAIL_FROM;

    const originalLog = console.log;
    console.log = () => {};

    try {

        const result = await email.send({ to: "kunde@example.de", subject: "Test", text: "x" });

        assert.equal(result.sent, false);
        assert.match(result.skipped, /nicht konfiguriert/);

        const none = await email.send({ to: "kaputt", subject: "Test" });

        assert.equal(none.sent, false);
        assert.match(none.skipped, /Keine gültige/);

        // Hintergrund-Versand wirft nie
        email.queueTemplate("ticket-created", "kunde@example.de", { ticketNumber: "TIC-1", subject: "x" });
        await email.flush();
        assert.equal(email.pending(), 0);

    } finally {

        console.log = originalLog;
        if (saved.host !== undefined) process.env.SMTP_HOST = saved.host;
        if (saved.from !== undefined) process.env.MAIL_FROM = saved.from;

    }

});

// ----------------------------------------------------
// Handler ticket.created
// ----------------------------------------------------

function fakeContext(overrides = {}) {

    const calls = { notifications: [], emails: [], logs: [] };

    const ctx = {
        EVENTS: events.EVENTS,
        appUrl: (p) => `https://crm.example.de${p}`,
        log: (...args) => calls.logs.push(args.join(" ")),
        loadTicket: async () => ({
            _id: "t1",
            ticketNumber: "TIC-000007",
            subject: "Drucker druckt nicht",
            description: "Kein Toner",
            priority: "urgent",
            category: "hardware",
            company: { companyName: "Holz Müller GmbH" },
            contact: { _id: "p1", salutation: "mr", firstName: "Hans", lastName: "Müller", email: "hans@example.de" }
        }),
        getSupportStaff: async () => [
            { _id: "u1", firstName: "Ralf", lastName: "V", email: "ralf@vonnebrink.com" },
            { _id: "u2", firstName: "Tom", lastName: "T", email: "tom@vonnebrink.com" }
        ],
        notifyUsers: async (ids, data) => { calls.notifications.push({ ids: ids.map(String), data }); return ids.length; },
        queueTemplateEmail: (template, to, data) => { calls.emails.push({ template, to, data }); },
        hasActivePortalAccount: async () => true,
        loadContact: async () => ({ _id: "p1", salutation: "mrs", firstName: "Eva", lastName: "Kraus", email: "eva@example.de", company: { companyName: "Kraus KG" } }),
        ...overrides
    };

    return { ctx, calls };

}

test("ticket.created aus dem CRM: Ersteller wird nicht benachrichtigt", async () => {

    const { ctx, calls } = fakeContext();

    const result = await ticketHandlers.ticketCreated({ ticket: "t1", createdByUserId: "u1", source: "crm" }, ctx);

    assert.deepEqual(result, { ticketNumber: "TIC-000007", notified: 1, staffEmails: 1, customerEmail: true });

    assert.deepEqual(calls.notifications[0].ids, ["u2"]);
    assert.equal(calls.notifications[0].data.type, "danger");
    assert.equal(calls.notifications[0].data.link, "/crm/tickets/t1");
    assert.equal(calls.notifications[0].data.event, "ticket.created");

    const [staffMail, customerMail] = calls.emails;

    assert.equal(staffMail.template, "ticket-created-internal");
    assert.equal(staffMail.to, "tom@vonnebrink.com");
    assert.equal(staffMail.data.agent, "Tom");

    assert.equal(customerMail.template, "ticket-created");
    assert.equal(customerMail.to, "hans@example.de");
    assert.equal(customerMail.data.customerName, "Herr Müller");
    assert.equal(customerMail.data.portalLink, undefined, "CRM-Tickets ohne Portal-Hinweis");

});

test("ticket.created aus dem Portal: ganzes Team, Link zum Portal-Ticket", async () => {

    const { ctx, calls } = fakeContext();

    const result = await ticketHandlers.ticketCreated({ ticket: { _id: "t1" }, source: "portal" }, ctx);

    assert.equal(result.notified, 2);
    assert.equal(result.staffEmails, 2);

    const customerMail = calls.emails.find((m) => m.template === "ticket-created");

    assert.equal(customerMail.data.portalLink, "https://crm.example.de/portal/tickets/t1");
    assert.equal(calls.emails[0].data.source, "über das Kundenportal");

});

test("ticket.created ohne Kontakt-E-Mail: keine Eingangsbestätigung", async () => {

    const { ctx, calls } = fakeContext({
        loadTicket: async () => ({ _id: "t2", ticketNumber: "TIC-2", subject: "x", priority: "normal", company: { companyName: "A" }, contact: null })
    });

    const result = await ticketHandlers.ticketCreated({ ticket: "t2", source: "crm" }, ctx);

    assert.equal(result.customerEmail, false);
    assert.equal(calls.emails.filter((m) => m.template === "ticket-created").length, 0);
    assert.match(calls.logs[0], /keine Eingangsbestätigung/);
    assert.equal(calls.notifications[0].data.type, "info");

});

// ----------------------------------------------------
// Handler ticket.updated (Kunde antwortet im Portal)
// ----------------------------------------------------

test("Register: ticket.updated ist angemeldet", () => {

    assert.equal(events.hasHandler(events.EVENTS.TICKET_UPDATED), true);

});

test("ticket.updated: Antwort geht nur an den zugewiesenen Bearbeiter", async () => {

    const { ctx, calls } = fakeContext({
        loadTicket: async () => ({
            _id: "t1", ticketNumber: "TIC-000007", priority: "normal",
            company: { companyName: "Holz Müller GmbH" },
            contact: { salutation: "mr", lastName: "Müller" },
            assignedTo: { _id: "u2", firstName: "Tom" }
        })
    });

    const result = await ticketHandlers.ticketUpdated({
        ticket: "t1", kind: "message", source: "portal",
        authorName: "Hans Müller", message: "  Drucker   geht\nwieder nicht  "
    }, ctx);

    assert.deepEqual(result, { ticketNumber: "TIC-000007", notified: 1, staffEmails: 1 });
    assert.deepEqual(calls.notifications[0].ids, ["u2"]);

    const data = calls.notifications[0].data;

    assert.equal(data.title, "Antwort vom Kunden – TIC-000007");
    assert.equal(data.message, "Hans Müller, Holz Müller GmbH: Drucker geht wieder nicht");
    assert.equal(data.icon, "bi-chat-left-text");
    assert.equal(data.link, "/crm/tickets/t1");
    assert.equal(data.event, "ticket.updated");

    // E-Mail nur an den zuständigen Techniker, mit vollem Text
    assert.equal(calls.emails.length, 1);
    assert.equal(calls.emails[0].template, "ticket-reply-internal");
    assert.equal(calls.emails[0].to, "tom@vonnebrink.com");
    assert.equal(calls.emails[0].data.agent, "Tom");
    assert.equal(calls.emails[0].data.author, "Hans Müller");
    assert.equal(calls.emails[0].data.message, "Drucker   geht\nwieder nicht");
    assert.equal(calls.emails[0].data.ticketLink, "https://crm.example.de/crm/tickets/t1");

});

test("ticket.updated: ohne (aktiven) Bearbeiter bekommt das ganze Team die Glocke", async () => {

    const ticket = { _id: "t1", ticketNumber: "TIC-1", priority: "urgent", company: { companyName: "A" }, contact: null };

    // niemand zugewiesen
    let { ctx, calls } = fakeContext({ loadTicket: async () => ({ ...ticket, assignedTo: null }) });
    await ticketHandlers.ticketUpdated({ ticket: "t1", kind: "attachment", source: "portal", fileName: "rechnung.pdf" }, ctx);

    assert.deepEqual(calls.notifications[0].ids, ["u1", "u2"]);
    assert.equal(calls.notifications[0].data.title, "Datei vom Kunden – TIC-1");
    assert.equal(calls.notifications[0].data.message, "A: rechnung.pdf");
    assert.equal(calls.notifications[0].data.icon, "bi-paperclip");
    assert.equal(calls.notifications[0].data.type, "danger");

    // zugewiesen an jemanden, der nicht (mehr) im Support-Team ist
    ({ ctx, calls } = fakeContext({ loadTicket: async () => ({ ...ticket, assignedTo: "u9" }) }));
    await ticketHandlers.ticketUpdated({ ticket: "t1", kind: "message", source: "portal", message: "x" }, ctx);

    assert.deepEqual(calls.notifications[0].ids, ["u1", "u2"]);

});

test("ticket.updated aus dem CRM: Antwort per E-Mail an den Kunden, interne Notizen nicht", async () => {

    let { ctx, calls } = fakeContext();

    const reply = await ticketHandlers.ticketUpdated({ ticket: "t1", kind: "message", source: "crm", authorName: "Ralf Böhm", message: "Bitte neu starten." }, ctx);

    assert.deepEqual(reply, { ticketNumber: "TIC-000007", customerEmail: true });
    assert.equal(calls.notifications.length, 0, "keine Glocke für Mitarbeiter-Antworten");
    assert.equal(calls.emails.length, 1);

    const mail = calls.emails[0];

    assert.equal(mail.template, "ticket-reply");
    assert.equal(mail.to, "hans@example.de");
    assert.equal(mail.data.customerName, "Herr Müller");
    assert.equal(mail.data.agent, "Ralf Böhm");
    assert.equal(mail.data.message, "Bitte neu starten.");
    assert.equal(mail.data.portalLink, "https://crm.example.de/portal/tickets/t1");
    assert.equal(mail.data.noPortal, "");

    // Datei
    ({ ctx, calls } = fakeContext());
    await ticketHandlers.ticketUpdated({ ticket: "t1", kind: "attachment", source: "crm", fileName: "anleitung.pdf" }, ctx);
    assert.equal(calls.emails[0].data.fileName, "anleitung.pdf");
    assert.equal(calls.emails[0].data.message, "");

    // ohne Portalzugang: kein Portal-Link, Hinweis auf Antwort per E-Mail
    ({ ctx, calls } = fakeContext({ hasActivePortalAccount: async () => false }));
    await ticketHandlers.ticketUpdated({ ticket: "t1", kind: "message", source: "crm", message: "x" }, ctx);
    assert.equal(calls.emails[0].data.portalLink, undefined);
    assert.equal(calls.emails[0].data.noPortal, "ja");

    // interne Notiz: nichts
    ({ ctx, calls } = fakeContext());
    const internal = await ticketHandlers.ticketUpdated({ ticket: "t1", kind: "message", source: "crm", isInternal: true, message: "geheim" }, ctx);
    assert.equal(internal.customerEmail, false);
    assert.equal(calls.emails.length, 0);

    // ohne Kontakt-E-Mail: nichts, aber im Log
    ({ ctx, calls } = fakeContext({ loadTicket: async () => ({ _id: "t2", ticketNumber: "TIC-2", contact: null }) }));
    const noMail = await ticketHandlers.ticketUpdated({ ticket: "t2", kind: "message", source: "crm", message: "x" }, ctx);
    assert.equal(noMail.customerEmail, false);
    assert.match(calls.logs[0], /keine Mail zur Antwort/);

    await assert.rejects(ticketHandlers.ticketUpdated({ ticket: "t1", kind: "status", source: "portal" }, ctx), /unbekannte Art/);
    await assert.rejects(ticketHandlers.ticketUpdated({ kind: "message", source: "portal" }, ctx), /ohne Ticket/);

});

test("ticket.assigned: Glocke für den Bearbeiter, Kunden-Mail nur beim ersten Zuweisen", async () => {

    const ticket = {
        _id: "t1", ticketNumber: "TIC-000007", subject: "Drucker", priority: "high", status: "open",
        company: { companyName: "Holz Müller GmbH" },
        contact: { _id: "p1", salutation: "mr", lastName: "Müller", email: "hans@example.de" },
        assignedTo: { _id: "u2", firstName: "Tom", lastName: "Tech" }
    };

    let { ctx, calls } = fakeContext({ loadTicket: async () => ticket });

    const first = await ticketHandlers.ticketAssigned({ ticket: "t1", assignedTo: "u2", previousAssignedTo: null, assignedByUserId: "u1" }, ctx);

    assert.deepEqual(first, { ticketNumber: "TIC-000007", notified: 1, customerEmail: true });
    assert.deepEqual(calls.notifications[0].ids, ["u2"]);
    assert.equal(calls.notifications[0].data.title, "Ticket TIC-000007 zugewiesen");
    assert.equal(calls.notifications[0].data.event, "ticket.assigned");
    assert.equal(calls.emails[0].template, "ticket-assigned");
    assert.equal(calls.emails[0].data.agent, "Tom Tech");
    assert.equal(calls.emails[0].data.portalLink, "https://crm.example.de/portal/tickets/t1");

    // selbst zugewiesen: keine Glocke, Kunde trotzdem informiert
    ({ ctx, calls } = fakeContext({ loadTicket: async () => ticket }));
    const self = await ticketHandlers.ticketAssigned({ ticket: "t1", assignedTo: "u2", previousAssignedTo: null, assignedByUserId: "u2" }, ctx);
    assert.equal(self.notified, 0);
    assert.equal(self.customerEmail, true);

    // umverteilen: Glocke ja, Kunde nicht noch einmal
    ({ ctx, calls } = fakeContext({ loadTicket: async () => ticket }));
    const moved = await ticketHandlers.ticketAssigned({ ticket: "t1", assignedTo: "u2", previousAssignedTo: "u1", assignedByUserId: "u1" }, ctx);
    assert.equal(moved.notified, 1);
    assert.equal(moved.customerEmail, false);
    assert.equal(calls.emails.length, 0);

    // entfernt oder unverändert: nichts
    ({ ctx, calls } = fakeContext({ loadTicket: async () => ticket }));
    assert.equal((await ticketHandlers.ticketAssigned({ ticket: "t1", assignedTo: null, previousAssignedTo: "u2" }, ctx)).notified, 0);
    assert.equal((await ticketHandlers.ticketAssigned({ ticket: "t1", assignedTo: "u2", previousAssignedTo: "u2" }, ctx)).notified, 0);
    assert.equal(calls.emails.length + calls.notifications.length, 0);

});

test("ticket.closed: Abschluss-Mail an den Kunden", async () => {

    let { ctx, calls } = fakeContext();

    const result = await ticketHandlers.ticketClosed({ ticket: "t1", closedByName: "Ralf Böhm" }, ctx);

    assert.deepEqual(result, { ticketNumber: "TIC-000007", customerEmail: true, survey: false });
    assert.equal(calls.emails[0].template, "ticket-closed");
    assert.equal(calls.emails[0].to, "hans@example.de");
    assert.equal(calls.emails[0].data.agent, "Ralf Böhm");
    assert.equal(calls.emails[0].data.survey, undefined);
    assert.equal(calls.notifications.length, 0);

    // Mit Umfrage: Links landen in der Mail
    const links = { url: "https://crm.example.de/email/umfrage/abc", s0: "x0", s10: "x10" };
    ({ ctx, calls } = fakeContext({ createSurvey: async () => links }));
    assert.equal((await ticketHandlers.ticketClosed({ ticket: "t1" }, ctx)).survey, true);
    assert.equal(calls.emails[0].data.survey, links);

    // Umfrage scheitert: Mail geht trotzdem raus
    ({ ctx, calls } = fakeContext({ createSurvey: async () => { throw new Error("DB weg"); } }));
    assert.equal((await ticketHandlers.ticketClosed({ ticket: "t1" }, ctx)).survey, false);
    assert.equal(calls.emails.length, 1);
    assert.match(calls.logs[0], /Umfrage nicht angelegt/);

    ({ ctx, calls } = fakeContext({ loadTicket: async () => ({ _id: "t2", ticketNumber: "TIC-2", contact: { lastName: "X" } }) }));
    assert.equal((await ticketHandlers.ticketClosed({ ticket: "t2" }, ctx)).customerEmail, false);
    assert.match(calls.logs[0], /keine Abschluss-Mail/);

});

test("Portalzugang: Willkommens- und Passwort-Mail mit vorläufigem Passwort", async () => {

    const portalHandlers = require("../src/services/notification/handlers/portal.handlers");

    let { ctx, calls } = fakeContext();

    const welcome = await portalHandlers.portalWelcome({ contact: "p1", temporaryPassword: "Xy12abc", agentName: "Ralf" }, ctx);

    assert.deepEqual(welcome, { email: "eva@example.de" });
    assert.equal(calls.emails[0].template, "portal-welcome");
    assert.equal(calls.emails[0].data.customerName, "Frau Kraus");
    assert.equal(calls.emails[0].data.company, "Kraus KG");
    assert.equal(calls.emails[0].data.temporaryPassword, "Xy12abc");

    ({ ctx, calls } = fakeContext());
    await portalHandlers.passwordReset({ contact: "p1", temporaryPassword: "Neu99" }, ctx);
    assert.equal(calls.emails[0].template, "password-reset");

    ({ ctx, calls } = fakeContext({ loadContact: async () => ({ _id: "p2", lastName: "Ohne" }) }));
    assert.deepEqual(await portalHandlers.portalWelcome({ contact: "p2", temporaryPassword: "x" }, ctx), { email: null });
    assert.equal(calls.emails.length, 0);

    await assert.rejects(portalHandlers.portalWelcome({ contact: "p1" }, ctx), /ohne vorläufiges Passwort/);

    for (const event of ["ticket.assigned", "ticket.closed", "portal.welcome", "password.reset"]) {
        assert.equal(events.hasHandler(event), true, event);
    }

});

test("ticket.updated: lange Antworten werden für die Glocke gekürzt", () => {

    const long = "a".repeat(500);
    const out = ticketHandlers.excerpt(long);

    assert.equal(out.length, 160);
    assert.ok(out.endsWith("…"));
    assert.equal(ticketHandlers.excerpt("kurz"), "kurz");
    assert.equal(ticketHandlers.excerpt(null), "");

});

test("Anrede für Kunden", () => {

    assert.equal(ticketHandlers.customerName({ salutation: "mrs", firstName: "Anna", lastName: "Jung" }), "Frau Jung");
    assert.equal(ticketHandlers.customerName({ salutation: "diverse", firstName: "Alex", lastName: "Schmidt" }), "Alex Schmidt");
    assert.equal(ticketHandlers.customerName(null), "");

});

// ----------------------------------------------------
// Notification Service (braucht mongoose, keine Datenbank)
// ----------------------------------------------------

test("Service: Eingaben werden bereinigt", needsMongoose, () => {

    const n = notificationService._buildNotification("507f1f77bcf86cd799439011", {
        title: "  Hallo  ",
        type: "unbekannt",
        icon: "<script>",
        link: "https://boese.example.com"
    });

    assert.equal(n.title, "Hallo");
    assert.equal(n.type, "info");
    assert.equal(n.icon, "bi-bell");
    assert.equal(n.link, null);

    assert.equal(notificationService._safeLink("/crm/tickets/1"), "/crm/tickets/1");
    assert.equal(notificationService._safeLink("//boese.example.com"), null);
    assert.equal(notificationService._safeLink("javascript:alert(1)"), null);

    assert.throws(() => notificationService._buildNotification("507f1f77bcf86cd799439011", { title: " " }), /Titel/);

});

test("Service: dispatch fängt Fehler ab und lässt die Aktion weiterlaufen", needsMongoose, async () => {

    const originalError = console.error;
    console.error = () => {};

    try {

        const failing = await notificationService.dispatch(
            events.EVENTS.TICKET_CREATED,
            { ticket: "t1" },
            { ...fakeContext().ctx, loadTicket: async () => { throw new Error("DB weg"); } }
        );

        assert.deepEqual(failing, { ok: false, event: "ticket.created", error: "DB weg" });

        const ok = await notificationService.dispatch(events.EVENTS.TICKET_CREATED, { ticket: "t1" }, fakeContext().ctx);

        assert.equal(ok.ok, true);
        assert.equal(ok.result.customerEmail, true);

    } finally {

        console.error = originalError;

    }

});

test("Service: Ereignis ohne Handler ist kein Fehler", needsMongoose, async () => {

    const originalWarn = console.warn;
    console.warn = () => {};

    try {
        const result = await notificationService.dispatch(events.EVENTS.QUOTE_CREATED, {});
        assert.deepEqual(result, { ok: true, event: "quote.created", result: null });
    } finally {
        console.warn = originalWarn;
    }

});

test("E-Mail: Hintergrundversand versucht es zweimal und meldet das Ende", async () => {

    // Ohne Datenbankverbindung schreibt das Protokoll nichts – hier geht es um den Ablauf
    assert.equal(email.MAX_ATTEMPTS, 2);
    assert.equal(typeof email.sendTestEmail, "function");

});

test("Vertrag: Kündigungsfrist naht → Glocke und Mail nur an Admin und Vertrieb", async () => {

    const { contractNoticeDue, inDays } = require("../src/services/notification/handlers/contract.handlers");

    const staff = [
        { _id: "u1", firstName: "Ralf", email: "ralf@vonnebrink.com", role: "admin" },
        { _id: "u3", firstName: "Vera", email: "", role: "sales" }
    ];

    let asked = 0;
    const { ctx, calls } = fakeContext({ getContractStaff: async () => { asked++; return staff; } });

    const contract = { _id: "k1", contractNumber: "VTR-000001", title: "Managed Services", company: { companyName: "Holz Müller GmbH" } };
    const reminder = { key: "notice:2026-10-31:30", kind: "notice", deadline: new Date("2026-10-31T00:00:00Z"), daysLeft: 21, stage: 30, renewalDate: new Date("2027-01-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z") };

    const result = await contractNoticeDue({ contract, reminder }, ctx);

    assert.equal(asked, 1, "Empfänger: getContractStaff (Admin + Vertrieb)");
    assert.deepEqual(result, { contract: "VTR-000001", notified: 2, emails: 1, key: "notice:2026-10-31:30" });
    assert.deepEqual(calls.notifications[0].ids, ["u1", "u3"]);

    const note = calls.notifications[0].data;
    assert.equal(note.title, "Kündigungsfrist in 21 Tagen – VTR-000001 Managed Services");
    assert.match(note.message, /^Holz Müller GmbH: Ohne Kündigung bis 31\.10\.2026 verlängert er sich am 1\.1\.2027 automatisch\./);
    assert.equal(note.type, "warning");
    assert.equal(note.link, "/crm/contracts/k1");

    assert.equal(calls.emails.length, 1, "nur mit E-Mail-Adresse");
    assert.equal(calls.emails[0].template, "contract-reminder");
    assert.equal(calls.emails[0].to, "ralf@vonnebrink.com");
    assert.equal(calls.emails[0].data.contractLink, "https://crm.example.de/crm/contracts/k1");

    // Vertragsende ohne Kündigungsfrist, kurz vorher → dringend
    const end = await contractNoticeDue({ contract, reminder: { ...reminder, kind: "end", daysLeft: 1, renewalDate: null } }, fakeContext({ getContractStaff: async () => staff }).ctx);
    assert.equal(end.notified, 2);

    const second = fakeContext({ getContractStaff: async () => staff });
    await contractNoticeDue({ contract, reminder: { ...reminder, kind: "end", daysLeft: 1 } }, second.ctx);
    assert.equal(second.calls.notifications[0].data.title, "Vertrag endet morgen – VTR-000001 Managed Services");
    assert.equal(second.calls.notifications[0].data.type, "danger");

    assert.equal(inDays(0), "heute");

    // Niemand da: kein Fehler
    const none = fakeContext({ getContractStaff: async () => [] });
    assert.deepEqual(await contractNoticeDue({ contract, reminder }, none.ctx), { contract: "VTR-000001", notified: 0, emails: 0, key: reminder.key });

    await assert.rejects(contractNoticeDue({}, ctx), /ohne Vertrag/);

});
