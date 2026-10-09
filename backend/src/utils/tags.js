"use strict";

// ----------------------------------------------------
// Schlagwörter (Branche / Gruppen) für Firmen
// ----------------------------------------------------
//
// Grundlage für Marketing & Kampagnen: Firmen bekommen beliebig viele
// Schlagwörter, z. B. "Arztpraxis", "Newsletter", "Lampertheim".
//
// Eingabe als Text ("Arztpraxis, Newsletter") oder Liste. Trennzeichen:
// Komma, Semikolon, senkrechter Strich, Zeilenumbruch.

const MAX_TAGS = 20;
const MAX_LENGTH = 40;

// Vorschläge im Formular (eigene Begriffe sind jederzeit möglich)
const SUGGESTED = [
    "Arztpraxis",
    "Zahnarztpraxis",
    "Apotheke",
    "Pflege",
    "Steuerberatung",
    "Rechtsanwalt",
    "Handwerk",
    "Bau",
    "Einzelhandel",
    "Gastronomie",
    "Hotel",
    "Kfz / Autohaus",
    "Immobilien",
    "Industrie",
    "Logistik",
    "Dienstleistung",
    "Verein",
    "Öffentliche Einrichtung",
    "Newsletter"
];

/**
 * Text oder Liste -> bereinigte, eindeutige Schlagwörter
 */
function normalizeTags(input) {

    if (input === undefined || input === null) return [];

    const parts = Array.isArray(input)
        ? input.flatMap((item) => String(item ?? "").split(/[,;|\n]/))
        : String(input).split(/[,;|\n]/);

    const seen = new Set();
    const tags = [];

    for (const part of parts) {

        const tag = part
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^#/, "")
            .trim()
            .slice(0, MAX_LENGTH);

        const key = tag.toLowerCase();

        if (!tag || seen.has(key)) continue;

        seen.add(key);
        tags.push(tag);

        if (tags.length === MAX_TAGS) break;

    }

    return tags;

}

/**
 * Für Eingabefelder: ["A", "B"] -> "A, B"
 */
function tagsToText(tags) {

    return Array.isArray(tags) ? tags.join(", ") : "";

}

module.exports = {
    MAX_TAGS,
    MAX_LENGTH,
    SUGGESTED,
    normalizeTags,
    tagsToText
};
