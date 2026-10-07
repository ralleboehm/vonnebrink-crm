module.exports = (req, res, next) => {

    res.locals.session = req.session;

    // CRM
    res.locals.currentUser = req.session.user || null;

    // Kundenportal
    res.locals.currentPortalUser = req.session.portalUser || null;

    // Ziel des "Zurück"-Links auf Fehlerseiten
    res.locals.homeUrl = req.originalUrl.startsWith("/portal")
        ? "/portal"
        : "/crm";

    next();

};
