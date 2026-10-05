exports.requireAuth = (req, res, next) => {

    if (!req.session.user) {
        return res.redirect("/crm/login");
    }

    next();

};

exports.requireRole = (...roles) => {

    return (req, res, next) => {

        if (!req.session.user) {
            return res.redirect("/crm/login");
        }

        if (!roles.includes(req.session.user.role)) {
            return res.status(403).send("Zugriff verweigert.");
        }

        next();

    };

};