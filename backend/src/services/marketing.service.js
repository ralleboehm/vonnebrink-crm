"use strict";

// ----------------------------------------------------
// Marketing: Einwilligungen und erreichbare Empfänger
// ----------------------------------------------------
//
// Regeln: utils/marketingConsent.js
//
// Einwilligungen entstehen
//   - durch den Kontakt selbst: Kundenportal (Mein Profil) oder
//     Bestätigungs-E-Mail (Double-Opt-In),
//   - im CRM durch Mitarbeiter: mit Nachweis oder als Bestandskunde
//     (§ 7 Abs. 3 UWG).
// Abmelden kann sich der Kontakt im Portal oder über den persönlichen
// Abmeldelink (jede Kampagnen-Mail). Hat er sich selbst abgemeldet, kann
// ihn kein Mitarbeiter wieder eintragen.
// Jede Änderung landet im Verlauf (wer, wann, wie, Notiz).

const Contact = require("../models/contact.model");
const Company = require("../models/company.model");
const PortalAccount = require("../models/portalAccount.model");
const { escapeRegex } = require("./search.service");
const { toCsv } = require("./export/csvWriter");

const crypto = require("crypto");
const emailService = require("./email.service");

const rules = require("../utils/marketingConsent");

const {
    STATUS_LABELS,
    SOURCES,
    SOURCE_LABELS,
    STAFF_GRANT_SOURCES,
    consentOf,
    staffMayGrant,
    ineligibleReason,
    isEligible,
    staffGrantProblem
} = rules;

// Double-Opt-In-Links gelten 30 Tage
const DOI_VALID_DAYS = 30;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

function newToken() {
    return crypto.randomBytes(24).toString("base64url");
}

function httpError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
}

const SALUTATIONS = { mr: "Herr", mrs: "Frau", diverse: "" };

// ----------------------------------------------------
// Einwilligung ändern
// ----------------------------------------------------

/**
 * Einwilligung erteilen oder widerrufen.
 *
 * @param {string} contactId
 * @param {boolean} granted
 * @param {{source: string, by: string, note?: string}} meta
 *        source: portal | double_opt_in | link (Kontakt selbst), crm | customer (Mitarbeiter)
 */
async function setConsent(contactId, granted, { source, by, note } = {}) {

    if (!SOURCES.includes(source)) {
        throw new Error("Unbekannte Quelle für die Einwilligung.");
    }

    const contact = await Contact.findOne({ _id: contactId, isDeleted: false });

    if (!contact) {
        throw httpError("Kontakt nicht gefunden.", 404);
    }

    const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";

    if (granted && STAFF_GRANT_SOURCES.includes(source)) {

        const company = await Company.findById(contact.company, "status").lean();
        const problem = staffGrantProblem(contact, company, source, cleanNote);

        if (problem) {
            throw httpError(problem, staffMayGrant(contact) ? 422 : 409);
        }

    }

    if (granted && source === "link") {
        throw new Error("Über den Abmeldelink kann man sich nur abmelden.");
    }

    const status = granted ? "granted" : "revoked";
    const current = consentOf(contact);

    // Keine doppelten Einträge, wenn sich nichts ändert
    // (Ausnahme: Wechsel der Art, z. B. Nachweis -> Double-Opt-In)
    if (current.status === status && (!granted || current.source === source)) {
        return contact;
    }

    const now = new Date();

    const set = {
        "marketing.status": status,
        "marketing.changedAt": now,
        "marketing.source": source
    };

    // Mit der Einwilligung entsteht der persönliche Abmeldelink
    if (granted && !contact.marketing?.unsubscribeToken) {
        set["marketing.unsubscribeToken"] = newToken();
    }

    return Contact.findOneAndUpdate(
        { _id: contactId, isDeleted: false },
        {
            $set: set,
            $push: {
                "marketing.history": {
                    status,
                    at: now,
                    source,
                    by: String(by || "").slice(0, 200),
                    note: cleanNote || null
                }
            }
        },
        { returnDocument: "after", runValidators: true }
    );

}

// ----------------------------------------------------
// Abmeldelink und Double-Opt-In (ohne Anmeldung)
// ----------------------------------------------------

