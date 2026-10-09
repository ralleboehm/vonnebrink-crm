const emailLogService = require("../../services/emailLog.service");
const emailService = require("../../services/email.service");
const userService = require("../../services/user.service");
const { setFlash, takeFlash } = require("../../core/http/flash");
const format = require("../../utils/format");

const STATUS_FILTERS = ["sent", "failed", "skipped"];

/**
 * E-Mail-Protokoll
 */
exports.index = async (req, res, next) => {

    try {

        const filters = {
            status: STATUS_FILTERS.includes(req.query.status) ? req.query.status : "",
            search: typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "",
            page: req.query.page
        };

        const [result, stats] = await Promise.all([
            emailLogService.findPage(filters),
            emailLogService.stats(7)
        ]);

        const config = emailService.configFromEnv();

        res.render("email-log/index", {
            title: "E-Mail-Protokoll",
            result,
            stats,
            filters,
            smtp: {
                configured: emailService.isConfigured(),
                host: config.host,
                port: config.port,
                from: config.from
            },
            flash: takeFlash(req),
            format
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Verbindung zum Mailserver prüfen
 */
exports.verify = async (req, res, next) => {

    try {

        const result = await emailService.verify();

        setFlash(req, result.ok ? "success" : "danger", result.message);

        res.redirect("/crm/email-log");

    } catch (err) {

        next(err);

    }

};

/**
 * Test-Mail an den angemeldeten Benutzer
 */
exports.sendTest = async (req, res, next) => {

    try {

        const user = await userService.findById(req.session.user.id);

        if (!user || !user.email) {

            setFlash(req, "warning", "Für Ihren Benutzer ist keine E-Mail-Adresse hinterlegt.");

            return res.redirect("/crm/email-log");

        }

        try {

            const result = await emailService.sendTestEmail(user.email);

            if (result.sent) {
                setFlash(req, "success", `Test-Mail an ${user.email} wurde vom Mailserver angenommen.`);
            } else {
                setFlash(req, "warning", `Test-Mail nicht verschickt: ${result.skipped}.`);
            }

        } catch (err) {

            setFlash(req, "danger", `Test-Mail fehlgeschlagen: ${err.message}`);

        }

        res.redirect("/crm/email-log");

    } catch (err) {

        next(err);

    }

};
