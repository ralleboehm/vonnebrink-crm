const express = require("express");
const path = require("path");
const helmet = require("helmet");
const morgan = require("morgan");
const { morganStream } = require("./core/logging/timestamps");
const session = require("express-session");

const crmRoutes = require("./routes/crm");
const portalRoutes = require("./routes/portal");

const viewData = require("./middleware/viewData.middleware");

const { requireAuth } = require("./middleware/auth/crmAuth.middleware");

const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// ----------------------------------------------------
// Konfigurationsprüfung
// ----------------------------------------------------

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production.");
}

// ----------------------------------------------------
// Security & Middleware
// ----------------------------------------------------

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(express.json());

// Formulare. Ausnahme: Kampagnen-Editor (eingebettete Bilder, größeres
// Limit) – der liest sein Formular erst nach der Anmeldung selbst,
// siehe routes/crm/campaign.routes.js.
const formParser = express.urlencoded({ extended: true });

app.use((req, res, next) => {

    if (req.path.startsWith("/crm/marketing/campaigns")) return next();

    formParser(req, res, next);

});

// Request-Zeilen mit Datum und Uhrzeit
app.use(morgan("dev", { stream: morganStream() }));

// ----------------------------------------------------
// View Engine
// ----------------------------------------------------

app.set("view engine", "pug");

app.set("views", [
    path.join(__dirname, "views/crm"),
    path.join(__dirname, "views/portal"),
    path.join(__dirname, "views")
]);

// ----------------------------------------------------
// Hinter nginx (VPS)
// ----------------------------------------------------
//
// nginx auf demselben Server reicht https und die echte Besucher-IP weiter
// (X-Forwarded-Proto / X-Forwarded-For). Nur Anfragen von 127.0.0.1 wird
// das geglaubt – nötig für sichere Cookies und die Login-Sperre je IP.

app.set("trust proxy", (process.env.TRUST_PROXY || "").trim() || "loopback");

// ----------------------------------------------------
// Static Files
// ----------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

// ----------------------------------------------------
// Sessions
// ----------------------------------------------------

app.use(
    session({
        name: "vonnebrink.sid",
        secret: process.env.SESSION_SECRET || "development-secret",
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);

// ----------------------------------------------------
// Globale View-Daten
// ----------------------------------------------------

app.use(viewData);

// ----------------------------------------------------
// Öffentliche Routen
// ----------------------------------------------------

app.use("/health", require("./routes/health.routes"));

// Links aus E-Mails: Abmelden, Double-Opt-In bestätigen (ohne Anmeldung)
app.use("/email", require("./routes/public/email.routes"));

// ----------------------------------------------------
// CRM schützen
// ----------------------------------------------------

app.use("/crm", (req, res, next) => {

    const publicRoutes = [
        "/login",
        "/logout"
    ];

    if (publicRoutes.includes(req.path)) {
        return next();
    }

    requireAuth(req, res, next);

});

// ----------------------------------------------------
// Anwendungen
// ----------------------------------------------------

app.use("/crm", crmRoutes);
app.use("/portal", portalRoutes);

// ----------------------------------------------------
// Fehlerbehandlung
// ----------------------------------------------------

app.use(notFound);

app.use(errorHandler);

module.exports = app;