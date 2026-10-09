function errorHandler(err, req, res, next) {

    // Wurde bereits eine Antwort gesendet, übernimmt Express.
    if (res.headersSent) {
        return next(err);
    }

    // Ungültige ObjectId in der URL (z. B. /crm/tickets/abc) ist ein 404.
    let status = err.status || 500;

    if (err.name === "CastError") {
        status = 404;
    }

    // Echte Fehler mit Stacktrace, "nicht gefunden" nur als eine Zeile
    if (status >= 500) {
        console.error("ERROR:", err);
    } else {
        console.warn(`${status} ${req.method} ${req.originalUrl}: ${err.message}`);
    }

    const isProduction = process.env.NODE_ENV === "production";

    // Interne Fehlermeldungen nicht an Besucher weitergeben.
    const message = status >= 500 && isProduction
        ? "Interner Serverfehler"
        : err.message || "Interner Serverfehler";

    res.status(status);

    if (req.accepts(["html", "json"]) === "json") {
        return res.json({
            success: false,
            message
        });
    }

    res.render(status === 404 ? "errors/404" : "errors/500", {
        title: status === 404 ? "Seite nicht gefunden" : "Serverfehler",
        message
    });

}

module.exports = errorHandler;
