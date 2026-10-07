function notFound(req, res) {

    res.status(404);

    if (req.accepts(["html", "json"]) === "json") {
        return res.json({
            success: false,
            message: "Route not found"
        });
    }

    res.render("errors/404", {
        title: "Seite nicht gefunden"
    });

}

module.exports = notFound;
