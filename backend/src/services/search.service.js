"use strict";

// ----------------------------------------------------
// Globale Suche (Firmen, Kontakte, Tickets, Assets)
// ----------------------------------------------------
//
// Ablauf:
//   1. Der Suchtext wird in Wörter zerlegt (höchstens 6).
//   2. Jedes Wort muss in mindestens einem der durchsuchten Felder
//      vorkommen (UND-Verknüpfung über die Wörter, ODER über die Felder).
//      "müller holz" findet also die Firma "Holz Müller GmbH" genauso
//      wie den Kontakt "Hans Müller" der Firma "Holzland".
//   3. Umlaute werden großzügig behandelt: "mueller" findet "Müller"
//      und umgekehrt.
//
// Alle Eingaben werden maskiert, es gibt keine Regex-Injection.
// Gelöschte Datensätze (isDeleted) werden nie gefunden.

const MAX_QUERY_LENGTH = 100;
const MAX_TOKENS = 6;
const MIN_QUERY_LENGTH = 2;
const MAX_COMPANY_IDS = 200;
const FETCH_CAP = 100;

// ----------------------------------------------------
// Hilfsfunktionen (ohne Datenbank, gut testbar)
// ----------------------------------------------------

function escapeRegex(value) {

    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}

/**
 * Bereinigt den Suchtext: nur Text, Leerzeichen zusammenfassen, kürzen.
 */
function normalizeQuery(raw) {

    if (typeof raw !== "string") {
        return "";
    }

    return raw
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_QUERY_LENGTH);

}

function tokenize(query) {

    const seen = new Set();
    const tokens = [];

    for (const word of normalizeQuery(query).split(" ")) {

        const key = word.toLowerCase();

        if (!word || seen.has(key)) {
            continue;
        }

        seen.add(key);
        tokens.push(word);

        if (tokens.length === MAX_TOKENS) {
            break;
        }

    }

    return tokens;

}

/**
 * "müller" -> ["müller", "mueller"], "mueller" -> ["mueller", "müller"]
 */
function variants(token) {

    const lower = token.toLowerCase();

    const expanded = lower
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss");

    const contracted = lower
        .replace(/ae/g, "ä")
        .replace(/oe/g, "ö")
        .replace(/ue/g, "ü")
        .replace(/ss/g, "ß");

    return [...new Set([lower, expanded, contracted])];

}

function tokenPattern(token) {

    const parts = variants(token).map(escapeRegex);

    return parts.length === 1 ? parts[0] : `(?:${parts.join("|")})`;

}

function tokenRegex(token) {

    return { $regex: tokenPattern(token), $options: "i" };

}

/**
 * Baut den Filter: jedes Wort in mindestens einem Feld.
 * extra(token) liefert zusätzliche ODER-Bedingungen (z. B. Firmen-IDs).
 */
function buildTextFilter(tokens, fields, extra = () => []) {

    return {

        $and: tokens.map((token) => ({

            $or: [
                ...fields.map((field) => ({ [field]: tokenRegex(token) })),
                ...extra(token)
            ]

        }))

    };

}

/**
 * Zerlegt einen Text in Stücke mit Markierung der Treffer.
 * Rückgabe: [{ text, hit }]  (wird im View mit <mark> dargestellt,
 * dadurch ist keine HTML-Ausgabe von Benutzertext nötig)
 */
function highlight(text, tokens) {

    const value = text === null || text === undefined ? "" : String(text);

    if (!value || !tokens || tokens.length === 0) {
        return value ? [{ text: value, hit: false }] : [];
    }

    const all = [...new Set(tokens.flatMap(variants))]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegex);

    const regex = new RegExp(`(${all.join("|")})`, "gi");

    return value
        .split(regex)
        .map((part, index) => ({ text: part, hit: index % 2 === 1 }))
        .filter((part) => part.text !== "");

}

/**
 * Treffer, die mit dem ersten Suchwort beginnen, kommen zuerst.
 */
function rank(items, labelOf, tokens) {

    if (!tokens.length) {
        return items;
    }

    const first = variants(tokens[0]);

    const score = (item) => {

        const label = String(labelOf(item) || "").toLowerCase();

        if (first.some((v) => label === v)) {
            return 0;
        }

        if (first.some((v) => label.startsWith(v))) {
            return 1;
        }

        return 2;

    };

    return items
        .map((item, index) => ({ item, index, score: score(item) }))
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .map((entry) => entry.item);

}

// Kunden-, Kontakt- und Ticketnummern ("CUS-000012" usw.)
const NUMBER_PATTERN = /^[A-Za-z]{2,5}-\d{3,}$/;

// ----------------------------------------------------
// Datenbank
// ----------------------------------------------------

function defaultModels() {

    return {
        Company: require("../models/company.model"),
        Contact: require("../models/contact.model"),
        Ticket: require("../models/ticket.model"),
        Asset: require("../models/asset.model")
    };

}

const COMPANY_FIELDS = [
    "companyName",
    "customerNumber",
    "address.street",
    "address.postalCode",
    "address.city",
    "address.country",
    "phone",
    "email",
    "website",
    "notes"
];

const CONTACT_FIELDS = [
    "firstName",
    "lastName",
    "contactNumber",
    "email",
    "phone",
    "mobile",
    "position",
    "notes"
];

const TICKET_FIELDS = [
    "ticketNumber",
    "subject",
    "description"
];

const ASSET_FIELDS = [
    "assetNumber",
    "name",
    "serialNumber",
    "assetTag",
    "manufacturer",
    "model",
    "operatingSystem",
    "ipAddress",
    "macAddress",
    "lastUser"
];

/**
 * IDs der Firmen bzw. Kontakte, die zu einem Wort passen (für die Suche
 * "Tickets von Firma X" und "Kontakte der Firma X").
 */
