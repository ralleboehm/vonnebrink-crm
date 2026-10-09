"use strict";

// ----------------------------------------------------
// E-Mail-Kampagnen
// ----------------------------------------------------
//
// findAll / findById / create / update / delete / validate wie in
// ARCHITECTURE.md, dazu:
//
//   audience(tags)        erreichbare Empfänger (Marketing-Einwilligung)
//   render(campaign, row) E-Mail für einen Empfänger (oder Beispielwerte)
//   sendTest(id, to)      Test-Mail mit Beispielwerten
//   startSending(id, by)  Empfänger festschreiben, Versand im Hintergrund
//   resumeInterrupted()   beim Serverstart: offene Versände fortsetzen
//
// Der Versand läuft nacheinander (eine Mail nach der anderen), jede Mail
// landet im E-Mail-Protokoll. Vor jeder Mail wird geprüft, ob der Kontakt
// noch erreichbar ist – wer sich zwischendurch abmeldet, bekommt nichts.

const mongoose = require("mongoose");

const Campaign = require("../models/campaign.model");
const Contact = require("../models/contact.model");
const Company = require("../models/company.model");

const counterService = require("./counter.service");
const marketingService = require("./marketing.service");
const emailService = require("./email.service");
const emailTemplates = require("./emailTemplate.service");
const emailLog = require("./emailLog.service");
const { escapeRegex } = require("./search.service");

const content = require("../utils/campaignContent");
const sanitizer = require("../utils/htmlSanitizer");

// Kurze Pause zwischen zwei Mails (schont den Mailserver)
const SEND_DELAY_MS = 200;

// Laufende Versände (Kampagnen-ID → Promise)
const running = new Map();

function httpError(message, status) {

    const error = new Error(message);
    error.status = status;

    return error;

}

function cleanTags(input) {

    const list = Array.isArray(input) ? input : (input ? [input] : []);
    const seen = new Set();
    const tags = [];

    for (const entry of list) {

        const tag = String(entry || "").trim().slice(0, 40);
        const key = tag.toLowerCase();

        if (!tag || seen.has(key)) continue;

        seen.add(key);
        tags.push(tag);

    }

    return tags;

}

/**
 * Formulardaten in Kampagnen-Felder umwandeln
 */
function fromForm(body = {}) {

    // Der Editor schickt HTML; "text" nur für ältere Kampagnen
    const format = body.format === "text" ? "text" : "html";
    const raw = String(body.content || "").replace(/\r\n?/g, "\n");

    return {
        name: String(body.name || "").trim(),
        description: String(body.description || "").trim(),
        subject: String(body.subject || "").replace(/[\r\n]+/g, " ").trim(),
        format,
        // Übergroßes nicht bereinigen – validate() lehnt es ab
        content: format === "html" && raw.length <= content.LIMITS.html ? sanitizer.sanitize(raw) : raw,
        audience: { tags: cleanTags(body.tags) }
    };

}

function validate(data) {

    return content.validate(data);

}

/**
 * Werte für das Formular. Ältere Text-Kampagnen werden für den Editor
 * in HTML umgewandelt (beim Speichern sind sie dann HTML).
 */
function forEditor(campaign) {

    const data = typeof campaign.toObject === "function" ? campaign.toObject() : { ...campaign };

    return { ...data, format: "html", content: content.contentHtml(campaign) };

}

// ----------------------------------------------------
// Lesen
// ----------------------------------------------------

/**
 * Liste (ohne die Empfängerliste)
 *
 * @param {{status?: string, search?: string}} filters
 */
async function findAll(filters = {}) {

    const query = { isDeleted: false };

    if (Campaign.STATUSES.includes(filters.status)) {
        query.status = filters.status;
    }

    if (filters.search) {

        const regex = { $regex: escapeRegex(filters.search), $options: "i" };

        query.$or = [{ name: regex }, { subject: regex }, { campaignNumber: regex }];

    }

    return Campaign.find(query, "-deliveries -content").sort({ createdAt: -1 }).lean();

}

async function findById(id) {

    if (!mongoose.isValidObjectId(id)) return null;

    return Campaign.findOne({ _id: id, isDeleted: false });

}

// ----------------------------------------------------
// Schreiben
// ----------------------------------------------------

async function create(data, { by } = {}) {

    const message = validate(data);

    if (message) throw httpError(message, 422);

    return Campaign.create({
        ...data,
        campaignNumber: await counterService.next("campaign", "KAM"),
        status: "draft",
        createdBy: by || null,
        updatedBy: by || null
    });

}

