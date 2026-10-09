const crypto = require("crypto");

const PortalAccount = require("../models/portalAccount.model");
const Contact = require("../models/contact.model");

// ----------------------------------------------------
// Alle Portalzugänge
// ----------------------------------------------------

exports.getAll = () => {

    return PortalAccount.find()
        .populate({
            path: "contact",
            populate: {
                path: "company"
            }
        });

};

// ----------------------------------------------------
// Portalzugang nach ID
// ----------------------------------------------------

exports.getById = (id) => {

    return PortalAccount.findById(id)
        .populate({
            path: "contact",
            populate: {
                path: "company"
            }
        });

};

// ----------------------------------------------------
// Portalzugang über Kontakt
// ----------------------------------------------------

exports.getByContact = (contactId) => {

    return PortalAccount.findOne({
        contact: contactId
    });

};

// ----------------------------------------------------
// Portalzugang für Kontakt erstellen
// ----------------------------------------------------

exports.createForContact = async (contactId) => {

    const contact = await Contact.findById(contactId);

    if (!contact) {
        throw new Error("CONTACT_NOT_FOUND");
    }

    const existing = await PortalAccount.findOne({
        contact: contact._id
    });

    if (existing) {
        throw new Error("PORTAL_ACCOUNT_EXISTS");
    }

    const temporaryPassword = crypto
        .randomBytes(12)
        .toString("base64")
        .replace(/[+/=]/g, "")
        .substring(0, 16);

    const portalAccount = await PortalAccount.create({

        contact: contact._id,

        email: contact.email,

        password: temporaryPassword,

        active: true,

        mustChangePassword: true

    });

    return {

        portalAccount,
        temporaryPassword

    };

};

// ----------------------------------------------------
// Portalzugang aktivieren
// ----------------------------------------------------

exports.activate = async (contactId) => {

    return PortalAccount.findOneAndUpdate(

        {
            contact: contactId
        },

        {
            active: true
        },

        {
            returnDocument: "after"
        }

    );

};

// ----------------------------------------------------
// Portalzugang deaktivieren
// ----------------------------------------------------

exports.deactivate = async (contactId) => {

    return PortalAccount.findOneAndUpdate(

        {
            contact: contactId
        },

        {
            active: false
        },

        {
            returnDocument: "after"
        }

    );

};

// ----------------------------------------------------
// Passwort zurücksetzen
// ----------------------------------------------------

exports.resetPassword = async (contactId) => {

    const portalAccount = await PortalAccount.findOne({

        contact: contactId

    });

    if (!portalAccount) {
        throw new Error("PORTAL_ACCOUNT_NOT_FOUND");
    }

    const temporaryPassword = crypto
        .randomBytes(12)
        .toString("base64")
        .replace(/[+/=]/g, "")
        .substring(0, 16);

    portalAccount.password = temporaryPassword;
    portalAccount.mustChangePassword = true;

    await portalAccount.save();

    return {

        portalAccount,
        temporaryPassword

    };

};
// ----------------------------------------------------
// Passwort ändern
// ----------------------------------------------------

exports.changePassword = async (accountId, password) => {

    const portalAccount = await PortalAccount.findById(accountId);

    if (!portalAccount) {

        throw new Error("PORTAL_ACCOUNT_NOT_FOUND");

    }

    portalAccount.password = password;

    portalAccount.mustChangePassword = false;

    portalAccount.failedLoginAttempts = 0;

    portalAccount.lockedUntil = null;

    await portalAccount.save();

    return portalAccount;

};

// ----------------------------------------------------
// Letzte Anmeldung aktualisieren
// ----------------------------------------------------

exports.updateLastLogin = async (id) => {

    return PortalAccount.findByIdAndUpdate(

        id,

        {
            lastLogin: new Date()
        },

        {
            returnDocument: "after"
        }

    );

};

// ----------------------------------------------------
// E-Mail mit Kontakt synchronisieren
// ----------------------------------------------------

exports.updateEmail = async (contactId, email) => {

    return PortalAccount.findOneAndUpdate(

        {
            contact: contactId
        },

        {
            email: email.toLowerCase()
        },

        {
            returnDocument: "after"
        }

    );

};

// ----------------------------------------------------
// Portalzugang löschen
// ----------------------------------------------------

exports.delete = (id) => {

    return PortalAccount.findByIdAndDelete(id);

};

// Einheitliche Namen (findAll, findById, delete) zusätzlich zu den bisherigen
require("../core/service/crudAliases").applyCrudAliases(exports);