function unsubscribeUrl(contact) {

    const token = contact && contact.marketing && contact.marketing.unsubscribeToken;

    return token ? emailService.appUrl(`/email/abmelden/${token}`) : null;

}

async function findByUnsubscribeToken(token) {

    if (!TOKEN_PATTERN.test(String(token || ""))) return null;

    return Contact.findOne({ "marketing.unsubscribeToken": token, isDeleted: false });

}

/**
 * Abmeldung über den Link in der E-Mail
 */
async function unsubscribeByToken(token) {

    const contact = await findByUnsubscribeToken(token);

    if (!contact) return null;

    return setConsent(contact._id, false, {
        source: "link",
        by: contact.email,
        note: "Abmeldelink"
    });

}

/**
 * Bestätigungs-E-Mail (Double-Opt-In) verschicken.
 * Nur auf Wunsch des Kontakts – z. B. Haken im Kontaktformular der Website.
 */
async function requestDoubleOptIn(contactId, { by } = {}) {

    const contact = await Contact.findOne({ _id: contactId, isDeleted: false }).populate("company", "companyName");

    if (!contact) {
        throw httpError("Kontakt nicht gefunden.", 404);
    }

    if (ineligibleReason(contact) === "Keine E-Mail-Adresse") {
        throw httpError("Der Kontakt hat keine gültige E-Mail-Adresse.", 422);
    }

    if (consentOf(contact).status === "granted") {
        throw httpError("Der Kontakt hat bereits eingewilligt.", 409);
    }

    const token = newToken();
    const requestedBy = String(by || "").slice(0, 200);

    await Contact.updateOne(
        { _id: contact._id },
        { $set: { "marketing.doi": { token, requestedAt: new Date(), requestedBy } } }
    );

    const salutation = { mr: "Herr", mrs: "Frau" }[contact.salutation];

    const result = await emailService.sendTemplate("marketing-confirm", contact.email, {
        customerName: salutation ? `${salutation} ${contact.lastName}` : `${contact.firstName} ${contact.lastName}`.trim(),
        company: contact.company ? contact.company.companyName : "",
        confirmLink: emailService.appUrl(`/email/bestaetigen/${token}`)
    });

    return { contact, token, result };

}

async function findByDoiToken(token) {

    if (!TOKEN_PATTERN.test(String(token || ""))) return null;

    const contact = await Contact.findOne({ "marketing.doi.token": token, isDeleted: false });

    if (!contact) return null;

    const requestedAt = contact.marketing.doi.requestedAt;
    const expired = !requestedAt || Date.now() - requestedAt.getTime() > DOI_VALID_DAYS * 24 * 60 * 60 * 1000;

    return { contact, expired };

}

/**
 * Bestätigung über den Link in der Double-Opt-In-Mail
 */
async function confirmDoubleOptIn(token) {

    const found = await findByDoiToken(token);

    if (!found || found.expired) return null;

    const { doi } = found.contact.marketing;
    const day = (date) => date.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });

    const updated = await setConsent(found.contact._id, true, {
        source: "double_opt_in",
        by: found.contact.email,
        note: `Angefordert ${day(doi.requestedAt)}${doi.requestedBy ? ` von ${doi.requestedBy}` : ""}, bestätigt ${day(new Date())}`
    });

    await Contact.updateOne({ _id: found.contact._id }, { $unset: { "marketing.doi": 1 } });

    return updated;

}

// ----------------------------------------------------
// Empfänger
// ----------------------------------------------------

/**
 * Kontakte mit Firma, Portalzugang und Erreichbarkeit.
 *
 * @param {{tag?: string, onlyEligible?: boolean, search?: string}} filters
 */
