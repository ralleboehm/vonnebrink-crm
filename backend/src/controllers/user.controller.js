const userService = require("../services/user.service");

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

        await userService.create(req.body);

        res.redirect("/users");

    } catch (err) {

        next(err);

    }

};

// Einzelnen Benutzer anzeigen
exports.show = async (req, res, next) => {

    try {

        const user = await userService.getById(req.params.id);

        if (!user) {
            return res.status(404).send("Benutzer nicht gefunden");
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
            return res.status(404).send("Benutzer nicht gefunden");
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

        await userService.update(req.params.id, req.body);

        res.redirect("/users");

    } catch (err) {

        next(err);

    }

};

// Benutzer deaktivieren
exports.deactivate = async (req, res, next) => {

    try {

        await userService.deactivate(req.params.id);

        res.redirect("/users");

    } catch (err) {

        next(err);

    }

};