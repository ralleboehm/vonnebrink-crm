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
//
// Jede Vorlagen-Mail landet mit ihrem endgültigen Ergebnis im
// E-Mail-Protokoll (CRM: Benutzermenü → E-Mail-Protokoll, nur Admins).

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

const MAX_ATTEMPTS = 2;

function recipientsOf(to) {

    return [].concat(to || []).filter((v) => typeof v === "string");

}

function emailLog() {
    return require("./emailLog.service");
}

/**
 * Vorlage rendern und verschicken (ohne Protokoll).
 * Gibt das Versandergebnis und den Betreff zurück.
 */
async function deliverTemplate(template, to, data) {

    const emailTemplates = require("./emailTemplate.service");

    const rendered = await emailTemplates.render(template, data);

    const result = await send({
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text
    });

    return { ...result, subject: rendered.subject };

}

/**
 * Ergebnis ins E-Mail-Protokoll schreiben
 */
async function recordResult({ template, to, subject, result, error, attempts }) {

    let status = "sent";

    if (error) status = "failed";
    else if (!result.sent) status = "skipped";

    await emailLog().record({
        template,
        to: result && result.recipients && result.recipients.length ? result.recipients : recipientsOf(to),
        subject,
        status,
        error: error ? error.message : (result && result.skipped) || null,
        attempts,
        messageId: result && result.messageId
    });

}

/**
 * Vorlage rendern und sofort verschicken (wartet auf den Mailserver).
 * Das Ergebnis landet im E-Mail-Protokoll.
 *
 * @param {string} template  Name der Vorlage, z. B. "ticket-created"
 * @param {string|string[]} to
 * @param {object} data      Werte für die Platzhalter
 */
async function sendTemplate(template, to, data = {}) {

    try {

        const result = await deliverTemplate(template, to, data);

        await recordResult({ template, to, subject: result.subject, result, attempts: 1 });

        return result;

    } catch (err) {

        await recordResult({ template, to, subject: "(Vorlage nicht erzeugt)", result: null, error: err, attempts: 1 });

        throw err;

    }

}

/**
 * Vorlage im Hintergrund verschicken. Kehrt sofort zurück und wirft nie.
 * Bei einem Fehler gibt es nach 30 Sekunden einen zweiten Versuch; ins
 * Protokoll kommt das endgültige Ergebnis.
 */
function queueTemplate(template, to, data = {}) {

    queued++;

    const job = async () => {

        try {

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {

                try {

                    const result = await deliverTemplate(template, to, data);

                    await recordResult({ template, to, subject: result.subject, result, attempts: attempt });

                    return;

                } catch (err) {

                    if (attempt < MAX_ATTEMPTS) {

                        console.error(`❌ E-Mail "${template}" an ${recipientsOf(to).join(", ")} fehlgeschlagen: ${err.message} – neuer Versuch in 30 Sekunden.`);

                        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS).unref());

                    } else {

                        console.error(`❌ E-Mail "${template}" an ${recipientsOf(to).join(", ")} endgültig fehlgeschlagen: ${err.message}`);

                        await recordResult({ template, to, subject: "(Vorlage nicht erzeugt)", result: null, error: err, attempts: attempt });

                    }

                }

            }

        } finally {

            queued--;

        }

    };

    queueTail = queueTail.then(job, job);

}

/**
 * Test-Mail an eine Adresse (für die Seite E-Mail-Protokoll)
 */
async function sendTestEmail(to) {

    return sendTemplate("ticket-created", to, {
        customerName: "Test-Empfänger",
        ticketNumber: "TIC-TEST",
        subject: "Test-Mail aus dem Vonnebrink CRM",
        company: "Testfirma",
        priority: "Normal"
    });

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
    MAX_ATTEMPTS,
    sendTestEmail,
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
