const notificationService = require("../../services/notification.service");
const labels = require("../../utils/assetLabels");

const BELL_LIMIT = 6;

// ----------------------------------------------------
// Daten für die Glocke in der Navigation
// ----------------------------------------------------
//
// Lädt für angemeldete CRM-Benutzer die Zahl der ungelesenen und die
// neuesten Benachrichtigungen. Nur bei Seitenaufrufen (GET, HTML), nicht
// bei Formularen, Downloads oder JSON-Anfragen.
//
// Ein Fehler hier darf keine Seite verhindern: dann bleibt die Glocke leer.

module.exports = async (req, res, next) => {

    res.locals.notificationBell = null;

    const user = req.session && req.session.user;

    if (!user || req.method !== "GET" || req.xhr || !req.accepts("html")) {
        return next();
    }

    try {

        const [unreadCount, recent] = await Promise.all([
            notificationService.countUnread(user.id),
            notificationService.getRecent(user.id, BELL_LIMIT)
        ]);

        res.locals.notificationBell = {
            unreadCount,
            recent,
            timeAgo: labels.timeAgo,
            returnTo: req.originalUrl
        };

    } catch (err) {

        console.error("Glocke: Benachrichtigungen nicht ladbar:", err.message);

    }

    next();

};
