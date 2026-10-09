"use strict";

// ----------------------------------------------------
// HTML aus dem Kampagnen-Editor bereinigen
// ----------------------------------------------------
//
// Der Editor (Quill) liefert HTML. Bevor es gespeichert oder verschickt
// wird, baut sanitize() es nach einer festen Liste neu auf:
//
//   - erlaubte Tags: p, br, h1–h3, strong, em, u, s, ul, ol, li,
//     blockquote, a, img, span
//   - alles andere fällt weg (script/style/iframe … samt Inhalt,
//     unbekannte Tags ohne Inhalt-Verlust, div wird zu p)
//   - Attribute: nur href (http/https/mailto), Bild-src (eingebettetes
//     Bild oder https), alt und wenige Formatierungen (Farbe, Ausrichtung)
//   - jedes Tag bekommt Inline-Styles, weil E-Mail-Programme kein CSS
//     aus dem Kopf lesen
//
// Ohne Abhängigkeiten, damit es in test/htmlSanitizer.test.js ohne
// npm install geprüft werden kann.

// Darstellung in der E-Mail (so sieht es auch im Editor aus)
const TAG_STYLES = {
    p: "margin:0;",
    h1: "margin:16px 0 8px; font-size:24px; line-height:1.3;",
    h2: "margin:14px 0 6px; font-size:20px; line-height:1.3;",
    h3: "margin:12px 0 4px; font-size:17px; line-height:1.3;",
    ul: "margin:0; padding-left:24px;",
    ol: "margin:0; padding-left:24px;",
    li: "margin:0;",
    blockquote: "margin:8px 0; padding-left:12px; border-left:3px solid #dee2e6; color:#6c757d;",
    a: "color:#0d6efd;",
    img: "display:block; max-width:100%; height:auto; border:0; margin:8px 0;"
};

// Gleichbedeutende Tags
const RENAME = {
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
    div: "p",
    h4: "h3",
    h5: "h3",
    h6: "h3"
};

const ALLOWED = new Set(["p", "br", "h1", "h2", "h3", "strong", "em", "u", "s", "ul", "ol", "li", "blockquote", "a", "img", "span"]);

const VOID = new Set(["br", "img"]);

// Diese Tags fallen samt Inhalt weg
const DROP_WITH_CONTENT = new Set([
    "script", "style", "head", "title", "iframe", "object", "embed", "noscript",
    "template", "svg", "math", "textarea", "select", "button", "form", "frame", "frameset", "applet"
]);

// Ausrichtung ist bei Absätzen und Überschriften erlaubt
const ALIGNABLE = new Set(["p", "h1", "h2", "h3", "li"]);

const ALIGNMENTS = ["left", "center", "right", "justify"];

const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

