// ----------------------------------------------------
// Anmeldung für das Kundenportal erforderlich
// ----------------------------------------------------

exports.requirePortalAuth = (req, res, next) => {

    if (!req.session.user) {

        return res.redirect("/portal/login");

    }

    if (req.session.user.role !== "portal") {

        return res.redirect("/portal/login");

    }

    next();

};