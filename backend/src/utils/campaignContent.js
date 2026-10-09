"use strict";

// ----------------------------------------------------
// Kampagnen-Inhalt: Platzhalter, Text → HTML, Prüfung
// ----------------------------------------------------
//
// Ohne Datenbank, damit alles in test/campaign.test.js prüfbar ist.
//
// Zwei Formate:
//   html  (Standard)  aus dem Editor; wird mit utils/htmlSanitizer.js
//                     bereinigt, Bilder sind eingebettet (data:…)
//   text  (ältere Kampagnen)  normaler Text:
//                     Leerzeile = neuer Absatz, https://… wird ein Link
//
// {{platzhalter}} werden je Empfänger ersetzt.

const PLACEHOLDERS = [
    { key: "anrede", label: "Briefanrede", example: "Sehr geehrter Herr Mustermann" },
    { key: "vorname", label: "Vorname", example: "Max" },
    { key: "nachname", label: "Nachname", example: "Mustermann" },
    { key: "firma", label: "Firma", example: "Muster GmbH" },
    { key: "position", label: "Position", example: "Geschäftsführer" },
    { key: "email", label: "E-Mail-Adresse", example: "max@muster.de" }
];

// Englische Schreibweisen funktionieren auch
const ALIASES = {
    firstName: "vorname",
    lastName: "nachname",
    company: "firma",
    salutation: "anrede"
};

const KEYS = PLACEHOLDERS.map((p) => p.key);

const sanitizer = require("./htmlSanitizer");

const FORMATS = ["html", "text"];

// Alles zwischen {{ und }} – so fallen auch Tippfehler wie {{#if firma}} auf
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

const MB = 1024 * 1024;

const LIMITS = {
    name: 150,
    description: 500,
    subject: 200,
    content: 20000,           // Textformat: Zeichen
    html: 6 * 1024 * 1024,    // HTML inkl. eingebetteter Bilder: Zeichen
    minContent: 10,
    images: 20,               // Bilder je Kampagne
    imageBytes: 2 * MB,       // je Bild
    imagesTotalBytes: 4 * MB  // alle Bilder zusammen (geht an jeden Empfänger)
};

function canonicalKey(key) {

    return ALIASES[key] || key;

}

/**
 * Alle Platzhalter-Namen in einem Text (ohne Dubletten, in Reihenfolge)
 */
function findPlaceholders(text) {

    const found = [];

    for (const match of String(text || "").matchAll(PLACEHOLDER_PATTERN)) {

        if (!found.includes(match[1])) found.push(match[1]);

    }

    return found;

}

function unknownPlaceholders(text) {

    return findPlaceholders(text).filter((key) => !KEYS.includes(canonicalKey(key)));

}

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

// Links im Rohtext; Anführungszeichen (auch „“ » «) und Satzzeichen am Ende gehören nicht dazu
const URL_PATTERN = /https?:\/\/[^\s<>"'“”„»«‘’]*[^\s<>"'“”„»«‘’.,;:!?)\]]/g;

/**
 * Eine Zeile: Text maskieren, Links anklickbar machen
 */
function lineToHtml(line) {

    let html = "";
    let last = 0;

    for (const match of line.matchAll(URL_PATTERN)) {

        const url = escapeHtml(match[0]);

        html += escapeHtml(line.slice(last, match.index));
        html += `<a href="${url}" style="color:#0d6efd;">${url}</a>`;

        last = match.index + match[0].length;

    }

    return html + escapeHtml(line.slice(last));

}

/**
 * Text in E-Mail-HTML umwandeln (Platzhalter bleiben stehen)
 */
function textToHtml(text) {

    const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();

    if (!normalized) return "";

    return normalized
        .split(/\n[ \t]*\n+/)
        .map((paragraph) => {

            const html = paragraph.trim().split("\n").map(lineToHtml).join("<br>\n");

            return `<p style="margin:0 0 14px;">${html}</p>`;

        })
        .join("\n");

}

/**
 * Platzhalter ersetzen.
 *
 * @param {string} text
 * @param {object} values  Werte je Platzhalter (vorname, firma, …)
 * @param {{html?: boolean}} options  html: Werte maskieren (für den Inhalt)
 */
function fillPlaceholders(text, values, { html = false } = {}) {

    return String(text || "").replace(PLACEHOLDER_PATTERN, (all, key) => {

        const value = values[canonicalKey(key)];

        if (value === null || value === undefined) return "";

        return html ? escapeHtml(value) : String(value);

    });

}

/**
 * Briefanrede in der Sie-Form
 */
function letterSalutation(contact) {

    const lastName = String((contact && contact.lastName) || "").trim();
    const firstName = String((contact && contact.firstName) || "").trim();

    if (contact && contact.salutation === "mr" && lastName) return `Sehr geehrter Herr ${lastName}`;
    if (contact && contact.salutation === "mrs" && lastName) return `Sehr geehrte Frau ${lastName}`;

    const fullName = `${firstName} ${lastName}`.trim();

    return fullName ? `Guten Tag ${fullName}` : "Guten Tag";

}

/**
 * Platzhalter-Werte für einen Kontakt
 *
 * @param {object} contact
 * @param {object|null} company  { companyName }
 */
function valuesFor(contact, company) {

    return {
        anrede: letterSalutation(contact),
        vorname: (contact && contact.firstName) || "",
        nachname: (contact && contact.lastName) || "",
        firma: (company && company.companyName) || "",
        position: (contact && contact.position) || "",
        email: (contact && contact.email) || ""
    };

}

/**
 * Beispielwerte für Vorschau und Test-Mail
 */
function sampleValues() {

    return Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.example]));

}

