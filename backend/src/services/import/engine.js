"use strict";

// ----------------------------------------------------
// Import Engine
// ----------------------------------------------------
//
// Arbeitet in zwei Schritten:
//   1. buildPlan  - prüft jede Zeile, ändert aber NICHTS in der Datenbank
//   2. executePlan - führt den Plan aus
//
// Die Engine kennt keine Datenbank. Alles Datenbankspezifische
// steckt in den Entity-Definitionen (entities/*.js).

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_ROWS = 5000;

// ----------------------------------------------------
// Zellwert bereinigen
// ----------------------------------------------------

function cleanValue(value) {

    return String(value ?? "")
        .replace(/ /g, " ")
        .trim()
        // Apostroph, das der Export vor "=..." setzt, wieder entfernen
        .replace(/^'(?=[=+\-@])/, "");

}

// ----------------------------------------------------
// Zeile -> Rohwerte (nach Zuordnung)
// ----------------------------------------------------

function recordFromRow(row, mapping) {

    const raw = {};

    mapping.forEach((key, index) => {

        if (!key) {
            return;
        }

        const value = cleanValue(row[index]);

        if (value !== "") {
            raw[key] = value;
        }

    });

    return raw;

}

// ----------------------------------------------------
// Rohwerte -> geprüfte Daten
// ----------------------------------------------------

function normalizeRecord(entity, raw, mappedKeys) {

    const data = {};
    const errors = [];

    // 1. Umwandeln (E-Mail, Auswahlwerte, ...)
    for (const field of entity.fields) {

        const value = raw[field.key];

        if (value === undefined) {
            continue;
        }

        if (field.type === "email") {

            const email = value.toLowerCase();

            if (!EMAIL_PATTERN.test(email)) {
                errors.push(`${field.label} „${value}" ist keine gültige E-Mail-Adresse.`);
                continue;
            }

            data[field.key] = email;
            continue;

        }

        if (field.type === "url") {

            data[field.key] = value.toLowerCase();
            continue;

        }

        if (field.parse) {

            const parsed = field.parse(value);

            if (parsed === null) {
                errors.push(`${field.label}: unbekannter Wert „${value}".`);
                continue;
            }

            data[field.key] = parsed;
            continue;

        }

        data[field.key] = value;

    }

    // 2. Felder zusammenführen / aufteilen (Straße + Nr., Vollname)
    if (entity.postProcess) {
        entity.postProcess(data, { mappedKeys });
    }

    // 3. Länge und Pflichtfelder
    for (const field of entity.fields) {

        const value = data[field.key];

        if (value === undefined || value === "") {

            if (field.required && !errors.some((e) => e.startsWith(field.label))) {
                errors.push(`${field.label} fehlt.`);
            }

            continue;

        }

        if (field.max && value.length > field.max) {

            errors.push(
                `${field.label} ist zu lang (${value.length} Zeichen, max. ${field.max}).`
            );

        }

        if (field.min && value.length < field.min) {

            errors.push(
                `${field.label} ist zu kurz (mindestens ${field.min} Zeichen).`
            );

        }

    }

    if (entity.validate) {
        errors.push(...entity.validate(data, { mappedKeys }));
    }

    return { data, errors };

}

// ----------------------------------------------------
// Plan erstellen (Trockenlauf)
// ----------------------------------------------------

async function buildPlan({ entity, parsed, mapping, duplicates }) {

    if (parsed.rows.length > MAX_ROWS) {

        throw new Error(
            `Die Datei hat ${parsed.rows.length} Zeilen. ` +
            `Pro Import sind höchstens ${MAX_ROWS} Zeilen erlaubt. ` +
            "Bitte teilen Sie die Datei auf."
        );

    }

    const mappedKeys = new Set(mapping.filter(Boolean));

    const items = parsed.rows.map((row, index) => {

        const raw = recordFromRow(row, mapping);

        const { data, errors } = normalizeRecord(entity, raw, mappedKeys);

        return {

            line: parsed.lines[index],
            cells: row,
            data,
            messages: errors,
            action: errors.length ? "error" : null,
            existingId: null,
            label: entity.describe(data)

        };

    });

    const lookups = await entity.loadLookups();

    const seen = new Map();

    for (const item of items) {

        if (item.action === "error") {
            continue;
        }

        // Doppelte Einträge innerhalb der Datei
        const keys = entity.fileKeys(item.data);

        const duplicate = keys.find((key) => seen.has(key));

        if (duplicate) {

            item.action = "error";

            item.messages.push(
                `Doppelter Eintrag in der Datei (siehe Zeile ${seen.get(duplicate)}).`
            );

            continue;

        }

        keys.forEach((key) => seen.set(key, item.line));

        const decision = entity.decide(item.data, lookups, {
            duplicates: duplicates === "update" ? "update" : "skip"
        });

        item.action = decision.action;
        item.existingId = decision.existingId || null;
        item.companyId = decision.companyId || null;

        if (decision.message) {
            item.messages.push(decision.message);
        }

    }

    return {
        items,
        counts: countActions(items)
    };

}

function countActions(items) {

    const counts = {
        total: items.length,
        create: 0,
        update: 0,
        skip: 0,
        error: 0
    };

    for (const item of items) {
        counts[item.action]++;
    }

    return counts;

}

// ----------------------------------------------------
// Plan ausführen
// ----------------------------------------------------

function describeError(err) {

    if (err && err.code === 11000) {
        return "Eintrag existiert bereits (doppelter Schlüssel).";
    }

    if (err && err.errors) {

        return Object.values(err.errors)
            .map((e) => e.message)
            .join(" ");

    }

    return (err && err.message) || "Unbekannter Fehler.";

}

async function executePlan({ entity, plan }) {

    for (const item of plan.items) {

        if (item.action !== "create" && item.action !== "update") {
            continue;
        }

        try {

            await entity.apply(item);

            item.applied = true;

        } catch (err) {

            item.action = "error";
            item.messages.push(describeError(err));

        }

    }

    if (entity.finalize) {
        await entity.finalize(plan.items);
    }

    return {
        items: plan.items,
        counts: countActions(plan.items)
    };

}

module.exports = {
    MAX_ROWS,
    cleanValue,
    recordFromRow,
    normalizeRecord,
    buildPlan,
    executePlan,
    countActions
};