async function update(id, data, { by } = {}) {

    const campaign = await findById(id);

    if (!campaign) throw httpError("Kampagne nicht gefunden.", 404);

    if (campaign.status !== "draft") {
        throw httpError("Diese Kampagne wurde bereits versendet und kann nicht mehr geändert werden. Tipp: duplizieren.", 409);
    }

    const message = validate(data);

    if (message) throw httpError(message, 422);

    const updated = await Campaign.findOneAndUpdate(
        { _id: campaign._id, status: "draft", isDeleted: false },
        { $set: { ...data, updatedBy: by || null } },
        { returnDocument: "after", runValidators: true }
    );

    if (!updated) {
        throw httpError("Die Kampagne wird gerade versendet und kann nicht mehr geändert werden.", 409);
    }

    return updated;

}

/**
 * Soft Delete (nicht während des Versands)
 */
async function remove(id) {

    const campaign = await findById(id);

    if (!campaign) return null;

    if (campaign.status === "sending") {
        throw httpError("Die Kampagne wird gerade versendet und kann erst danach gelöscht werden.", 409);
    }

    campaign.isDeleted = true;

    return campaign.save();

}

/**
 * Neuer Entwurf mit demselben Inhalt
 */
async function duplicate(id, { by } = {}) {

    const campaign = await findById(id);

    if (!campaign) throw httpError("Kampagne nicht gefunden.", 404);

    return create({
        name: `Kopie von ${campaign.name}`.slice(0, content.LIMITS.name),
        description: campaign.description,
        subject: campaign.subject,
        format: content.formatOf(campaign),
        content: campaign.content,
        audience: { tags: [...campaign.audience.tags] }
    }, { by });

}

// ----------------------------------------------------
// Empfänger
// ----------------------------------------------------

/**
 * Erreichbare Empfänger für die gewählten Gruppen.
 * Ohne Gruppen: alle erreichbaren Kontakte.
 *
 * @param {string[]} tags
 * @returns {Promise<object[]>} Zeilen aus marketingService.listContacts()
 */
async function audience(tags = []) {

    const rows = await marketingService.listContacts({ onlyEligible: true });

    const wanted = new Set(cleanTags(tags).map((tag) => tag.toLowerCase()));

    if (!wanted.size) return rows;

    return rows.filter((row) =>
        ((row.company && row.company.tags) || []).some((tag) => wanted.has(String(tag).toLowerCase()))
    );

}

// ----------------------------------------------------
// E-Mail erzeugen
// ----------------------------------------------------

function unsubscribeBlock(url) {

    const link = url
        ? `<a href="${content.escapeHtml(url)}" style="color:#6c757d;">hier abmelden</a>`
        : `<span style="text-decoration:underline;">hier abmelden</span>`;

    return `<p style="margin:24px 0 0; padding-top:12px; border-top:1px solid #e5e7eb; font-size:12px; color:#6c757d;">`
        + `Sie erhalten diese E-Mail, weil Sie Informationen von uns erhalten möchten bzw. Kunde bei uns sind. `
        + `Wenn Sie keine Informations-E-Mails mehr wünschen, können Sie sich jederzeit ${link}.`
        + `</p>`;

}

/**
 * E-Mail für einen Empfänger erzeugen.
 *
 * @param {{subject: string, content: string}} campaign
 * @param {object|null} row  { contact, company } oder null für Beispielwerte
 * @returns {Promise<{subject: string, html: string, text: string, unsubscribeUrl: string|null}>}
 */
async function render(campaign, row = null) {

    const values = row ? content.valuesFor(row.contact, row.company) : content.sampleValues();
    const unsubscribeUrl = row ? marketingService.unsubscribeUrl(row.contact) : null;

    const subject = content.fillPlaceholders(campaign.subject, values);
    const body = content.fillPlaceholders(content.contentHtml(campaign), values, { html: true });

    // Kampagnen sind persönliche Mails – ohne "automatisch erstellt" im Fuß
    const rendered = await emailTemplates.renderWithLayout(subject, body + unsubscribeBlock(unsubscribeUrl), { footerNote: "" });

    return { ...rendered, unsubscribeUrl };

}

/**
 * Eingebettete Bilder als Anhänge mit Content-ID (für den Versand)
 */
