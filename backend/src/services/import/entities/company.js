"use strict";

const { foldKey } = require("../mapping.service");

// ----------------------------------------------------
// Firmen (Import-Definition)
// ----------------------------------------------------
//
// Längen und Pflichtfelder entsprechen models/company.model.js.
//
// Kundennummern werden NIE aus der Datei übernommen. Das CRM vergibt
// sie selbst. Firmen werden über den Firmennamen wiedererkannt.

const STATUS_VALUES = {

    active: "active",
    aktiv: "active",
    kunde: "active",

    prospect: "prospect",
    interessent: "prospect",
    lead: "prospect",

    inactive: "inactive",
    inaktiv: "inactive",
    ehemalig: "inactive"

};

const STREET_WITH_NUMBER =
    /^(.*\S)\s+(\d+\s*[a-zA-Z]?(?:\s*[-–/]\s*\d+\s*[a-zA-Z]?)?)$/;

const fields = [

    {
        key: "companyName",
        label: "Firma",
        required: true,
        min: 2,
        max: 100,
        synonyms: ["Firmenname", "Unternehmen", "Company", "Company Name", "Kundenname", "Organisation", "Name"]
    },

    {
        key: "status",
        label: "Status",
        parse: (value) => STATUS_VALUES[foldKey(value)] || null,
        synonyms: ["Kundenstatus"]
    },

    {
        key: "street",
        label: "Straße",
        max: 100,
        synonyms: ["Strasse", "Str", "Street", "Anschrift", "Adresse", "Address"]
    },

    {
        key: "houseNumber",
        label: "Hausnummer",
        max: 20,
        synonyms: ["Hausnr", "Hnr", "House Number"]
    },

    {
        key: "postalCode",
        label: "PLZ",
        max: 10,
        synonyms: ["Postleitzahl", "Zip", "Zip Code", "Postal Code", "Postcode"]
    },

    {
        key: "city",
        label: "Ort",
        max: 100,
        synonyms: ["Stadt", "City", "Wohnort", "Standort"]
    },

    {
        key: "country",
        label: "Land",
        max: 100,
        synonyms: ["Country", "Staat"]
    },

    {
        key: "phone",
        label: "Telefon",
        max: 30,
        synonyms: ["Tel", "Telefonnummer", "Phone", "Telefonnr", "Rufnummer", "Festnetz"]
    },

    {
        key: "email",
        label: "E-Mail",
        type: "email",
        max: 100,
        synonyms: ["Email", "E-Mail-Adresse", "Mail", "Email Address"]
    },

    {
        key: "website",
        label: "Website",
        type: "url",
        max: 255,
        synonyms: ["Web", "Homepage", "URL", "Webseite", "Internet", "www"]
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

function buildLookups(companies) {

    const byName = new Map();

    for (const company of companies) {

        if (company.isDeleted) {
            continue;
        }

        const key = company.companyName.trim().toLowerCase();

        byName.set(key, [...(byName.get(key) || []), company]);

    }

    return { byName };

}

// ----------------------------------------------------
// Definition
// ----------------------------------------------------

const entity = {

    key: "companies",
    label: "Firmen",
    singular: "Firma",
    icon: "bi-building",

    fields,

    // Prüfung der Spaltenzuordnung
    checkMapping(mappedKeys) {

        return mappedKeys.has("companyName")
            ? []
            : ["Bitte ordnen Sie mindestens die Spalte „Firma“ zu."];

    },

    // "Musterstraße 12a" in Straße und Hausnummer aufteilen,
    // wenn keine eigene Hausnummer-Spalte zugeordnet ist.
    postProcess(data, { mappedKeys }) {

        if (data.street && !mappedKeys.has("houseNumber")) {

            const match = data.street.match(STREET_WITH_NUMBER);

            if (match) {

                data.street = match[1];
                data.houseNumber = match[2].replace(/\s+/g, "");

            }

        }

    },

    describe(data) {

        return data.companyName || "(ohne Firmenname)";

    },

    // Schlüssel zum Erkennen doppelter Zeilen innerhalb der Datei
    fileKeys(data) {

        return [`name:${data.companyName.toLowerCase()}`];

    },

    buildLookups,

    async loadLookups() {

        const Company = require("../../../models/company.model");

        const companies = await Company
            .find({}, "customerNumber companyName isDeleted")
            .lean();

        return buildLookups(companies);

    },

    // Entscheidet: neu anlegen, aktualisieren, überspringen oder Fehler
    decide(data, lookups, { duplicates }) {

        const matches = lookups.byName.get(data.companyName.toLowerCase()) || [];

        if (matches.length > 1) {

            return {
                action: "error",
                message: "Der Firmenname ist im CRM mehrfach vorhanden. " +
                    "Bitte diese Firma manuell pflegen."
            };

        }

        if (matches.length === 0) {
            return { action: "create" };
        }

        const existing = matches[0];

        const note = `Existiert bereits (${existing.customerNumber}).`;

        return duplicates === "update"
            ? { action: "update", existingId: existing._id, message: note }
            : { action: "skip", existingId: existing._id, message: note };

    },

    async apply(item) {

        const Company = require("../../../models/company.model");
        const counterService = require("../../counter.service");

        const d = item.data;

        const address = compact({
            street: d.street,
            houseNumber: d.houseNumber,
            postalCode: d.postalCode,
            city: d.city,
            country: d.country
        });

        if (item.action === "create") {

            // Die Kundennummer vergibt immer das CRM
            const customerNumber = await counterService.next("company", "CUS");

            await Company.create({

                customerNumber,
                companyName: d.companyName,
                status: d.status || "prospect",
                phone: d.phone,
                email: d.email,
                website: d.website,
                notes: d.notes,
                address,
                isDeleted: false

            });

            return;

        }

        // Aktualisieren: nur Felder überschreiben, die in der Datei
        // einen Wert haben. Leere Zellen löschen nichts.
        const set = compact({
            companyName: d.companyName,
            status: d.status,
            phone: d.phone,
            email: d.email,
            website: d.website,
            notes: d.notes
        });

        for (const [key, value] of Object.entries(address)) {
            set[`address.${key}`] = value;
        }

        await Company.updateOne(
            { _id: item.existingId, isDeleted: false },
            { $set: set },
            { runValidators: true }
        );

    }

};

module.exports = entity;
