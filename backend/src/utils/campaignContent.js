"use strict";

// ----------------------------------------------------
// Kampagnen-Inhalt: Platzhalter, Text → HTML, Prüfung
// ----------------------------------------------------
//
// Ohne Datenbank, damit alles in test/campaign.test.js prüfbar ist.
//
// Der Inhalt einer Kampagne ist normaler Text:
//   - Leerzeile           = neuer Absatz
//   - einfacher Umbruch   = neue Zeile
//   - https://…           = wird automatisch ein Link
//   - {{platzhalter}}     = wird je Empfänger ersetzt
//
// Kein HTML im Editor: so kann nichts das Layout der E-Mail zerstören,
// und die Vorschau zeigt genau das, was der Kunde bekommt.

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

// Alles zwischen {{ und }} – so fallen auch Tippfehler wie {{#if firma}} auf
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

const LIMITS = {
    name: 150,
    description: 500,
    subject: 200,
    content: 20000,
    minContent: 10
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

/**
 * Formulardaten prüfen. Gibt eine Fehlermeldung (Deutsch) oder null zurück.
 */
function validate(data) {

    const name = String(data.name || "").trim();
    const subject = String(data.subject || "").trim();
    const content = String(data.content || "").trim();

    if (!name) return "Bitte einen Namen für die Kampagne angeben.";
    if (name.length > LIMITS.name) return `Der Name darf höchstens ${LIMITS.name} Zeichen lang sein.`;

    if (String(data.description || "").length > LIMITS.description) {
        return `Die Beschreibung darf höchstens ${LIMITS.description} Zeichen lang sein.`;
    }

    if (!subject) return "Bitte eine Betreffzeile angeben.";
    if (subject.length > LIMITS.subject) return `Die Betreffzeile darf höchstens ${LIMITS.subject} Zeichen lang sein.`;

    if (content.length < LIMITS.minContent) return `Bitte einen E-Mail-Text eingeben (mindestens ${LIMITS.minContent} Zeichen).`;
    if (content.length > LIMITS.content) return `Der E-Mail-Text darf höchstens ${LIMITS.content} Zeichen lang sein.`;

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
