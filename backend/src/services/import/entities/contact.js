"use strict";

const { foldKey } = require("../mapping.service");

// ----------------------------------------------------
// Kontakte (Import-Definition)
// ----------------------------------------------------
//
// Längen und Pflichtfelder entsprechen models/contact.model.js.
// Eindeutiger Schlüssel eines Kontakts ist die E-Mail-Adresse.
// Kontaktnummern vergibt das CRM. Die Firma wird über den Firmennamen
// gefunden, Kundennummern aus der Datei werden nicht verwendet.

const SALUTATIONS = {

    mr: "mr",
    herr: "mr",
    hr: "mr",
    m: "mr",

    mrs: "mrs",
    frau: "mrs",
    fr: "mrs",
    f: "mrs",
    ms: "mrs",

    diverse: "diverse",
    divers: "diverse",
    d: "diverse"

};

const STATUS_VALUES = {

    active: "active",
    aktiv: "active",

    inactive: "inactive",
    inaktiv: "inactive",
    ehemalig: "inactive"

};

const fields = [

    {
        key: "companyName",
        label: "Firma",
        synonyms: ["Firmenname", "Unternehmen", "Company", "Company Name", "Organisation"]
    },

    {
        key: "salutation",
        label: "Anrede",
        parse: (value) => SALUTATIONS[foldKey(value)] || null,
        synonyms: ["Salutation"]
    },

    {
        key: "firstName",
        label: "Vorname",
        required: true,
        min: 2,
        max: 100,
        synonyms: ["First Name", "Firstname", "Given Name"]
    },

    {
        key: "lastName",
        label: "Nachname",
        required: true,
        min: 2,
        max: 100,
        synonyms: ["Familienname", "Last Name", "Lastname", "Surname"]
    },

    {
        key: "fullName",
        label: "Vollständiger Name",
        synonyms: ["Name", "Ansprechpartner", "Kontaktperson", "Full Name", "Ansprechperson"]
    },

    {
        key: "position",
        label: "Position",
        max: 255,
        synonyms: ["Funktion", "Rolle", "Job Title", "Jobtitel"]
    },

    {
        key: "email",
        label: "E-Mail",
        type: "email",
        required: true,
        max: 255,
        synonyms: ["Email", "E-Mail-Adresse", "Mail", "Email Address"]
    },

    {
        key: "phone",
        label: "Telefon",
        max: 30,
        synonyms: ["Tel", "Telefonnummer", "Phone", "Durchwahl", "Festnetz"]
    },

    {
        key: "mobile",
        label: "Mobil",
        max: 30,
        synonyms: ["Mobilnummer", "Handy", "Handynummer", "Mobile", "Mobiltelefon", "Cell"]
    },

    {
        key: "status",
        label: "Status",
        parse: (value) => STATUS_VALUES[foldKey(value)] || null,
        synonyms: []
    },

    {
        key: "notes",
        label: "Notizen",
        synonyms: ["Notiz", "Bemerkung", "Bemerkungen", "Anmerkung", "Kommentar", "Notes", "Note", "Hinweise"]
    }

];

// ----------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------

function compact(object) {

    const result = {};

    for (const [key, value] of Object.entries(object)) {

        if (value !== undefined && value !== "") {
            result[key] = value;
        }

    }

    return result;

}

/**
 * "Müller, Hans" -> Nachname Müller, Vorname Hans
 * "Hans Peter Müller" -> Vorname "Hans Peter", Nachname Müller
 */
function splitFullName(fullName) {

    if (fullName.includes(",")) {

        const [last, ...rest] = fullName.split(",");

        return {
            firstName: rest.join(",").trim(),
            lastName: last.trim()
        };

    }

    const parts = fullName.split(/\s+/);

    if (parts.length < 2) {
        return { firstName: "", lastName: fullName };
    }

    return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1]
    };

}

function buildLookups(companies, contacts) {

    const companyByName = new Map();

    for (const company of companies) {

        if (company.isDeleted) {
            continue;
        }

        const key = company.companyName.trim().toLowerCase();

        companyByName.set(key, [...(companyByName.get(key) || []), company]);

    }

    const contactByEmail = new Map();

    for (const contact of contacts) {
        contactByEmail.set(contact.email.toLowerCase(), contact);
    }

    return { companyByName, contactByEmail };

}

// ----------------------------------------------------
// Definition
// ----------------------------------------------------

