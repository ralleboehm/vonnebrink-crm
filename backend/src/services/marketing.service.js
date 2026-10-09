"use strict";

// ----------------------------------------------------
// Marketing: Einwilligungen und erreichbare Empfänger
// ----------------------------------------------------
//
// Regel für Kampagnen – ein Kontakt ist nur erreichbar, wenn
//   1. er einen AKTIVEN Portalzugang hat (dort kann er sich jederzeit
//      selbst abmelden) und
//   2. seine Einwilligung erteilt ist (marketing.status = "granted") und
//   3. der Kontakt aktiv und nicht archiviert ist.
//
// Einwilligungen:
//   - Der Kontakt selbst: im Kundenportal unter "Mein Profil".
//   - Mitarbeiter im CRM: nur mit Angabe, wie die Einwilligung erteilt
//     wurde (Nachweis). Hat der Kontakt sich SELBST im Portal abgemeldet,
//     kann ihn kein Mitarbeiter wieder anmelden – nur er selbst.
//   - Jede Änderung landet im Verlauf (wer, wann, wie, Notiz).

const Contact = require("../models/contact.model");
const Company = require("../models/company.model");
const PortalAccount = require("../models/portalAccount.model");
const { escapeRegex } = require("./search.service");
const { toCsv } = require("./export/csvWriter");

const {
    STATUS_LABELS,
    SOURCE_LABELS,
    consentOf,
    staffMayGrant,
    ineligibleReason,
    isEligible
} = require("../utils/marketingConsent");

const SALUTATIONS = { mr: "Herr", mrs: "Frau", diverse: "" };

// ----------------------------------------------------
// Einwilligung ändern
// ----------------------------------------------------

/**
 * Einwilligung erteilen oder widerrufen.
 *
 * @param {string} contactId
 * @param {boolean} granted
 * @param {{source: "portal"|"crm", by: string, note?: string}} meta
 */
async function setConsent(contactId, granted, { source, by, note } = {}) {

    if (!["portal", "crm"].includes(source)) {
        throw new Error("Unbekannte Quelle für die Einwilligung.");
    }

    const contact = await Contact.findOne({ _id: contactId, isDeleted: false });

    if (!contact) {
        throw new Error("Kontakt nicht gefunden.");
    }

    const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";

    if (granted && source === "crm") {

        if (!staffMayGrant(contact)) {
            const error = new Error("Der Kontakt hat sich selbst im Kundenportal abgemeldet. Nur er selbst kann sich wieder anmelden.");
            error.status = 409;
            throw error;
        }

        if (cleanNote.length < 3) {
            const error = new Error("Bitte angeben, wie die Einwilligung erteilt wurde (z. B. „schriftlich am …“).");
            error.status = 422;
            throw error;
        }

    }

    const status = granted ? "granted" : "revoked";

    // Keine doppelten Einträge, wenn sich nichts ändert
    if (consentOf(contact).status === status) {
        return contact;
    }

    const now = new Date();

    return Contact.findOneAndUpdate(
        { _id: contactId, isDeleted: false },
        {
            $set: {
                "marketing.status": status,
                "marketing.changedAt": now,
                "marketing.source": source
            },
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
        const reason = ineligibleReason(contact, portalAccount);

        return {
            contact,
            company: companyById.get(String(contact.company)) || null,
            portalAccount,
            consent: consentOf(contact),
            eligible: reason === null,
            reason
        };

    });

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
            "E-Mail", "Telefon", "Mobil", "Portalzugang", "Einwilligung", "Für Kampagnen erreichbar", "Grund"
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
            yesNo(row.eligible),
            row.reason || ""
        ])
    );

}

module.exports = {
    STATUS_LABELS,
    SOURCE_LABELS,
    consentOf,
    staffMayGrant,
    ineligibleReason,
    isEligible,
    setConsent,
    listContacts,
    summarize,
    eligibleByGroup,
    toExportCsv
};
