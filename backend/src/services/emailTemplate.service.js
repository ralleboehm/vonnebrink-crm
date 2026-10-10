"use strict";

// ----------------------------------------------------
// E-Mail-Vorlagen
// ----------------------------------------------------
//
// Vorlagen liegen in src/email-templates/<name>.html und beginnen mit
// einem Kopf, in dem der Betreff steht:
//
//   ---
//   subject: Ihr Ticket {{ticketNumber}} ist bei uns eingegangen
//   ---
//   <p>Guten Tag {{customerName}},</p>
//
// Platzhalter:
//   {{name}}              Wert, HTML-sicher maskiert
//   {{ticket.subject}}    Punkt-Schreibweise für verschachtelte Werte
//   {{#if agent}} … {{/if}}   Abschnitt nur, wenn der Wert gefüllt ist
//
// Jede Vorlage wird in _layout.html eingebettet (Kopf, Fußzeile).
// Die Textfassung der E-Mail wird automatisch aus dem HTML erzeugt.
//
// Immer verfügbar: {{brandName}}, {{year}}, {{appUrl}}, {{portalLink}}
// (brandName aus MAIL_BRAND_NAME, Standard "Vonnebrink IT Operations")
//
// Layout: Logo als eingebettetes Bild ({{logoSrc}} = cid:logo@vonnebrink,
// der E-Mail-Service hängt die Datei an), Link zur Webseite aus
// MAIL_BRAND_URL (Standard https://vonnebrink.com), {{footerNote}} unten.

const fs = require("fs/promises");
const path = require("path");

const TEMPLATE_DIR = path.join(__dirname, "../email-templates");
const LAYOUT = "_layout";
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const cache = new Map();

// Logo im E-Mail-Kopf: eingebettet (siehe email.service.js), im Browser die Datei
const LOGO_CID = "logo@vonnebrink";
const LOGO_SRC = `cid:${LOGO_CID}`;
const LOGO_FILE = path.join(__dirname, "../public/images/logo-wordmark.png");
const LOGO_URL = "/images/logo-wordmark.png";

/**
 * Für die Vorschau im Browser: eingebettetes Logo durch die Bilddatei ersetzen
 */
function forBrowser(html) {

    return String(html || "").split(`src="${LOGO_SRC}"`).join(`src="${LOGO_URL}"`);

}

// ----------------------------------------------------
// Hilfsfunktionen (ohne Dateisystem, gut testbar)
// ----------------------------------------------------

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

function lookup(data, key) {

    return key.split(".").reduce(
        (value, part) => (value === null || value === undefined ? undefined : value[part]),
        data
    );

}

function isFilled(value) {

    if (value === null || value === undefined || value === false) return false;
    if (Array.isArray(value)) return value.length > 0;

    return String(value).trim() !== "";

}

/**
 * Kopf ("---\nsubject: …\n---") vom Inhalt trennen
 */
function parse(source) {

    const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);

    if (!match) {
        return { meta: {}, body: source };
    }

    const meta = {};

    for (const line of match[1].split(/\r?\n/)) {

        const index = line.indexOf(":");

        if (index > 0) {
            meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
        }

    }

    return { meta, body: match[2] };

}

/**
 * Platzhalter ersetzen.
 *
 * @param {string} template
 * @param {object} data
 * @param {{escape?: boolean, raw?: object}} options
 *        escape: Werte HTML-maskieren (für HTML; für Betreff aus)
 *        raw:    Werte, die NICHT maskiert werden (nur intern, z. B. "content")
 */
function fill(template, data, options = {}) {

    const escape = options.escape !== false;
    const raw = options.raw || {};

    // {{#if name}} … {{/if}} (nicht verschachtelt)
    let result = template.replace(
        /\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (all, key, inner) => (isFilled(lookup(data, key)) ? inner : "")
    );

    result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (all, key) => {

        if (Object.prototype.hasOwnProperty.call(raw, key)) {
            return raw[key];
        }

        const value = lookup(data, key);

        if (value === null || value === undefined) return "";

        return escape ? escapeHtml(value) : String(value);

    });

    return result;

}

/**
 * Einfache Textfassung aus HTML
 */
