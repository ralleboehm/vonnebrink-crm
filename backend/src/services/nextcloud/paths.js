"use strict";

// ----------------------------------------------------
// Pfade in Nextcloud (ohne Netzwerk)
// ----------------------------------------------------
//
// Pfade sind immer relativ zum Dateibereich des CRM-Benutzers, ohne
// führenden Schrägstrich, z. B. "CRM/Customers/CUS-000001 Musterfirma/Offers".
// So stehen sie auch in den Metadaten (Document.nextcloud.path) und
// lassen sich in Nextcloud direkt wiederfinden.

const MAX_SEGMENT = 120;

/**
 * Einen Ordner- oder Dateinamen für Nextcloud bereinigen:
 * keine Schrägstriche und Sonderzeichen, die Windows/Nextcloud ablehnen,
 * keine führenden/abschließenden Punkte oder Leerzeichen.
 */
function cleanSegment(value, fallback = "_") {

    let name = String(value == null ? "" : value)
        .normalize("NFC")
        .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[.\s]+|[.\s]+$/g, "");

    if (name.length > MAX_SEGMENT) {
        name = name.slice(0, MAX_SEGMENT).trim();
    }

    return name || fallback;

}

/**
 * Teile zu einem Pfad verbinden. Jeder Teil darf selbst "/" enthalten.
 * ".." und "." werden abgewiesen (kein Ausbrechen aus dem Hauptordner).
 */
function join(...parts) {

    const segments = [];

    for (const part of parts) {

        for (const segment of String(part == null ? "" : part).split("/")) {

            if (!segment) continue;

            if (segment === "." || segment === "..") {
                throw new Error(`Ungültiger Pfad: "${parts.join("/")}"`);
            }

            segments.push(segment);

        }

    }

    return segments.join("/");

}

function parent(path) {

    const segments = join(path).split("/");

    segments.pop();

    return segments.join("/");

}

function basename(path) {

    const segments = join(path).split("/");

    return segments[segments.length - 1] || "";

}

/**
 * Für die URL: jeden Teil einzeln kodieren
 */
function encode(path) {

    return join(path).split("/").map(encodeURIComponent).join("/");

}

/**
 * Alle übergeordneten Ordner, kürzester zuerst:
 * "a/b/c" → ["a", "a/b", "a/b/c"]
 */
function ancestors(path) {

    const segments = join(path).split("/").filter(Boolean);

    return segments.map((_, index) => segments.slice(0, index + 1).join("/"));

}

/**
 * Dateiname aufteilen: "Angebot 2026.PDF" → { stem: "Angebot 2026", extension: "pdf" }
 */
function splitExtension(fileName) {

    const name = String(fileName || "");
    const dot = name.lastIndexOf(".");

    if (dot <= 0 || dot === name.length - 1) return { stem: name, extension: "" };

    const extension = name.slice(dot + 1).toLowerCase();

    // Nur übliche Endungen als Endung werten
    if (!/^[a-z0-9]{1,10}$/.test(extension)) return { stem: name, extension: "" };

    return { stem: name.slice(0, dot), extension };

}

/**
 * Dateinamen bereinigen, Endung klein und erhalten
 */
function cleanFileName(fileName, fallback = "Dokument") {

    const { stem, extension } = splitExtension(cleanSegment(fileName, fallback));
    const maxStem = MAX_SEGMENT - (extension ? extension.length + 1 : 0);
    const cleanStem = cleanSegment(stem.slice(0, maxStem), fallback);

    return extension ? `${cleanStem}.${extension}` : cleanStem;

}

/**
 * "Name.pdf" → "Name (2).pdf"
 */
function numbered(fileName, number) {

    const { stem, extension } = splitExtension(fileName);

    return extension ? `${stem} (${number}).${extension}` : `${stem} (${number})`;

}

module.exports = {
    MAX_SEGMENT,
    cleanSegment,
    cleanFileName,
    splitExtension,
    numbered,
    join,
    parent,
    basename,
    encode,
    ancestors
};
