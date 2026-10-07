exports.requireInternal = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect("/crm/login");
    }

    const internalRoles = [
        "admin",
        "technician",
        "sales"
    ];

    if (!internalRoles.includes(req.session.user.role)) {
        return res.status(403).send("Zugriff verweigert.");
    }

    next();
};