function formatOf(data) {

    return data && data.format === "html" ? "html" : "text";

}

/**
 * Inhalt als sicheres E-Mail-HTML (Platzhalter noch nicht ersetzt)
 */
function contentHtml(data) {

    return formatOf(data) === "html"
        ? sanitizer.sanitize(data.content)
        : textToHtml(data.content);

}

/**
 * Inhalt als reiner Text (für Länge und Platzhalter-Prüfung)
 */
function contentText(data) {

    // Übergroße Eingaben gar nicht erst bereinigen (validate() meldet sie)
    if (String((data && data.content) || "").length > LIMITS.html) return "";

    return formatOf(data) === "html"
        ? sanitizer.toPlainText(sanitizer.sanitize(data.content))
        : String(data.content || "").trim();

}

function megabytes(bytes) {

    return `${(bytes / MB).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;

}

/**
 * Formulardaten prüfen. Gibt eine Fehlermeldung (Deutsch) oder null zurück.
 */
function validate(data) {

    const name = String(data.name || "").trim();
    const subject = String(data.subject || "").trim();
    const isHtml = formatOf(data) === "html";
    const content = contentText(data);

    if (!name) return "Bitte einen Namen für die Kampagne angeben.";
    if (name.length > LIMITS.name) return `Der Name darf höchstens ${LIMITS.name} Zeichen lang sein.`;

    if (String(data.description || "").length > LIMITS.description) {
        return `Die Beschreibung darf höchstens ${LIMITS.description} Zeichen lang sein.`;
    }

    if (!subject) return "Bitte eine Betreffzeile angeben.";
    if (subject.length > LIMITS.subject) return `Die Betreffzeile darf höchstens ${LIMITS.subject} Zeichen lang sein.`;

    if (isHtml && String(data.content || "").length > LIMITS.html) {
        return `Die E-Mail ist zu groß (höchstens ${megabytes(LIMITS.html)} inklusive Bilder).`;
    }

    if (content.length < LIMITS.minContent) return `Bitte einen E-Mail-Text eingeben (mindestens ${LIMITS.minContent} Zeichen).`;

    if (isHtml) {

        const html = sanitizer.sanitize(data.content);
        const images = sanitizer.inlineImageStats(html);

        if (images.count > LIMITS.images) return `Höchstens ${LIMITS.images} Bilder je E-Mail.`;
        if (images.largest > LIMITS.imageBytes) return `Ein Bild ist zu groß (höchstens ${megabytes(LIMITS.imageBytes)} je Bild). Bitte verkleinern.`;
        if (images.bytes > LIMITS.imagesTotalBytes) return `Die Bilder sind zusammen zu groß (höchstens ${megabytes(LIMITS.imagesTotalBytes)}). Jeder Empfänger bekommt sie mit.`;

        // {{an<strong>rede</strong>}} – Platzhalter, die nur teilweise formatiert sind, würden nicht ersetzt
        const split = findPlaceholders(html).filter((key) => key.includes("<"));

        if (split.length) {

            const shown = split.map((key) => `{{${sanitizer.toPlainText(key)}}}`).join(", ");

            return `Platzhalter teilweise formatiert: ${shown}. Bitte den Platzhalter komplett markieren und die Formatierung einheitlich setzen oder entfernen.`;

        }

    } else if (content.length > LIMITS.content) {

        return `Der E-Mail-Text darf höchstens ${LIMITS.content} Zeichen lang sein.`;

    }

    const unknown = [...unknownPlaceholders(subject), ...unknownPlaceholders(content)];

    if (unknown.length) {

        const list = [...new Set(unknown)].map((key) => `{{${key}}}`).join(", ");
        const allowed = KEYS.map((key) => `{{${key}}}`).join(", ");

        return `Unbekannter Platzhalter: ${list}. Möglich sind ${allowed}.`;

    }

    return null;

}

module.exports = {
    PLACEHOLDERS,
    ALIASES,
    LIMITS,
    FORMATS,
    formatOf,
    contentHtml,
    contentText,
    findPlaceholders,
    unknownPlaceholders,
    escapeHtml,
    textToHtml,
    fillPlaceholders,
    letterSalutation,
    valuesFor,
    sampleValues,
    validate
};
