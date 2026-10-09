"use strict";

// ----------------------------------------------------
// Net Promoter Score (NPS): Regeln und Kennzahlen (ohne Datenbank)
// ----------------------------------------------------
//
// Frage: „Wie wahrscheinlich ist es, dass Sie uns weiterempfehlen?“ (0–10)
//
//   9–10  Promotoren
//   7–8   Passive
//   0–6   Kritiker
//
// NPS = % Promotoren − % Kritiker  (−100 … +100)

const CATEGORIES = {
    promoter: { label: "Promotoren", range: "9–10" },
    passive: { label: "Passive", range: "7–8" },
    detractor: { label: "Kritiker", range: "0–6" }
};

const COMMENT_MAX = 2000;

function isScore(value) {

    return Number.isInteger(value) && value >= 0 && value <= 10;

}

/**
 * Wert aus Formular oder Link: "7" → 7, alles andere → null
 */
function parseScore(value) {

    if (value === undefined || value === null || String(value).trim() === "") return null;

    if (!/^\d{1,2}$/.test(String(value).trim())) return null;

    const score = Number(value);

    return isScore(score) ? score : null;

}

function category(score) {

    if (!isScore(score)) return null;
    if (score >= 9) return "promoter";
    if (score >= 7) return "passive";

    return "detractor";

}

function cleanComment(text) {

    return String(text || "").replace(/\r\n?/g, "\n").trim().slice(0, COMMENT_MAX);

}

/**
 * Kennzahlen aus beantworteten Umfragen
 *
 * @param {{score: number}[]} answers
 * @returns {{count, nps, promoters, passives, detractors, shares, average, distribution}}
 */
function summarize(answers) {

    const scores = (answers || []).map((a) => a.score).filter(isScore);

    const distribution = Array.from({ length: 11 }, () => 0);

    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    let sum = 0;

    for (const score of scores) {

        distribution[score]++;
        sum += score;

        const cat = category(score);

        if (cat === "promoter") promoters++;
        else if (cat === "passive") passives++;
        else detractors++;

    }

    const count = scores.length;
    const pct = (n) => (count ? Math.round((n / count) * 1000) / 10 : 0);

    return {
        count,
        nps: count ? Math.round(((promoters - detractors) / count) * 100) : null,
        promoters,
        passives,
        detractors,
        shares: { promoter: pct(promoters), passive: pct(passives), detractor: pct(detractors) },
        average: count ? Math.round((sum / count) * 10) / 10 : null,
        distribution
    };

}

function monthKey(date) {

    const d = new Date(date);

    // Monat in deutscher Zeit
    const parts = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).formatToParts(d);
    const year = parts.find((p) => p.type === "year").value;
    const month = parts.find((p) => p.type === "month").value;

    return `${year}-${month}`;

}

const MONTH_NAMES = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/**
 * NPS je Monat für die letzten `months` Monate (auch Monate ohne Antworten)
 *
 * @param {{score: number, answeredAt: Date}[]} answers
 * @param {number} months
 * @param {Date} [now]
 */
function monthlyTrend(answers, months = 12, now = new Date()) {

    const buckets = new Map();
    const current = monthKey(now);
    let [year, month] = current.split("-").map(Number);

    const keys = [];

    for (let i = 0; i < months; i++) {

        keys.unshift(`${year}-${String(month).padStart(2, "0")}`);

        month--;

        if (month === 0) {
            month = 12;
            year--;
        }

    }

    for (const key of keys) buckets.set(key, []);

    for (const answer of answers || []) {

        if (!answer.answeredAt) continue;

        const key = monthKey(answer.answeredAt);

        if (buckets.has(key)) buckets.get(key).push(answer);

    }

    return keys.map((key) => {

        const summary = summarize(buckets.get(key));
        const [y, m] = key.split("-").map(Number);

        return {
            key,
            label: `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`,
            count: summary.count,
            nps: summary.nps
        };

    });

}

module.exports = {
    CATEGORIES,
    COMMENT_MAX,
    isScore,
    parseScore,
    category,
    cleanComment,
    summarize,
    monthKey,
    monthlyTrend
};
