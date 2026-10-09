"use strict";

// ----------------------------------------------------
// Benachrichtigungen rund um den Portalzugang
// ----------------------------------------------------
//
// portal.welcome   Zugang angelegt → Zugangsdaten an den Kontakt
//                  (Vorlage portal-welcome)
// password.reset   Passwort zurückgesetzt → neues vorläufiges Passwort
//                  (Vorlage password-reset)
//
// Beide nur, wenn im CRM „per E-Mail schicken“ angehakt war. Das
// vorläufige Passwort gilt nur für die erste Anmeldung; danach muss der
// Kunde ein eigenes vergeben. Es wird nirgends gespeichert oder
// protokolliert (das E-Mail-Protokoll hält nur Empfänger und Betreff fest).

const { EVENTS, register } = require("../events");
const { customerName } = require("./ticket.handlers");

function idString(value) {

    if (!value) return null;

    return String(value._id || value);

}

function accessMail(template) {

    return async (payload, ctx) => {

        const contactId = idString(payload.contact);

        if (!contactId) {
            throw new Error(`${template}: ohne Kontakt aufgerufen.`);
        }

        if (!payload.temporaryPassword) {
            throw new Error(`${template}: ohne vorläufiges Passwort aufgerufen.`);
        }

        const contact = await ctx.loadContact(contactId);

        if (!contact || !contact.email) {

            ctx.log(`${template}: Kontakt ${contactId} ohne E-Mail-Adresse – nichts verschickt.`);

            return { email: null };

        }

        ctx.queueTemplateEmail(template, contact.email, {
            customerName: customerName(contact),
            company: contact.company && typeof contact.company === "object" ? contact.company.companyName : "",
            email: contact.email,
            temporaryPassword: payload.temporaryPassword,
            agent: payload.agentName || ""
        });

        return { email: contact.email };

    };

}

const portalWelcome = accessMail("portal-welcome");
const passwordReset = accessMail("password-reset");

register(EVENTS.PORTAL_WELCOME, portalWelcome);
register(EVENTS.PASSWORD_RESET, passwordReset);

module.exports = {
    portalWelcome,
    passwordReset
};