function withInlineImages(rendered) {

    const { html, attachments } = sanitizer.extractInlineImages(rendered.html);

    return { html, attachments };

}

/**
 * Test-Mail mit Beispielwerten an eine Adresse
 */
async function sendTest(id, to) {

    const campaign = await findById(id);

    if (!campaign) throw httpError("Kampagne nicht gefunden.", 404);

    const address = String(to || "").trim();

    if (!emailService.normalizeRecipients(address).length) {
        throw httpError("Bitte eine gültige E-Mail-Adresse für die Test-Mail angeben.", 422);
    }

    const rendered = await render(campaign);
    const subject = `[Test] ${rendered.subject}`;

    try {

        const { html, attachments } = withInlineImages(rendered);

        const result = await emailService.send({ to: address, subject, html, text: rendered.text, attachments });

        await emailLog.record({
            template: `kampagne-test ${campaign.campaignNumber}`,
            to: result.recipients,
            subject,
            status: result.sent ? "sent" : "skipped",
            error: result.skipped || null
        });

        return result;

    } catch (err) {

        await emailLog.record({
            template: `kampagne-test ${campaign.campaignNumber}`,
            to: [address],
            subject,
            status: "failed",
            error: err.message
        });

        throw httpError(`Test-Mail fehlgeschlagen: ${err.message}`, 502);

    }

}

// ----------------------------------------------------
// Versand
// ----------------------------------------------------

/**
 * Versand starten: Empfänger festschreiben und im Hintergrund verschicken.
 *
 * @returns {Promise<{campaign: object, count: number}>}
 */
async function startSending(id, { by } = {}) {

    const campaign = await findById(id);

    if (!campaign) throw httpError("Kampagne nicht gefunden.", 404);

    if (campaign.status !== "draft") {
        throw httpError("Diese Kampagne wurde bereits versendet.", 409);
    }

    if (!emailService.isConfigured()) {
        throw httpError("Der Mailversand ist nicht eingerichtet (SMTP_HOST und MAIL_FROM in der .env). Es wurde nichts verschickt.", 409);
    }

    // Ohne erreichbaren Abmeldelink keine Kampagne (Test-Mails gehen trotzdem)
    const urlProblem = emailService.publicAppUrlProblem();

    if (urlProblem) {
        throw httpError(`${urlProblem} Es wurde nichts verschickt. Test-Mails an Sie selbst funktionieren trotzdem.`, 409);
    }

    const message = validate(campaign);

    if (message) throw httpError(message, 422);

    const rows = await audience(campaign.audience.tags);

    if (!rows.length) {
        throw httpError("Für diese Zielgruppe gibt es keine erreichbaren Empfänger (Einwilligung fehlt oder Gruppe leer).", 422);
    }

    const deliveries = rows.map((row) => ({
        contact: row.contact._id,
        email: row.contact.email,
        name: `${row.contact.firstName || ""} ${row.contact.lastName || ""}`.trim(),
        companyName: row.company ? row.company.companyName : "",
        status: "pending"
    }));

    // Nur EIN Start möglich, auch bei doppeltem Klick
    const started = await Campaign.findOneAndUpdate(
        { _id: campaign._id, status: "draft", isDeleted: false },
        {
            $set: {
                status: "sending",
                deliveries,
                stats: { total: deliveries.length, sent: 0, failed: 0, skipped: 0 },
                startedAt: new Date(),
                sentBy: by || null
            }
        },
        { returnDocument: "after" }
    );

    if (!started) {
        throw httpError("Diese Kampagne wird bereits versendet.", 409);
    }

    processInBackground(started._id);

    return { campaign: started, count: deliveries.length };

}

function wait(ms) {

    return new Promise((resolve) => setTimeout(resolve, ms).unref());

}

async function finishDelivery(campaignId, contactId, status, error) {

    await Campaign.updateOne(
        { _id: campaignId, deliveries: { $elemMatch: { contact: contactId, status: "pending" } } },
        {
            $set: {
                "deliveries.$.status": status,
                "deliveries.$.error": error ? String(error).slice(0, 1000) : null,
                "deliveries.$.sentAt": new Date()
            },
            $inc: { [`stats.${status}`]: 1 }
        }
    );

}

/**
 * Eine Mail verschicken. Wirft nie; das Ergebnis landet in der Kampagne
 * und im E-Mail-Protokoll.
 */
