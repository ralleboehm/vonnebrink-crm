const { can } = require("../core/permissions");

module.exports = (req, res, next) => {

    res.locals.session = req.session;

    // CRM
    res.locals.currentUser = req.session.user || null;

    // Rechteprüfung in Views: if can("users.manage")
    res.locals.can = (permission) => can(req.session.user, permission);

    // Kundenportal
    res.locals.currentPortalUser = req.session.portalUser || null;

    // Aktueller Pfad (z. B. für den aktiven Menüpunkt)
    res.locals.currentPath = req.originalUrl.split("?")[0];

    // Ziel des "Zurück"-Links auf Fehlerseiten
    res.locals.homeUrl = req.originalUrl.startsWith("/portal")
        ? "/portal"
        : "/crm";

    next();

};
