const portalAccountService = require("../../services/portalAccount.service");
const notificationService = require("../../services/notification.service");
const emailService = require("../../services/email.service");
const { setFlash } = require("../../core/http/flash");

function staffName(req) {

    const user = req.session.user || {};

    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "";

}

/**
 * Zugangsdaten per E-Mail schicken, wenn angehakt – und Bescheid geben
 */
async function mailAccess(req, kind, temporaryPassword) {

    if (!req.body || req.body.sendEmail !== "on") return;

    const outcome = await notificationService.portalAccess(kind, req.params.id, {
        temporaryPassword,
        agentName: staffName(req)
    });

    const email = outcome && outcome.result && outcome.result.email;

    if (!email) {
        setFlash(req, "warning", "Keine E-Mail verschickt: Der Kontakt hat keine E-Mail-Adresse. Bitte das Passwort persönlich weitergeben.");
    } else if (!emailService.isConfigured()) {
        setFlash(req, "warning", `Mailversand ist nicht eingerichtet – an ${email} wurde nichts verschickt. Bitte das Passwort persönlich weitergeben.`);
    } else {
        setFlash(req, "success", `Die Zugangsdaten werden per E-Mail an ${email} geschickt (siehe E-Mail-Protokoll).`);
    }

}

// ----------------------------------------------------
// Portalzugang erstellen
// ----------------------------------------------------

exports.create = async (req, res, next) => {

    try {

        const result = await portalAccountService.createForContact(
            req.params.id
        );

        req.session.generatedPortalPassword = result.temporaryPassword;

        await mailAccess(req, "welcome", result.temporaryPassword);

        res.redirect(`/crm/contacts/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Portalzugang aktivieren
// ----------------------------------------------------

exports.activate = async (req, res, next) => {

    try {

        await portalAccountService.activate(req.params.id);

        res.redirect(`/crm/contacts/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Portalzugang deaktivieren
// ----------------------------------------------------

exports.deactivate = async (req, res, next) => {

    try {

        await portalAccountService.deactivate(req.params.id);

        res.redirect(`/crm/contacts/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Passwort zurücksetzen
// ----------------------------------------------------

exports.resetPassword = async (req, res, next) => {

    try {

        const result = await portalAccountService.resetPassword(
            req.params.id
        );

        req.session.generatedPortalPassword = result.temporaryPassword;

        await mailAccess(req, "reset", result.temporaryPassword);

        res.redirect(`/crm/contacts/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};