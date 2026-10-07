"use strict";

// ----------------------------------------------------
// CSV Parser (ohne externe Abhängigkeiten)
// ----------------------------------------------------
//
// Unterstützt:
// - UTF-8 (mit/ohne BOM), UTF-16 (mit BOM) und Windows-1252
// - Trennzeichen ; , Tab |  (automatische Erkennung)
// - Felder in Anführungszeichen, "" als maskiertes Anführungszeichen,
//   Zeilenumbrüche innerhalb von Feldern
// - CRLF, LF und CR als Zeilenende
// - komplett leere Zeilen werden übersprungen

const DELIMITERS = [";", ",", "\t", "|"];

const MAX_COLUMNS = 100;

// ----------------------------------------------------
// Zeichenkodierung erkennen und dekodieren
// ----------------------------------------------------

function decode(buffer) {

    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {

        return {
            text: new TextDecoder("utf-16le").decode(buffer.subarray(2)),
            encoding: "utf-16le"
        };

    }

    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {

        return {
            text: new TextDecoder("utf-16be").decode(buffer.subarray(2)),
            encoding: "utf-16be"
        };

    }

    try {

        const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);

        return { text, encoding: "utf-8" };

    } catch (err) {

        // Excel exportiert "CSV" in Deutschland meist als Windows-1252.
        return {
            text: new TextDecoder("windows-1252").decode(buffer),
            encoding: "windows-1252"
        };

    }

}

// ----------------------------------------------------
// Trennzeichen erkennen (Anführungszeichen werden ignoriert)
// ----------------------------------------------------

function detectDelimiter(text) {

    const firstLine = text.split(/\r\n|\n|\r/, 1)[0] || "";

    let best = ";";
    let bestCount = 0;

    for (const delimiter of DELIMITERS) {

        let count = 0;
        let inQuotes = false;

        for (const char of firstLine) {

            if (char === "\"") {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                count++;
            }

        }

        if (count > bestCount) {
            best = delimiter;
            bestCount = count;
        }

    }

    return best;

}

// ----------------------------------------------------
// Text in Zeilen und Zellen zerlegen
// ----------------------------------------------------

function parseText(text, delimiter) {

    const rows = [];
    const lines = [];

    let row = [];
    let field = "";
    let inQuotes = false;

    let line = 1;
    let rowLine = 1;

    let i = 0;

    const pushRow = () => {

        if (row.some((cell) => cell.trim() !== "")) {
            rows.push(row);
            lines.push(rowLine);
        }

        row = [];

    };

    while (i < text.length) {

        const char = text[i];

        if (inQuotes) {

            if (char === "\"") {

                if (text[i + 1] === "\"") {
                    field += "\"";
                    i += 2;
                    continue;
                }

                inQuotes = false;
                i++;
                continue;

            }

            if (char === "\n") {
                line++;
            }

            field += char;
            i++;
            continue;

        }

        if (char === "\"" && field === "") {
            inQuotes = true;
            i++;
            continue;
        }

        if (char === delimiter) {
            row.push(field);
            field = "";
            i++;
            continue;
        }

        if (char === "\r" || char === "\n") {

            if (char === "\r" && text[i + 1] === "\n") {
                i++;
            }

            i++;

            row.push(field);
            field = "";

            pushRow();

            line++;
            rowLine = line;

            continue;

        }

        field += char;
        i++;

    }

    if (field !== "" || row.length > 0) {
        row.push(field);
        pushRow();
    }

    return {
        rows,
        lines,
        unterminatedQuote: inQuotes
    };

}

// ----------------------------------------------------
// Kopfzeile bereinigen (leer / doppelt)
// ----------------------------------------------------

function cleanHeaders(rawHeaders) {

    const used = new Map();

    return rawHeaders.map((raw, index) => {

        let name = String(raw || "").trim();

        if (!name) {
            name = `Spalte ${index + 1}`;
        }

        const key = name.toLowerCase();
        const count = (used.get(key) || 0) + 1;

        used.set(key, count);

        return count > 1 ? `${name} (${count})` : name;

    });

}

// ----------------------------------------------------
// Komplette Datei einlesen
// ----------------------------------------------------

function parseBuffer(buffer) {

    const { text, encoding } = decode(buffer);

    const delimiter = detectDelimiter(text);

    const parsed = parseText(text, delimiter);

    if (parsed.unterminatedQuote) {

        throw new Error(
            "Die CSV-Datei ist fehlerhaft: Ein Anführungszeichen wurde nicht geschlossen."
        );

    }

    if (parsed.rows.length === 0) {

        throw new Error("Die CSV-Datei ist leer.");

    }

    const headers = cleanHeaders(parsed.rows[0]);

    if (headers.length > MAX_COLUMNS) {

        throw new Error(
            `Die CSV-Datei hat zu viele Spalten (max. ${MAX_COLUMNS}).`
        );

    }

    // Alle Datenzeilen auf die Länge der Kopfzeile bringen
    const rows = parsed.rows.slice(1).map((row) => {

        const cells = row.slice(0, headers.length);

        while (cells.length < headers.length) {
            cells.push("");
        }

        return cells;

    });

    return {
        encoding,
        delimiter,
        headers,
        rows,
        lines: parsed.lines.slice(1)
    };

}

module.exports = {
    decode,
    detectDelimiter,
    parseText,
    cleanHeaders,
    parseBuffer,
    DELIMITERS
};
