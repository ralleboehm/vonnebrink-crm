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

    // Wer sieht die Seite? Kunden (Portal, Links aus E-Mails) bekommen auf
    // Anmelde-, Fehler- und Hinweisseiten das helle Portal-Design, das
    // CRM das dunkle (layouts/guest.pug).
    res.locals.audience = /^\/(portal|email)(\/|$)/.test(res.locals.currentPath) ? "customer" : "crm";

    // Ziel des "Zurück"-Links auf Fehlerseiten
    res.locals.homeUrl = req.originalUrl.startsWith("/portal")
        ? "/portal"
        : "/crm";

    next();

};
