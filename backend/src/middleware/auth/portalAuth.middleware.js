// ----------------------------------------------------
// Anmeldung für das Kundenportal erforderlich
// ----------------------------------------------------

exports.requirePortalAuth = (req, res, next) => {

    if (!req.session.portalUser) {

        return res.redirect("/portal/login");

    }

    // ----------------------------------------------------
    // Passwort muss zuerst geändert werden
    // ----------------------------------------------------

    if (

        req.session.portalUser.mustChangePassword &&

        req.path !== "/password" &&

        req.path !== "/logout"

    ) {

        return res.redirect("/portal/profile/password");

    }

    next();

};