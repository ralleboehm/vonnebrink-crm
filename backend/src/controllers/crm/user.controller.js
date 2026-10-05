const userService = require("../../services/user.service");

// Alle Benutzer anzeigen
exports.index = async (req, res, next) => {

    try {

        const users = await userService.getAll();

        res.render("users/index", {
            title: "Benutzer",
            users
        });

    } catch (err) {

        next(err);

    }

};

// Formular für neuen Benutzer
exports.create = (req, res) => {

    res.render("users/create", {
        title: "Neuer Benutzer"
    });

};

// Benutzer speichern
exports.store = async (req, res, next) => {

    try {

        await userService.create({

            username: req.body.username,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.email,
            password: req.body.password,
            role: req.body.role

        });

        res.redirect("/crm/users");

    } catch (err) {

        next(err);

    }

};

// Einzelnen Benutzer anzeigen
exports.show = async (req, res, next) => {

    try {

        const user = await userService.getById(req.params.id);

        if (!user) {
            return res.redirect("/crm/users");
        }

        res.render("users/show", {
            title: `${user.firstName} ${user.lastName}`,
            user
        });

    } catch (err) {

        next(err);

    }

};

// Formular zum Bearbeiten
exports.edit = async (req, res, next) => {

    try {

        const user = await userService.getById(req.params.id);

        if (!user) {
            return res.redirect("/crm/users");
        }

        res.render("users/edit", {
            title: "Benutzer bearbeiten",
            user
        });

    } catch (err) {

        next(err);

    }

};

// Benutzer aktualisieren
exports.update = async (req, res, next) => {

    try {

        await userService.update(req.params.id, {

            username: req.body.username,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.email,
            password: req.body.password,
            role: req.body.role

        });

        res.redirect("/crm/users");

    } catch (err) {

        next(err);

    }

};

// Benutzer deaktivieren
exports.deactivate = async (req, res, next) => {

    try {

        const user = await userService.getById(req.params.id);

        if (!user) {
            return res.redirect("/crm/users");
        }

        await userService.deactivate(req.params.id);

        res.redirect("/crm/users");

    } catch (err) {

        next(err);

    }

};