"use strict";

// ----------------------------------------------------
// Autoren auflösen (CRM-Benutzer ODER Portal-Zugang)
// ----------------------------------------------------
//
// Nachrichten, Anhänge und Tickets speichern nur die ID des Autors.
// Diese ID gehört entweder zu einem CRM-Benutzer (Mitarbeiter) oder zu
// einem Portalzugang (Kunde). Der Name des Kunden steht im Kontakt
// des Portalzugangs.
//
// Ergebnis je Autor:
//   { _id, firstName, lastName, kind: "staff" | "customer" | "unknown" }

function defaultModels() {

    return {
        User: require("../models/user.model"),
        PortalAccount: require("../models/portalAccount.model")
    };

}

const UNKNOWN = Object.freeze({
    firstName: "Unbekannter",
    lastName: "Benutzer",
    kind: "unknown"
});

/**
 * @param {Array} ids  Autor-IDs (ObjectId oder String, Duplikate erlaubt)
 * @returns {Promise<Map<string, object>>}  ID (String) -> Autor
 */
async function resolve(ids, models = defaultModels()) {

    const unique = [...new Set(
        ids.filter(Boolean).map((id) => String(id))
    )];

    const result = new Map();

    if (unique.length === 0) {
        return result;
    }

    const users = await models.User
        .find({ _id: { $in: unique } }, "firstName lastName")
        .lean();

    for (const user of users) {

        result.set(String(user._id), {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            kind: "staff"
        });

    }

    const rest = unique.filter((id) => !result.has(id));

    if (rest.length) {

        const accounts = await models.PortalAccount
            .find({ _id: { $in: rest } }, "contact email")
            .populate("contact", "firstName lastName")
            .lean();

        for (const account of accounts) {

            const contact = account.contact;

            result.set(String(account._id), {
                _id: account._id,
                firstName: contact && contact.firstName ? contact.firstName : (account.email || "Kunde"),
                lastName: contact && contact.lastName ? contact.lastName : "",
                kind: "customer"
            });

        }

    }

    return result;

}

/**
 * Ersetzt in einer Liste von (lean-)Objekten das Feld `field`
 * (eine ID) durch den aufgelösten Autor.
 */
async function attach(items, field, models) {

    const authors = await resolve(items.map((item) => item[field]), models);

    return items.map((item) => ({

        ...item,

        [field]: authors.get(String(item[field])) || { ...UNKNOWN }

    }));

}

/**
 * Ein einzelner Autor (oder null, wenn keine ID vorhanden ist).
 */
async function describe(id, models) {

    if (!id) {
        return null;
    }

    const authors = await resolve([id], models);

    return authors.get(String(id)) || { ...UNKNOWN };

}

module.exports = { resolve, attach, describe, UNKNOWN };