async function idsByToken(Model, fields, tokens) {

    const entries = await Promise.all(

        tokens.map(async (token) => {

            const docs = await Model
                .find(
                    {
                        isDeleted: false,
                        $or: fields.map((field) => ({ [field]: tokenRegex(token) }))
                    },
                    "_id"
                )
                .limit(MAX_COMPANY_IDS)
                .lean();

            return [token, docs.map((doc) => doc._id)];

        })

    );

    return new Map(entries);

}

/**
 * Sucht in Firmen, Kontakten und Tickets.
 *
 * @param {string} rawQuery
 * @param {{limit?: number}} options  Treffer pro Bereich (Standard 25)
 * @param {object} [models]           nur für Tests
 */
async function searchAll(rawQuery, options = {}, models = defaultModels()) {

    const limit = Math.min(Math.max(options.limit || 25, 1), 100);
    const query = normalizeQuery(rawQuery);
    const tokens = tokenize(query);

    const empty = { items: [], total: 0 };

    if (query.length < MIN_QUERY_LENGTH) {

        return { query, tokens, tooShort: query.length > 0, companies: empty, contacts: empty, tickets: empty, assets: empty };

    }

    const { Company, Contact, Ticket, Asset } = models;

    const fetchSize = Math.min(limit * 4, FETCH_CAP);

    // Firmen- und Kontakt-IDs je Wort (für Kontakte und Tickets)
    const [companyIds, contactIds] = await Promise.all([
        idsByToken(Company, ["companyName", "address.city"], tokens),
        idsByToken(Contact, ["firstName", "lastName", "email"], tokens)
    ]);

    const companyFilter = {
        isDeleted: false,
        ...buildTextFilter(tokens, COMPANY_FIELDS)
    };

    const contactFilter = {
        isDeleted: false,
        ...buildTextFilter(tokens, CONTACT_FIELDS, (token) => [
            { company: { $in: companyIds.get(token) } }
        ])
    };

    const ticketFilter = {
        isDeleted: false,
        ...buildTextFilter(tokens, TICKET_FIELDS, (token) => [
            { company: { $in: companyIds.get(token) } },
            { contact: { $in: contactIds.get(token) } }
        ])
    };

    const assetFilter = {
        isDeleted: false,
        ...buildTextFilter(tokens, ASSET_FIELDS, (token) => [
            { company: { $in: companyIds.get(token) } }
        ])
    };

    // Assets sind optional (ältere Tests übergeben kein Asset-Modell)
    const assetSearch = Asset
        ? Promise.all([
            Asset.find(
                assetFilter,
                "assetNumber name type serialNumber operatingSystem lastUser company"
            ).populate("company", "companyName").sort({ name: 1 }).limit(fetchSize).lean(),
            Asset.countDocuments(assetFilter)
        ])
        : Promise.resolve([[], 0]);

    const [companies, companyTotal, contacts, contactTotal, tickets, ticketTotal, [assets, assetTotal]] =
        await Promise.all([

            Company.find(
                companyFilter,
                "companyName customerNumber status address phone email website"
            ).sort({ companyName: 1 }).limit(fetchSize).lean(),

            Company.countDocuments(companyFilter),

            Contact.find(
                contactFilter,
                "firstName lastName contactNumber position email phone mobile status company"
            ).populate("company", "companyName").sort({ lastName: 1, firstName: 1 }).limit(fetchSize).lean(),

            Contact.countDocuments(contactFilter),

            Ticket.find(
                ticketFilter,
                "ticketNumber subject status priority category company contact createdAt"
            )
                .populate("company", "companyName")
                .populate("contact", "firstName lastName")
                .sort({ createdAt: -1 })
                .limit(fetchSize)
                .lean(),

            Ticket.countDocuments(ticketFilter),

            assetSearch

        ]);

    return {

        query,
        tokens,
        tooShort: false,

        companies: {
            items: rank(companies, (c) => c.companyName, tokens).slice(0, limit),
            total: companyTotal
        },

        contacts: {
            items: rank(contacts, (c) => c.lastName, tokens).slice(0, limit),
            total: contactTotal
        },

        tickets: {
            items: tickets.slice(0, limit),
            total: ticketTotal
        },

        assets: {
            items: rank(assets, (a) => a.name, tokens).slice(0, limit),
            total: assetTotal
        }

    };

}

/**
 * Exakte Nummer (z. B. "CUS-000012") -> direkt zum Datensatz springen.
 * Gibt die URL zurück oder null.
 */
async function findByNumber(rawQuery, models = defaultModels()) {

    const query = normalizeQuery(rawQuery);

    if (!NUMBER_PATTERN.test(query)) {
        return null;
    }

    const number = query.toUpperCase();

    const [company, contact, ticket, asset] = await Promise.all([
        models.Company.findOne({ customerNumber: number, isDeleted: false }, "_id").lean(),
        models.Contact.findOne({ contactNumber: number, isDeleted: false }, "_id").lean(),
        models.Ticket.findOne({ ticketNumber: number, isDeleted: false }, "_id").lean(),
        models.Asset ? models.Asset.findOne({ assetNumber: number, isDeleted: false }, "_id").lean() : null
    ]);

    if (company) return `/crm/companies/${company._id}`;
    if (contact) return `/crm/contacts/${contact._id}`;
    if (ticket) return `/crm/tickets/${ticket._id}`;
    if (asset) return `/crm/assets/${asset._id}`;

    return null;

}

module.exports = {

    MAX_QUERY_LENGTH,
    MIN_QUERY_LENGTH,

    escapeRegex,
    normalizeQuery,
    tokenize,
    variants,
    tokenRegex,
    buildTextFilter,
    highlight,
    rank,

    searchAll,
    findByNumber

};
