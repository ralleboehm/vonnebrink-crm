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

const fs = require("fs/promises");
const path = require("path");

const TEMPLATE_DIR = path.join(__dirname, "../email-templates");
const LAYOUT = "_layout";
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const cache = new Map();

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

    const { appUrl } = require("./email.service");

    return {
        brandName: (env.MAIL_BRAND_NAME || "Vonnebrink IT Operations").trim(),
        year: new Date().getFullYear(),
        appUrl: appUrl("", env),
        portalLink: appUrl("/portal", env)
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
    list
};