async function listContacts(filters = {}) {

    const companyQuery = { isDeleted: false };

    if (filters.tag) {
        companyQuery.tags = { $regex: `^${escapeRegex(filters.tag)}$`, $options: "i" };
    }

    const companies = await Company.find(companyQuery, "companyName customerNumber status tags").lean();
    const companyById = new Map(companies.map((c) => [String(c._id), c]));

    const contactQuery = { isDeleted: false, company: { $in: companies.map((c) => c._id) } };

    if (filters.search) {

        const regex = { $regex: escapeRegex(filters.search), $options: "i" };

        contactQuery.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];

    }

    const contacts = await Contact.find(contactQuery).lean();

    const accounts = await PortalAccount.find(
        { contact: { $in: contacts.map((c) => c._id) } },
        "contact active lastLogin"
    ).lean();

    const accountByContact = new Map(accounts.map((a) => [String(a.contact), a]));

    const rows = contacts.map((contact) => {

        const portalAccount = accountByContact.get(String(contact._id)) || null;
        const company = companyById.get(String(contact.company)) || null;
        const reason = ineligibleReason(contact, company);

        return {
            contact,
            company,
            portalAccount,
            consent: consentOf(contact),
            eligible: reason === null,
            reason
        };

    });

    // Ältere Einwilligungen ohne Abmeldelink nachrüsten
    const missing = rows.filter((row) => row.eligible && !(row.contact.marketing && row.contact.marketing.unsubscribeToken));

    if (missing.length) {

        await Contact.bulkWrite(missing.map((row) => {

            const token = newToken();

            row.contact.marketing.unsubscribeToken = token;

            return {
                updateOne: {
                    filter: { _id: row.contact._id, "marketing.unsubscribeToken": { $exists: false } },
                    update: { $set: { "marketing.unsubscribeToken": token } }
                }
            };

        }));

    }

    rows.sort((a, b) =>
        (a.company ? a.company.companyName : "").localeCompare(b.company ? b.company.companyName : "", "de") ||
        String(a.contact.lastName).localeCompare(String(b.contact.lastName), "de")
    );

    return filters.onlyEligible ? rows.filter((row) => row.eligible) : rows;

}

/**
 * Kennzahlen zu einer Liste aus listContacts()
 */
function summarize(rows) {

    return {
        contacts: rows.length,
        withPortal: rows.filter((r) => r.portalAccount && r.portalAccount.active).length,
        granted: rows.filter((r) => r.consent.status === "granted").length,
        revoked: rows.filter((r) => r.consent.status === "revoked").length,
        eligible: rows.filter((r) => r.eligible).length
    };

}

/**
 * Erreichbare Empfänger je Gruppe (Schlagwort der Firma)
 */
async function eligibleByGroup() {

    const rows = await listContacts({ onlyEligible: true });
    const counts = new Map();

    for (const row of rows) {

        for (const tag of (row.company && row.company.tags) || []) {
            const key = tag.toLowerCase();
            counts.set(key, (counts.get(key) || 0) + 1);
        }

    }

    return counts;

}

/**
 * CSV für Serienbrief / Anrufliste
 */
function toExportCsv(rows) {

    const yesNo = (value) => (value ? "ja" : "nein");

    return toCsv(
        [
            "Firma", "Kundennummer", "Branche / Gruppen", "Anrede", "Vorname", "Nachname", "Position",
            "E-Mail", "Telefon", "Mobil", "Portalzugang", "Einwilligung", "Art der Einwilligung",
            "Für Kampagnen erreichbar", "Grund", "Abmeldelink"
        ],
        rows.map((row) => [
            row.company ? row.company.companyName : "",
            row.company ? row.company.customerNumber : "",
            row.company ? (row.company.tags || []).join(", ") : "",
            SALUTATIONS[row.contact.salutation] || "",
            row.contact.firstName,
            row.contact.lastName,
            row.contact.position || "",
            row.contact.email,
            row.contact.phone || "",
            row.contact.mobile || "",
            yesNo(row.portalAccount && row.portalAccount.active),
            STATUS_LABELS[row.consent.status],
            row.consent.source ? SOURCE_LABELS[row.consent.source] : "",
            yesNo(row.eligible),
            row.reason || "",
            row.eligible ? unsubscribeUrl(row.contact) || "" : ""
        ])
    );

}

module.exports = {
    STATUS_LABELS,
    SOURCE_LABELS,
    STAFF_GRANT_SOURCES,
    DOI_VALID_DAYS,
    consentOf,
    staffMayGrant,
    ineligibleReason,
    isEligible,
    setConsent,
    unsubscribeUrl,
    findByUnsubscribeToken,
    unsubscribeByToken,
    requestDoubleOptIn,
    findByDoiToken,
    confirmDoubleOptIn,
    listContacts,
    summarize,
    eligibleByGroup,
    toExportCsv
};
