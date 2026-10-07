const portalAccountService = require("../../services/portalAccount.service");

// ----------------------------------------------------
// Portalzugang erstellen
// ----------------------------------------------------

exports.create = async (req, res, next) => {

    try {

        const result = await portalAccountService.createForContact(
            req.params.id
        );

        req.session.generatedPortalPassword = result.temporaryPassword;

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

        res.redirect(`/crm/contacts/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};