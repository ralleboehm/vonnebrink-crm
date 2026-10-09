"use strict";

// ----------------------------------------------------
// E-Mail-Service (Nodemailer)
// ----------------------------------------------------
//
// Alle Einstellungen kommen aus der .env (siehe .env.example):
//
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
//   MAIL_FROM, MAIL_REPLY_TO, APP_URL
//
// Ist SMTP_HOST nicht gesetzt, werden E-Mails NICHT verschickt, sondern
// nur im Log angezeigt. So lässt sich lokal entwickeln, ohne dass Kunden
// versehentlich Post bekommen.
//
// send()          verschickt sofort und wartet auf den Mailserver
// sendTemplate()  rendert eine Vorlage aus email-templates/ und verschickt
// queueTemplate() wie sendTemplate(), aber im Hintergrund: kehrt sofort
//                 zurück, Fehler landen im Log, ein Wiederholversuch nach
//                 30 Sekunden. Für Benachrichtigungen gedacht.

const RETRY_DELAY_MS = 30 * 1000;

let transport = null;
let transportKey = null;

// Hintergrund-Warteschlange: Mails werden nacheinander verschickt,
// damit der Mailserver nicht mit vielen gleichzeitigen Verbindungen
// belastet wird.
let queueTail = Promise.resolve();
let queued = 0;

// ----------------------------------------------------
// Konfiguration
// ----------------------------------------------------

function configFromEnv(env = process.env) {

    const port = parseInt(env.SMTP_PORT, 10) || 587;

    return {
        host: (env.SMTP_HOST || "").trim(),
        port,
        // 465 = direkt TLS, 587 = STARTTLS
        secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
        user: (env.SMTP_USER || "").trim(),
        pass: env.SMTP_PASS || "",
        from: (env.MAIL_FROM || "").trim(),
        replyTo: (env.MAIL_REPLY_TO || "").trim() || null,
        appUrl: (env.APP_URL || "").trim().replace(/\/+$/, "")
    };

}

/**
 * Ist ein Mailserver eingetragen?
 */
function isConfigured(env = process.env) {

    const config = configFromEnv(env);

    return Boolean(config.host && config.from);

}

/**
 * Absolute Adresse für Links in E-Mails, z. B. appUrl("/portal")
 */
function appUrl(path = "", env = process.env) {

    const base = configFromEnv(env).appUrl || `http://localhost:${env.PORT || 3000}`;

    if (!path) return base;

    return `${base}${path.startsWith("/") ? "" : "/"}${path}`;

}

function getTransport() {

    const config = configFromEnv();
    const key = `${config.host}|${config.port}|${config.secure}|${config.user}|${config.pass}`;

    if (!transport || key !== transportKey) {

        // Erst hier laden: Vorlagen & Tests funktionieren auch ohne Mailserver
        const nodemailer = require("nodemailer");

        transport = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: config.user ? { user: config.user, pass: config.pass } : undefined
        });

        transportKey = key;

    }

    return transport;

}

// ----------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------

const EMAIL_PATTERN = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/**
 * Empfänger bereinigen: Einzeladresse oder Liste, ungültige Adressen
 * und Dubletten fliegen raus.
 */
function normalizeRecipients(to) {

    const list = Array.isArray(to) ? to : [to];

    const seen = new Set();
    const result = [];

    for (const entry of list) {

        if (typeof entry !== "string") continue;

        const address = entry.trim().toLowerCase();

        if (!EMAIL_PATTERN.test(address) || seen.has(address)) continue;

        seen.add(address);
        result.push(address);

    }

    return result;

}

// ----------------------------------------------------
// Versand
// ----------------------------------------------------

/**
 * E-Mail sofort verschicken.
 *
 * @param {object} message
 * @param {string|string[]} message.to
 * @param {string} message.subject
 * @param {string} [message.html]
 * @param {string} [message.text]
 * @param {string} [message.replyTo]
 * @returns {Promise<{sent: boolean, skipped?: string, messageId?: string, recipients: string[]}>}
 */
async function send(message) {

    const recipients = normalizeRecipients(message.to);

    if (!recipients.length) {
        return { sent: false, skipped: "Keine gültige Empfängeradresse", recipients };
    }

    if (!message.subject) {
        throw new Error("E-Mail ohne Betreff kann nicht verschickt werden.");
    }

    const config = configFromEnv();

    if (!isConfigured()) {

        console.log(`✉️  [nicht verschickt, SMTP_HOST/MAIL_FROM fehlen] An: ${recipients.join(", ")} | Betreff: ${message.subject}`);

        return { sent: false, skipped: "Mailversand nicht konfiguriert", recipients };

    }

    const info = await getTransport().sendMail({
        from: config.from,
        to: recipients.join(", "),
        replyTo: message.replyTo || config.replyTo || undefined,
        subject: message.subject,
        html: message.html,
        text: message.text
    });

    return { sent: true, messageId: info.messageId, recipients };

}

/**
 * Vorlage rendern und sofort verschicken.
 *
 * @param {string} template  Name der Vorlage, z. B. "ticket-created"
 * @param {string|string[]} to
 * @param {object} data      Werte für die Platzhalter
 */
async function sendTemplate(template, to, data = {}) {

    const emailTemplates = require("./emailTemplate.service");

    const rendered = await emailTemplates.render(template, data);

    return send({
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text
    });

}

/**
 * Vorlage im Hintergrund verschicken. Kehrt sofort zurück und wirft nie.
 */
function queueTemplate(template, to, data = {}) {

    queued++;

    const job = async () => {

        try {

            await sendTemplate(template, to, data);

        } catch (err) {

            console.error(`❌ E-Mail "${template}" an ${[].concat(to).join(", ")} fehlgeschlagen: ${err.message} – neuer Versuch in 30 Sekunden.`);

            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS).unref());

            try {
                await sendTemplate(template, to, data);
            } catch (retryErr) {
                console.error(`❌ E-Mail "${template}" endgültig fehlgeschlagen: ${retryErr.message}`);
            }

        } finally {

            queued--;

        }

    };

    queueTail = queueTail.then(job, job);

}

/**
 * Wartet, bis alle Mails der Warteschlange abgearbeitet sind (Tests,
 * sauberes Herunterfahren).
 */
async function flush() {

    await queueTail;

}

function pending() {

    return queued;

}

/**
 * Verbindung zum Mailserver prüfen (z. B. für eine Testseite oder ein Skript)
 */
async function verify() {

    if (!isConfigured()) {
        return { ok: false, message: "Mailversand nicht konfiguriert (SMTP_HOST / MAIL_FROM fehlen)." };
    }

    try {
        await getTransport().verify();
        return { ok: true, message: "Verbindung zum Mailserver erfolgreich." };
    } catch (err) {
        return { ok: false, message: err.message };
    }

}

module.exports = {
    configFromEnv,
    isConfigured,
    appUrl,
    normalizeRecipients,
    send,
    sendTemplate,
    queueTemplate,
    flush,
    pending,
    verify
};