// Jeder Treffer endet spätestens am nächsten "<" – so bleibt die Laufzeit
// auch bei kaputtem HTML (viele "<" ohne ">") linear.
const TOKEN_PATTERN = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^<>]*>|<\?[^<>]*>|<\/?([a-zA-Z][a-zA-Z0-9]*)\b((?:[^<>"']|"[^"<]*"|'[^'<]*')*)>/g;

const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function escapeAttribute(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

/**
 * Einfache Entitäten auflösen (für Attributwerte und reinen Text)
 */
function decodeEntities(value) {

    return String(value)
        .replace(/&#x([0-9a-f]+);/gi, (all, hex) => safeCodePoint(parseInt(hex, 16), all))
        .replace(/&#(\d+);/g, (all, dec) => safeCodePoint(parseInt(dec, 10), all))
        .replace(/&nbsp;/gi, " ")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&apos;/gi, "'")
        .replace(/&amp;/gi, "&");

}

function safeCodePoint(code, fallback) {

    try {
        return String.fromCodePoint(code);
    } catch {
        return fallback;
    }

}

/**
 * Text zwischen Tags: kein < oder > durchlassen, Entitäten bleiben gültig.
 * Geschützte Leerzeichen werden normale Leerzeichen (sonst bricht der
 * Text in manchen E-Mail-Programmen nicht um).
 */
function cleanText(text) {

    return text
        .replace(/&nbsp;| /gi, " ")
        .replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

// Nackte Adressen im (bereits maskierten) Text: &amp; gehört dazu, andere Entitäten nicht
const TEXT_URL_PATTERN = /https?:\/\/(?:[^\s<>"'&]|&amp;)+/g;

/**
 * https://… im Text anklickbar machen (nicht innerhalb eines Links)
 */
function linkify(escapedText) {

    return escapedText.replace(TEXT_URL_PATTERN, (found) => {

        const url = found.replace(/[.,;:!?)\]]+$/, "");
        const rest = found.slice(url.length);

        if (url.length < 12) return found;

        return `<a href="${url}" style="${TAG_STYLES.a}">${url}</a>${rest}`;

    });

}

function parseAttributes(source) {

    const attributes = {};

    for (const match of String(source || "").matchAll(ATTRIBUTE_PATTERN)) {

        const name = match[1].toLowerCase();
        const raw = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : (match[4] || ""));

        if (!(name in attributes)) attributes[name] = decodeEntities(raw);

    }

    return attributes;

}

function safeHref(value) {

    const href = String(value || "").trim();

    if (/[\u0000-\u001f\s]/.test(href)) return null;

    if (/^(https?:\/\/|mailto:)/i.test(href)) return href;

    return null;

}

function safeImageSource(value) {

    const src = String(value || "").trim();

    if (DATA_IMAGE_PATTERN.test(src)) return src.replace(/\s+/g, "");

    if (/^https:\/\/[^\s"'<>]+$/i.test(src)) return src;

    return null;

}

/**
 * Erlaubte Formatierungen aus style="…" und Quill-Klassen (ql-align-…)
 */
function formatting(tag, attributes) {

    const styles = [];

    if (ALIGNABLE.has(tag)) {

        const fromClass = String(attributes.class || "").match(/\bql-align-(left|center|right|justify)\b/);
        const fromStyle = String(attributes.style || "").match(/(?:^|;)\s*text-align\s*:\s*([a-z]+)/i);
        const align = (fromClass && fromClass[1]) || (fromStyle && fromStyle[1].toLowerCase());

        if (ALIGNMENTS.includes(align)) styles.push(`text-align:${align};`);

    }

    if (tag === "span" || tag === "strong" || tag === "em" || tag === "u" || tag === "s") {

        for (const property of ["color", "background-color"]) {

            const match = String(attributes.style || "").match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i"));

            if (match && COLOR_PATTERN.test(match[1].trim())) {
                styles.push(`${property}:${match[1].trim()};`);
            }

        }

    }

    return styles.join(" ");

}

/**
 * Öffnendes Tag neu aufbauen (oder null, wenn es wegfallen soll)
 */
function buildOpenTag(tag, attributes) {

    const style = [TAG_STYLES[tag], formatting(tag, attributes)].filter(Boolean).join(" ");
    const parts = [tag];

    if (tag === "a") {

        const href = safeHref(attributes.href);

        if (!href) return null;

        parts.push(`href="${escapeAttribute(href)}"`);

    }

    if (tag === "img") {

        const src = safeImageSource(attributes.src);

        if (!src) return null;

        parts.push(`src="${escapeAttribute(src)}"`);
        parts.push(`alt="${escapeAttribute(String(attributes.alt || "").slice(0, 200))}"`);

        const width = parseInt(attributes.width, 10);

        if (width > 0 && width <= 2000) parts.push(`width="${width}"`);

    }

    if (style) parts.push(`style="${escapeAttribute(style)}"`);

    return `<${parts.join(" ")}>`;

}

/**
 * HTML bereinigen.
 *
 * @param {string} html
 * @returns {string} sicheres HTML für E-Mail und Vorschau
 */
function sanitize(html) {

    const source = String(html || "");

    let output = "";
    let last = 0;
    let dropping = null;     // { tag, depth } während ein Tag samt Inhalt wegfällt
    const open = [];         // offene erlaubte Tags

    for (const match of source.matchAll(TOKEN_PATTERN)) {

        const text = source.slice(last, match.index);
        last = match.index + match[0].length;

        if (!dropping && text) output += open.includes("a") ? cleanText(text) : linkify(cleanText(text));

        // Kommentare, Doctype, CDATA, Verarbeitungsanweisungen
        if (!match[1]) continue;

        const isClosing = match[0].startsWith("</");
        const rawTag = match[1].toLowerCase();

        if (dropping) {

            if (rawTag === dropping.tag) {

                if (isClosing) dropping.depth--;
                else if (!/\/\s*>$/.test(match[0])) dropping.depth++;

                if (dropping.depth === 0) dropping = null;

            }

            continue;

        }

        if (DROP_WITH_CONTENT.has(rawTag)) {

            if (!isClosing && !/\/\s*>$/.test(match[0])) dropping = { tag: rawTag, depth: 1 };

            continue;

        }

        const tag = RENAME[rawTag] || rawTag;

        if (!ALLOWED.has(tag)) continue;

        if (isClosing) {

            if (VOID.has(tag)) continue;

            const index = open.lastIndexOf(tag);

            if (index === -1) continue;

            // Dazwischen offene Tags mit schließen
            while (open.length > index) {
                output += `</${open.pop()}>`;
            }

            continue;

        }

        const built = buildOpenTag(tag, parseAttributes(match[2]));

        // Link ohne erlaubtes Ziel: Text bleibt, Link fällt weg
        if (!built) continue;

        output += built;

        if (!VOID.has(tag)) open.push(tag);

    }

    if (!dropping) {

        const rest = cleanText(source.slice(last));

        output += open.includes("a") ? rest : linkify(rest);

    }

    while (open.length) {
        output += `</${open.pop()}>`;
    }

    // Leere Zeilen aus dem Editor (<p></p>) sichtbar lassen
    return output.replace(/<p( style="[^"]*")?><\/p>/g, "<p$1><br></p>").trim();

}

/**
 * Reiner Text aus (bereinigtem) HTML – zum Prüfen von Länge und Platzhaltern
 */
function toPlainText(html) {

    return decodeEntities(
        String(html || "")
            .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote)\b[^>]*>/gi, "\n")
            .replace(/<[^>]+>/g, "")
    )
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

}

/**
 * Eingebettete Bilder: Anzahl und Größe (Bytes nach dem Dekodieren)
 */
function inlineImageStats(html) {

    let count = 0;
    let bytes = 0;
    let largest = 0;

    for (const match of String(html || "").matchAll(/src="data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)"/gi)) {

        const size = Math.floor(match[1].length * 3 / 4);

        count++;
        bytes += size;
        largest = Math.max(largest, size);

    }

    return { count, bytes, largest };

}

/**
 * Eingebettete Bilder für den Versand als Anhang mit Content-ID
 * (cid:…) auslagern – so zeigen alle E-Mail-Programme sie an, ohne
 * dass ein Server aus dem Internet erreichbar sein muss.
 *
 * @param {string} html  bereinigtes HTML
 * @returns {{html: string, attachments: object[]}} Anhänge im Nodemailer-Format
 */
function extractInlineImages(html) {

    const attachments = [];
    const byData = new Map();

    const result = String(html || "").replace(
        /src="data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)"/gi,
        (all, type, data) => {

            let cid = byData.get(data);

            if (!cid) {

                const index = attachments.length + 1;
                const extension = type.toLowerCase() === "jpeg" ? "jpg" : type.toLowerCase();

                cid = `bild${index}@kampagne`;
                byData.set(data, cid);

                attachments.push({
                    filename: `bild${index}.${extension}`,
                    content: Buffer.from(data, "base64"),
                    contentType: `image/${extension === "jpg" ? "jpeg" : extension}`,
                    cid,
                    contentDisposition: "inline"
                });

            }

            return `src="cid:${cid}"`;

        }
    );

    return { html: result, attachments };

}

module.exports = {
    TAG_STYLES,
    sanitize,
    toPlainText,
    inlineImageStats,
    extractInlineImages,
    decodeEntities
};
