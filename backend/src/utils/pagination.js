"use strict";

// ----------------------------------------------------
// Seitenweise Listen
// ----------------------------------------------------
//
//   const { page, perPage, skip } = parsePagination(req.query, { perPage: 25 });
//   const [items, total] = await Promise.all([
//       Model.find(q).skip(skip).limit(perPage),
//       Model.countDocuments(q)
//   ]);
//   return buildPage(items, total, { page, perPage });

const MAX_PER_PAGE = 100;

/**
 * Zahl begrenzen (1 … max), sonst Standardwert
 */
function clampLimit(value, fallback, max = MAX_PER_PAGE) {

    const n = parseInt(value, 10);

    if (!Number.isFinite(n) || n < 1) return fallback;

    return Math.min(n, max);

}

/**
 * Seite und Seitengröße aus Abfrageparametern
 */
function parsePagination(input = {}, defaults = {}) {

    const perPage = clampLimit(input.perPage, defaults.perPage || 25, defaults.max || MAX_PER_PAGE);
    const page = Math.max(parseInt(input.page, 10) || 1, 1);

    return { page, perPage, skip: (page - 1) * perPage };

}

/**
 * Einheitliches Ergebnisobjekt für Views
 */
function buildPage(items, total, { page, perPage }) {

    return {
        items,
        total,
        page,
        pages: Math.max(Math.ceil(total / perPage), 1),
        perPage
    };

}

module.exports = {
    MAX_PER_PAGE,
    clampLimit,
    parsePagination,
    buildPage
};