async function deliverOne(campaign, delivery) {

    const template = `kampagne ${campaign.campaignNumber}`;

    try {

        const contact = await Contact.findById(delivery.contact).lean();
        const company = contact ? await Company.findById(contact.company, "companyName status tags isDeleted").lean() : null;

        const reason = company && company.isDeleted
            ? "Firma archiviert"
            : marketingService.ineligibleReason(contact, company);

        if (reason) {

            await finishDelivery(campaign._id, delivery.contact, "skipped", `Nicht mehr erreichbar: ${reason}`);

            return;

        }

        const rendered = await render(campaign, { contact, company });

        const headers = rendered.unsubscribeUrl
            ? {
                "List-Unsubscribe": `<${rendered.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
            }
            : undefined;

        const { html, attachments } = withInlineImages(rendered);

        const result = await emailService.send({
            to: contact.email,
            subject: rendered.subject,
            html,
            text: rendered.text,
            headers,
            attachments
        });

        const status = result.sent ? "sent" : "skipped";

        await finishDelivery(campaign._id, delivery.contact, status, result.skipped || null);

        await emailLog.record({
            template,
            to: result.recipients,
            subject: rendered.subject,
            status,
            error: result.skipped || null,
            messageId: result.messageId
        });

    } catch (err) {

        console.error(`❌ Kampagne ${campaign.campaignNumber}: Mail an ${delivery.email} fehlgeschlagen: ${err.message}`);

        try {

            await finishDelivery(campaign._id, delivery.contact, "failed", err.message);

            await emailLog.record({
                template,
                to: [delivery.email],
                subject: campaign.subject,
                status: "failed",
                error: err.message
            });

        } catch (inner) {

            console.error(`❌ Kampagne ${campaign.campaignNumber}: Ergebnis nicht gespeichert: ${inner.message}`);

        }

    }

}

/**
 * Alle offenen Empfänger einer Kampagne abarbeiten
 */
async function processDeliveries(campaignId) {

    const campaign = await Campaign.findById(campaignId);

    if (!campaign || campaign.status !== "sending") return;

    const pending = campaign.deliveries.filter((d) => d.status === "pending");

    console.log(`✉️  Kampagne ${campaign.campaignNumber}: ${pending.length} E-Mail(s) werden verschickt …`);

    for (const [index, delivery] of pending.entries()) {

        await deliverOne(campaign, delivery);

        if (index < pending.length - 1) await wait(SEND_DELAY_MS);

    }

    const done = await Campaign.findOneAndUpdate(
        { _id: campaignId, status: "sending" },
        { $set: { status: "sent", sentAt: new Date() } },
        { returnDocument: "after" }
    );

    if (done) {
        console.log(`✅ Kampagne ${done.campaignNumber} versendet: ${done.stats.sent} verschickt, ${done.stats.failed} fehlgeschlagen, ${done.stats.skipped} übersprungen.`);
    }

}

function processInBackground(campaignId) {

    const key = String(campaignId);

    if (running.has(key)) return running.get(key);

    const job = processDeliveries(campaignId)
        .catch((err) => console.error(`❌ Kampagnen-Versand abgebrochen (${key}): ${err.message}`))
        .finally(() => running.delete(key));

    running.set(key, job);

    return job;

}

/**
 * Beim Serverstart: Versände fortsetzen, die durch einen Neustart
 * unterbrochen wurden. Bereits verschickte Mails gehen nicht noch einmal raus.
 */
async function resumeInterrupted() {

    const open = await Campaign.find({ status: "sending", isDeleted: false }, "_id campaignNumber").lean();

    for (const campaign of open) {

        console.log(`↻ Kampagne ${campaign.campaignNumber}: unterbrochener Versand wird fortgesetzt.`);

        processInBackground(campaign._id);

    }

    return open.length;

}

/**
 * Wartet, bis der Versand einer (oder aller) Kampagnen fertig ist (Tests)
 */
async function waitForSending(id) {

    if (id) {
        await running.get(String(id));
        return;
    }

    await Promise.all([...running.values()]);

}

module.exports = {
    STATUSES: Campaign.STATUSES,
    DELIVERY_STATUSES: Campaign.DELIVERY_STATUSES,
    PLACEHOLDERS: content.PLACEHOLDERS,
    fromForm,
    validate,
    forEditor,
    findAll,
    findById,
    create,
    update,
    delete: remove,
    duplicate,
    audience,
    render,
    sendTest,
    startSending,
    resumeInterrupted,
    waitForSending
};