function htmlToText(html) {

    return html
        .replace(/<(style|head|title)[\s\S]*?<\/\1>/gi, "")
        // Zeilenumbrüche aus dem Vorlagen-Quelltext zwischen Tags ignorieren
        .replace(/>\s*\r?\n\s*</g, "><")
        .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (all, href, label) => {
            const text = label.replace(/<[^>]+>/g, "").trim();
            return text && text !== href ? `${text} (${href})` : href;
        })
        .replace(/<br\s*\/?>[ \t]*(\r?\n)?/gi, "\n")
        .replace(/<\/(p|div|h[1-6]|table|ul|ol)>/gi, "\n\n")
        .replace(/<\/(li|tr)>/gi, "\n")
        .replace(/<li[^>]*>/gi, "- ")
        .replace(/<\/t[dh]>/gi, "  ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

}

/**
 * Standardwerte für jede Vorlage
 */
function defaults(env = process.env) {

    const { appUrl, portalUrl } = require("./email.service");

    const brandUrl = (env.MAIL_BRAND_URL || "https://vonnebrink.com").trim().replace(/\/+$/, "");

    return {
        brandName: (env.MAIL_BRAND_NAME || "Vonnebrink IT Operations").trim(),
        brandUrl,
        brandUrlLabel: brandUrl.replace(/^https?:\/\/(www\.)?/, ""),
        logoSrc: LOGO_SRC,
        footerNote: "Diese E-Mail wurde automatisch erstellt.",
        year: new Date().getFullYear(),
        appUrl: appUrl("", env),
        portalLink: portalUrl("/portal", env)
    };

}

// ----------------------------------------------------
// Dateien
// ----------------------------------------------------

async function load(name) {

    if (!NAME_PATTERN.test(name) && name !== LAYOUT) {
        throw new Error(`Ungültiger Vorlagenname "${name}".`);
    }

    const useCache = process.env.NODE_ENV === "production";

    if (useCache && cache.has(name)) {
        return cache.get(name);
    }

    let source;

    try {
        source = await fs.readFile(path.join(TEMPLATE_DIR, `${name}.html`), "utf8");
    } catch (err) {
        if (err.code === "ENOENT") {
            throw new Error(`E-Mail-Vorlage "${name}" nicht gefunden.`);
        }
        throw err;
    }

    const parsed = parse(source);

    if (useCache) cache.set(name, parsed);

    return parsed;

}

/**
 * Vorlage rendern.
 *
 * @param {string} name   z. B. "ticket-created"
 * @param {object} data   Werte für die Platzhalter
 * @returns {Promise<{subject: string, html: string, text: string}>}
 */
async function render(name, data = {}) {

    const values = { ...defaults(), ...data };

    const [template, layout] = await Promise.all([load(name), load(LAYOUT)]);

    if (!template.meta.subject) {
        throw new Error(`E-Mail-Vorlage "${name}" hat keinen Betreff (subject:).`);
    }

    const subject = fill(template.meta.subject, values, { escape: false })
        .replace(/[\r\n]+/g, " ")
        .trim();

    const content = fill(template.body, values);

    const html = fill(layout.body, { ...values, emailSubject: subject }, { raw: { content } });

    return {
        subject,
        html,
        text: htmlToText(content)
    };

}

/**
 * Fertigen HTML-Inhalt (z. B. einer Kampagne) in das Layout einbetten.
 * Der Inhalt wird NICHT mehr verändert – er muss bereits sicher sein.
 *
 * @param {string} subject      fertiger Betreff
 * @param {string} contentHtml  fertiger, maskierter HTML-Inhalt
 * @param {object} [data]       weitere Werte für das Layout
 * @returns {Promise<{subject: string, html: string, text: string}>}
 */
async function renderWithLayout(subject, contentHtml, data = {}) {

    const values = { ...defaults(), ...data };
    const cleanSubject = String(subject || "").replace(/[\r\n]+/g, " ").trim();

    const layout = await load(LAYOUT);

    const html = fill(layout.body, { ...values, emailSubject: cleanSubject }, { raw: { content: contentHtml } });

    return {
        subject: cleanSubject,
        html,
        text: htmlToText(contentHtml)
    };

}

/**
 * Namen aller vorhandenen Vorlagen
 */
async function list() {

    const files = await fs.readdir(TEMPLATE_DIR);

    return files
        .filter((file) => file.endsWith(".html") && !file.startsWith("_"))
        .map((file) => file.replace(/\.html$/, ""))
        .sort();

}

module.exports = {
    TEMPLATE_DIR,
    escapeHtml,
    parse,
    fill,
    htmlToText,
    render,
    renderWithLayout,
    list,
    forBrowser,
    LOGO_CID,
    LOGO_SRC,
    LOGO_FILE
};
