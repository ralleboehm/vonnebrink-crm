"use strict";

// ----------------------------------------------------
// Vertrieb: Phasen, Quellen, Prüfung, Kennzahlen (ohne Datenbank)
// ----------------------------------------------------
//
// Genutzt von services/opportunity.service.js; getrennt, damit alles in
// test/sales.test.js ohne MongoDB prüfbar ist.
//
// Phasen (Reihenfolge = Spalten der Pipeline-Tafel):
//   Neu → Erstgespräch → IT-Check → Angebot → Verhandlung → Gewonnen / Verloren
//
// Wert: monatlich (MRR, z. B. Managed-Services-Pauschale) und einmalig
// (Einrichtung, Hardware). Die Prognose ist der gewichtete Monatsumsatz:
// MRR × Wahrscheinlichkeit.

const STAGES = [
    { key: "new", label: "Neu", probability: 10, open: true },
    { key: "meeting", label: "Erstgespräch", probability: 20, open: true },
    { key: "assessment", label: "IT-Check", probability: 40, open: true },
    { key: "proposal", label: "Angebot", probability: 60, open: true },
    { key: "negotiation", label: "Verhandlung", probability: 80, open: true },
    { key: "won", label: "Gewonnen", probability: 100, open: false },
    { key: "lost", label: "Verloren", probability: 0, open: false }
];

const STAGE_KEYS = STAGES.map((s) => s.key);
const OPEN_STAGES = STAGES.filter((s) => s.open).map((s) => s.key);

const STAGE_LABELS = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

const SOURCES = {
    campaign: "Kampagne",
    referral: "Empfehlung",
    website: "Webseite / Kontaktformular",
    existing_customer: "Bestandskunde",
    phone: "Anruf",
    event: "Veranstaltung / Netzwerk",
    other: "Sonstiges"
};

const LOST_REASONS = [
    "Preis",
    "Anderer Anbieter",
    "Kein Bedarf / verschoben",
    "Keine Rückmeldung",
    "Passt nicht zu uns",
    "Sonstiges"
];

const LIMITS = {
    title: 150,
    text: 2000,
    nextStep: 300,
    maxValue: 10000000
};

function stageOf(key) {

    return STAGES.find((s) => s.key === key) || null;

}

function isOpen(stage) {

    return OPEN_STAGES.includes(stage);

}

function defaultProbability(stage) {

    const found = stageOf(stage);

    return found ? found.probability : 0;

}

/**
 * Geldbetrag aus dem Formular: "1.250,50", "1250.5", "1 250 €" → 1250.5
 * Leer → 0, Unsinn → NaN
 */
function parseMoney(value) {

    if (value === undefined || value === null) return 0;

    if (typeof value === "number") return value;

    let text = String(value).replace(/€|EUR|[\s\u00a0]/gi, "").replace(/,-+$/, "").trim();

    if (!text) return 0;

    // Englisches Format (1,250.50) nicht raten, sondern ablehnen
    if (text.includes(",") && text.includes(".") && text.lastIndexOf(",") < text.lastIndexOf(".")) return NaN;

    // Deutsches Format: Punkt als Tausender, Komma als Dezimaltrenner
    if (text.includes(",")) {
        text = text.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
        text = text.replace(/\./g, "");
    }

    if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;

    return Math.round(Number(text) * 100) / 100;

}

function parseDate(value) {

    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;

}

function parseProbability(value, stage) {

    if (value === undefined || value === null || String(value).trim() === "") {
        return defaultProbability(stage);
    }

    const number = Number(String(value).replace(",", "."));

    return Number.isFinite(number) ? Math.round(number) : NaN;

}

/**
 * Formularwerte prüfen. Gibt eine Fehlermeldung (Deutsch) oder null zurück.
 * Prüft nur die Felder selbst; ob Firma und Kontakt existieren, prüft der Service.
 */
