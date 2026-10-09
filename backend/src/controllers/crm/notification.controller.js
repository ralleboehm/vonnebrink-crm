const notificationService = require("../../services/notification.service");
const labels = require("../../utils/assetLabels");

/**
 * Nur interne Ziele zulassen (kein Weiterleiten auf fremde Seiten)
 */
function safeTarget(value, fallback = "/crm/notifications") {

    if (typeof value !== "string") return fallback;

    const target = value.trim();

    if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
        return fallback;
    }

    return target;

}

/**
 * Übersicht aller Benachrichtigungen
 */
exports.index = async (req, res, next) => {

    try {

        const unreadOnly = req.query.filter === "unread";

        const result = await notificationService.getPage(req.session.user.id, {
            page: req.query.page,
            perPage: 25,
            unreadOnly
        });

        res.render("notifications/index", {
            title: "Benachrichtigungen",
            result,
            unreadOnly,
            labels
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Benachrichtigung öffnen: als gelesen markieren und zum Ziel springen
 */
exports.open = async (req, res, next) => {

    try {

        const notification = await notificationService.markAsRead(
            req.params.id,
            req.session.user.id
        );

        if (!notification) {
            return res.redirect("/crm/notifications");
        }

        res.redirect(safeTarget(notification.link));

    } catch (err) {

        next(err);

    }

};

/**
 * Als gelesen markieren (ohne zu springen)
 */
exports.markAsRead = async (req, res, next) => {

    try {

        await notificationService.markAsRead(req.params.id, req.session.user.id);

        res.redirect(safeTarget(req.body.returnTo));

    } catch (err) {

        next(err);

    }

};

/**
 * Alle als gelesen markieren
 */
exports.markAllAsRead = async (req, res, next) => {

    try {

        await notificationService.markAllAsRead(req.session.user.id);

        res.redirect(safeTarget(req.body.returnTo));

    } catch (err) {

        next(err);

    }

};

exports._safeTarget = safeTarget;
