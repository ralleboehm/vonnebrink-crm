const rateLimit = require("express-rate-limit");

// ----------------------------------------------------
// Login-Begrenzung (Schutz vor Brute-Force-Angriffen)
// ----------------------------------------------------
//
// Pro IP-Adresse sind 10 fehlgeschlagene Anmeldeversuche
// innerhalb von 15 Minuten erlaubt. Erfolgreiche Anmeldungen
// (Weiterleitung per Redirect) werden nicht mitgezählt.
//
// Hinweis: Läuft die App hinter einem Reverse Proxy (nginx etc.),
// muss in app.js zusätzlich `app.set("trust proxy", 1)` gesetzt
// werden, sonst sehen alle Besucher wie dieselbe IP aus.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

function createLoginLimiter({ view, title }) {

    return rateLimit({

        windowMs: WINDOW_MS,
        limit: MAX_FAILED_ATTEMPTS,

        standardHeaders: true,
        legacyHeaders: false,

        skipSuccessfulRequests: true,

        // Ein erfolgreicher Login antwortet mit einem Redirect (3xx),
        // ein fehlgeschlagener rendert die Login-Seite mit Status 200.
        requestWasSuccessful: (req, res) =>
            res.statusCode >= 300 && res.statusCode < 400,

        handler(req, res) {

            res.status(429).render(view, {
                title,
                error: "Zu viele fehlgeschlagene Anmeldeversuche. " +
                    "Bitte versuchen Sie es in 15 Minuten erneut."
            });

        }

    });

}

exports.crmLoginLimiter = createLoginLimiter({
    view: "auth/login",
    title: "Anmeldung"
});

exports.portalLoginLimiter = createLoginLimiter({
    view: "portal/login",
    title: "Kundenportal"
});