function validate(data) {

    const title = String(data.title || "").trim();

    if (!title) return "Bitte einen Titel angeben (z. B. „Managed IT für 12 Arbeitsplätze“).";
    if (title.length > LIMITS.title) return `Der Titel darf höchstens ${LIMITS.title} Zeichen lang sein.`;

    if (!data.company) return "Bitte eine Firma auswählen.";

    if (!STAGE_KEYS.includes(data.stage)) return "Unbekannte Phase.";

    for (const [field, label] of [["mrr", "Monatlicher Wert"], ["oneTime", "Einmaliger Wert"]]) {

        const value = data[field];

        if (Number.isNaN(value)) return `${label}: bitte eine Zahl eingeben (z. B. 450 oder 1.250,50).`;
        if (value < 0) return `${label} darf nicht negativ sein.`;
        if (value > LIMITS.maxValue) return `${label} ist unrealistisch hoch.`;

    }

    if (Number.isNaN(data.probability) || data.probability < 0 || data.probability > 100) {
        return "Die Wahrscheinlichkeit muss zwischen 0 und 100 % liegen.";
    }

    if (data.expectedCloseDate === undefined) return "Das erwartete Abschlussdatum ist ungültig.";

    if (data.source && !SOURCES[data.source]) return "Unbekannte Quelle.";

    if (data.stage === "lost" && !String(data.lostReason || "").trim()) {
        return "Bitte einen Grund angeben, warum die Chance verloren ist.";
    }

    const step = data.nextStep || {};

    if (String(step.text || "").length > LIMITS.nextStep) return `Der nächste Schritt darf höchstens ${LIMITS.nextStep} Zeichen lang sein.`;
    if (step.dueDate === undefined) return "Das Datum des nächsten Schritts ist ungültig.";
    if (step.dueDate && !String(step.text || "").trim()) return "Bitte beschreiben, was der nächste Schritt ist.";

    if (String(data.notes || "").length > LIMITS.text) return `Die Beschreibung darf höchstens ${LIMITS.text} Zeichen lang sein.`;

    return null;

}

function startOfDay(date = new Date()) {

    const day = new Date(date);

    day.setHours(0, 0, 0, 0);

    return day;

}

/**
 * Fälligkeit des nächsten Schritts: "overdue", "today", "soon" (7 Tage),
 * "later", "none" (offene Chance ohne Schritt) oder null (abgeschlossen)
 */
function nextStepState(opportunity, now = new Date()) {

    if (!isOpen(opportunity.stage)) return null;

    const due = opportunity.nextStep && opportunity.nextStep.dueDate;

    if (!due) return "none";

    const today = startOfDay(now);
    const day = startOfDay(due);
    const diff = Math.round((day - today) / 86400000);

    if (diff < 0) return "overdue";
    if (diff === 0) return "today";
    if (diff <= 7) return "soon";

    return "later";

}

/**
 * Kennzahlen je Phase und gesamt (nur offene Chancen zählen zur Prognose)
 */
function summarize(opportunities) {

    const byStage = Object.fromEntries(STAGES.map((s) => [s.key, { count: 0, mrr: 0, oneTime: 0, weightedMrr: 0 }]));

    const totals = { open: 0, mrr: 0, oneTime: 0, weightedMrr: 0, overdue: 0, withoutStep: 0 };

    for (const opp of opportunities) {

        const bucket = byStage[opp.stage];

        if (!bucket) continue;

        const mrr = Number(opp.mrr) || 0;
        const oneTime = Number(opp.oneTime) || 0;
        const weighted = mrr * (Number(opp.probability) || 0) / 100;

        bucket.count++;
        bucket.mrr += mrr;
        bucket.oneTime += oneTime;
        bucket.weightedMrr += weighted;

        if (isOpen(opp.stage)) {

            totals.open++;
            totals.mrr += mrr;
            totals.oneTime += oneTime;
            totals.weightedMrr += weighted;

            const state = nextStepState(opp);

            if (state === "overdue") totals.overdue++;
            if (state === "none") totals.withoutStep++;

        }

    }

    totals.weightedMrr = Math.round(totals.weightedMrr * 100) / 100;

    return { byStage, totals };

}

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function formatEuro(value) {

    return EURO.format(Number(value) || 0);

}

module.exports = {
    STAGES,
    STAGE_KEYS,
    OPEN_STAGES,
    STAGE_LABELS,
    SOURCES,
    LOST_REASONS,
    LIMITS,
    stageOf,
    isOpen,
    defaultProbability,
    parseMoney,
    parseDate,
    parseProbability,
    validate,
    nextStepState,
    summarize,
    formatEuro
};
