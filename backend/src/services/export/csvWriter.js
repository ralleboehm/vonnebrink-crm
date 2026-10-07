"use strict";

// ----------------------------------------------------
// CSV Writer
// ----------------------------------------------------
//
// - Trennzeichen ";" (öffnet in deutschem Excel direkt korrekt)
// - UTF-8 mit BOM (Umlaute stimmen in Excel)
// - CRLF als Zeilenende
// - Schutz vor "CSV/Formula Injection": Zellen, die mit = + - @
//   beginnen, würden Excel als Formel ausführen. Sie bekommen ein
//   führendes Apostroph. Telefonnummern wie "+49 170 123" bleiben
//   unverändert.

const DELIMITER = ";";

const BOM = "﻿";

const NUMBER_LIKE = /^[+-]?[\d\s()/.\-]+$/;

function guardFormula(value) {

    if (/^[=@]/.test(value)) {
        return `'${value}`;
    }

    if (/^[+\-\t\r]/.test(value) && !NUMBER_LIKE.test(value)) {
        return `'${value}`;
    }

    return value;

}

function escapeCell(raw) {

    if (raw === null || raw === undefined) {
        return "";
    }

    const value = guardFormula(String(raw));

    if (/[";\r\n]/.test(value) || value !== value.trim()) {
        return `"${value.replace(/"/g, "\"\"")}"`;
    }

    return value;

}

/**
 * @param {string[]} headers  Spaltenüberschriften
 * @param {Array<Array>} rows  Datenzeilen
 */
function toCsv(headers, rows) {

    const lines = [headers.map(escapeCell).join(DELIMITER)];

    for (const row of rows) {
        lines.push(row.map(escapeCell).join(DELIMITER));
    }

    return BOM + lines.join("\r\n") + "\r\n";

}

module.exports = {
    toCsv,
    escapeCell,
    DELIMITER
};