const entity = {

    key: "contacts",
    label: "Kontakte",
    singular: "Kontakt",
    icon: "bi-person",

    fields,

    checkMapping(mappedKeys) {

        const errors = [];

        if (!mappedKeys.has("companyName")) {

            errors.push(
                "Bitte ordnen Sie die Spalte „Firma“ zu, " +
                "damit jeder Kontakt einer Firma zugewiesen werden kann."
            );

        }

        if (!mappedKeys.has("email")) {
            errors.push("Bitte ordnen Sie die Spalte „E-Mail“ zu.");
        }

        const hasName =
            mappedKeys.has("fullName") ||
            (mappedKeys.has("firstName") && mappedKeys.has("lastName"));

        if (!hasName) {

            errors.push(
                "Bitte ordnen Sie „Vorname“ und „Nachname“ zu " +
                "(oder eine Spalte mit dem vollständigen Namen)."
            );

        }

        return errors;

    },

    postProcess(data) {

        if (data.fullName && !data.firstName && !data.lastName) {

            const { firstName, lastName } = splitFullName(data.fullName);

            if (firstName) {
                data.firstName = firstName;
            }

            data.lastName = lastName;

        }

        delete data.fullName;

    },

    validate(data) {

        const errors = [];

        if (!data.companyName) {
            errors.push("Die Firma fehlt.");
        }

        return errors;

    },

    describe(data) {

        const name = [data.firstName, data.lastName].filter(Boolean).join(" ");

        if (name && data.email) {
            return `${name} <${data.email}>`;
        }

        return name || data.email || "(ohne Name)";

    },

    fileKeys(data) {
        return [`email:${data.email}`];
    },

    buildLookups,

    async loadLookups() {

        const Company = require("../../../models/company.model");
        const Contact = require("../../../models/contact.model");

        const [companies, contacts] = await Promise.all([
            Company.find({}, "companyName isDeleted").lean(),
            Contact.find({}, "email isDeleted").lean()
        ]);

        return buildLookups(companies, contacts);

    },

    decide(data, lookups, { duplicates }) {

        // 1. Firma bestimmen (über den Firmennamen)
        const matches =
            lookups.companyByName.get(data.companyName.toLowerCase()) || [];

        if (matches.length === 0) {

            return {
                action: "error",
                message: `Firma „${data.companyName}" nicht gefunden. ` +
                    "Bitte zuerst die Firmen importieren."
            };

        }

        if (matches.length > 1) {

            return {
                action: "error",
                message: `Der Firmenname „${data.companyName}" ist im CRM mehrfach vorhanden. ` +
                    "Bitte diesen Kontakt manuell zuordnen."
            };

        }

        const company = matches[0];

        // 2. Gibt es den Kontakt schon? (Schlüssel: E-Mail)
        const existing = lookups.contactByEmail.get(data.email) || null;

        if (!existing) {
            return { action: "create", companyId: company._id };
        }

        if (existing.isDeleted) {

            return {
                action: "error",
                message: "Ein gelöschter Kontakt mit dieser E-Mail-Adresse existiert bereits."
            };

        }

        return duplicates === "update"
            ? {
                action: "update",
                existingId: existing._id,
                companyId: company._id,
                message: "Kontakt existiert bereits (gleiche E-Mail)."
            }
            : {
                action: "skip",
                existingId: existing._id,
                companyId: company._id,
                message: "Kontakt existiert bereits (gleiche E-Mail)."
            };

    },

    async apply(item) {

        const Contact = require("../../../models/contact.model");
        const counterService = require("../../counter.service");

        const d = item.data;

        if (item.action === "create") {

            const contactNumber = await counterService.next("contact", "CON");

            await Contact.create({

                company: item.companyId,
                contactNumber,
                salutation: d.salutation,
                firstName: d.firstName,
                lastName: d.lastName,
                position: d.position,
                email: d.email,
                phone: d.phone,
                mobile: d.mobile,
                status: d.status || "active",
                notes: d.notes,
                isDeleted: false

            });

            return;

        }

        // Aktualisieren: nur Felder mit Wert überschreiben.
        // Die E-Mail ist der Schlüssel und bleibt unverändert.
        const set = compact({
            company: item.companyId,
            salutation: d.salutation,
            firstName: d.firstName,
            lastName: d.lastName,
            position: d.position,
            phone: d.phone,
            mobile: d.mobile,
            status: d.status,
            notes: d.notes
        });

        await Contact.updateOne(
            { _id: item.existingId, isDeleted: false },
            { $set: set },
            { runValidators: true }
        );

    }

};

module.exports = entity;
