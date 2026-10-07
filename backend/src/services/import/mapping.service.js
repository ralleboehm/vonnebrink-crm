"use strict";

// ----------------------------------------------------
// Spaltenzuordnung (CSV-Spalte -> CRM-Feld)
// ----------------------------------------------------
//
// Eine Zuordnung ist ein Array, das parallel zu den Spalten der
// CSV-Datei läuft: mapping[3] = "email" bedeutet, dass die vierte
// Spalte in das Feld "email" importiert wird. "" bedeutet ignorieren.

/**
 * Vereinheitlicht Spaltennamen und Werte für den Vergleich:
 * "Straße" -> "strasse", "E-Mail" -> "email", "Kundennr." -> "kundennr"
 */
function foldKey(value) {

    return String(value ?? "")
        .toLowerCase()
        .replace(/ß/g, "ss")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "");

}

/**
 * Schlägt für jede Spalte automatisch ein CRM-Feld vor.
 */
function guess(headers, entity) {

    const mapping = headers.map(() => "");

    const used = new Set();

    const synonymsByField = entity.fields.map((field) => ({

        key: field.key,

        synonyms: [field.label, ...(field.synonyms || [])].map(foldKey)

    }));

    const assign = (matcher) => {

        headers.forEach((header, index) => {

            if (mapping[index]) {
                return;
            }

            const folded = foldKey(header);

            if (!folded) {
                return;
            }

            // Reihenfolge der Felder in der Definition entscheidet
            // bei mehreren Treffern; längere Synonyme gewinnen.
            let best = null;

            for (const field of synonymsByField) {

                if (used.has(field.key)) {
                    continue;
                }

                for (const synonym of field.synonyms) {

                    if (!matcher(folded, synonym)) {
                        continue;
                    }

                    if (!best || synonym.length > best.length) {
                        best = { key: field.key, length: synonym.length };
                    }

                }

            }

            if (best) {
                mapping[index] = best.key;
                used.add(best.key);
            }

        });

    };

    // 1. Genaue Treffer
    assign((header, synonym) => header === synonym);

    // 2. Spalte beginnt mit Synonym ("E-Mail privat")
    assign((header, synonym) =>
        synonym.length >= 5 && header.startsWith(synonym)
    );

    // 3. Spalte enthält langes Synonym ("Telefon geschäftlich")
    assign((header, synonym) =>
        synonym.length >= 7 && header.includes(synonym)
    );

    return mapping;

}

/**
 * Zuordnung aus dem Formular lesen (Felder map_0, map_1, ...)
 */
function fromForm(body, headers, entity) {

    const allowed = new Set(entity.fields.map((field) => field.key));

    return headers.map((header, index) => {

        const value = String(body?.[`map_${index}`] || "");

        return allowed.has(value) ? value : "";

    });

}

/**
 * Prüft eine Zuordnung. Liefert eine Liste von Fehlermeldungen.
 */
function validate(mapping, entity) {

    const errors = [];

    const seen = new Set();

    for (const key of mapping) {

        if (!key) {
            continue;
        }

        if (seen.has(key)) {

            const field = entity.fields.find((f) => f.key === key);

            errors.push(
                `Das Feld „${field.label}" wurde mehreren Spalten zugeordnet.`
            );

        }

        seen.add(key);

    }

    errors.push(...entity.checkMapping(seen));

    return errors;

}

module.exports = {
    foldKey,
    guess,
    fromForm,
    validate
};
