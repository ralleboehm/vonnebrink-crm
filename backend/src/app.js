const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const session = require("express-session");

const routes = require("./routes");

const viewData = require("./middleware/viewData.middleware");
const { requireAuth } = require("./middleware/auth.middleware");

const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// ----------------------------------------------------
// Security & Middleware
// ----------------------------------------------------

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(morgan("dev"));

// ----------------------------------------------------
// View Engine
// ----------------------------------------------------

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

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

// ----------------------------------------------------
// Authentifizierung
// ----------------------------------------------------

app.use((req, res, next) => {

    if (
        req.path === "/login" ||
        req.path === "/logout" ||
        req.path.startsWith("/css") ||
        req.path.startsWith("/js") ||
        req.path.startsWith("/images") ||
        req.path === "/favicon.ico"
    ) {
        return next();
    }

    requireAuth(req, res, next);

});

// ----------------------------------------------------
// Geschützte Routen
// ----------------------------------------------------

app.use("/", routes);

// ----------------------------------------------------
// Fehlerbehandlung
// ----------------------------------------------------

app.use(notFound);
app.use(errorHandler);

module.exports = app;