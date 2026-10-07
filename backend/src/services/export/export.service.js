"use strict";

const { toCsv } = require("./csvWriter");

// ----------------------------------------------------
// Export-Definitionen
// ----------------------------------------------------
//
// Die Spaltenüberschriften sind so gewählt, dass der Import sie beim
// Zuordnen automatisch wiedererkennt (Export -> Import funktioniert).

const COMPANY_STATUS = {
    prospect: "Interessent",
    active: "Aktiv",
    inactive: "Inaktiv"
};

const CONTACT_STATUS = {
    active: "Aktiv",
    inactive: "Inaktiv"
};

const SALUTATION = {
    mr: "Herr",
    mrs: "Frau",
    diverse: "Divers"
};

function formatDate(value) {

    if (!value) {
        return "";
    }

    return new Date(value).toLocaleDateString("de-DE", {
        timeZone: "Europe/Berlin",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

}

const definitions = {

    companies: {

        key: "companies",
        label: "Firmen",
        filename: "firmen",

        statuses: [
            { value: "prospect", label: COMPANY_STATUS.prospect },
            { value: "active", label: COMPANY_STATUS.active },
            { value: "inactive", label: COMPANY_STATUS.inactive }
        ],

        columns: [
            { key: "customerNumber", label: "Kundennummer", get: (c) => c.customerNumber },
            { key: "companyName", label: "Firma", get: (c) => c.companyName },
            { key: "status", label: "Status", get: (c) => COMPANY_STATUS[c.status] || c.status },
            { key: "street", label: "Straße", get: (c) => c.address?.street },
            { key: "houseNumber", label: "Hausnummer", get: (c) => c.address?.houseNumber },
            { key: "postalCode", label: "PLZ", get: (c) => c.address?.postalCode },
            { key: "city", label: "Ort", get: (c) => c.address?.city },
            { key: "country", label: "Land", get: (c) => c.address?.country },
            { key: "phone", label: "Telefon", get: (c) => c.phone },
            { key: "email", label: "E-Mail", get: (c) => c.email },
            { key: "website", label: "Website", get: (c) => c.website },
            { key: "notes", label: "Notizen", get: (c) => c.notes },
            { key: "createdAt", label: "Erstellt am", get: (c) => formatDate(c.createdAt) }
        ],

        async fetch({ status }) {

            const Company = require("../../models/company.model");

            const filter = { isDeleted: false };

            if (status) {
                filter.status = status;
            }

            return await Company.find(filter).sort({ companyName: 1 }).lean();

        }

    },

    contacts: {

        key: "contacts",
        label: "Kontakte",
        filename: "kontakte",

        statuses: [
            { value: "active", label: CONTACT_STATUS.active },
            { value: "inactive", label: CONTACT_STATUS.inactive }
        ],

        columns: [
            { key: "contactNumber", label: "Kontaktnummer", get: (c) => c.contactNumber },
            { key: "companyName", label: "Firma", get: (c) => c.company?.companyName },
            { key: "companyNumber", label: "Kundennummer", get: (c) => c.company?.customerNumber },
            { key: "salutation", label: "Anrede", get: (c) => SALUTATION[c.salutation] || "" },
            { key: "firstName", label: "Vorname", get: (c) => c.firstName },
            { key: "lastName", label: "Nachname", get: (c) => c.lastName },
            { key: "position", label: "Position", get: (c) => c.position },
            { key: "email", label: "E-Mail", get: (c) => c.email },
            { key: "phone", label: "Telefon", get: (c) => c.phone },
            { key: "mobile", label: "Mobil", get: (c) => c.mobile },
            { key: "status", label: "Status", get: (c) => CONTACT_STATUS[c.status] || c.status },
            { key: "notes", label: "Notizen", get: (c) => c.notes },
            { key: "createdAt", label: "Erstellt am", get: (c) => formatDate(c.createdAt) }
        ],

        async fetch({ status }) {

            const Contact = require("../../models/contact.model");

            const filter = { isDeleted: false };

            if (status) {
                filter.status = status;
            }

            return await Contact
                .find(filter)
                .populate("company", "companyName customerNumber")
                .sort({ lastName: 1, firstName: 1 })
                .lean();

        }

    }

};

/**
 * Wählt gültige Spalten aus (Reihenfolge wie in der Definition).
 * Ohne Auswahl werden alle Spalten exportiert.
 */
function selectColumns(definition, requested) {

    const wanted = new Set([].concat(requested || []).map(String));

    const selected = definition.columns.filter((column) => wanted.has(column.key));

    return selected.length > 0 ? selected : definition.columns;

}

function buildCsv(definition, records, columns) {

    return toCsv(
        columns.map((column) => column.label),
        records.map((record) => columns.map((column) => column.get(record)))
    );

}

function fileName(definition, date = new Date()) {

    const day = date.toISOString().slice(0, 10);

    return `${definition.filename}-${day}.csv`;

}

module.exports = {
    definitions,
    selectColumns,
    buildCsv,
    fileName
};
