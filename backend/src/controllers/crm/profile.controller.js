const userService = require("../../services/user.service");

// ----------------------------------------------------
// Profil anzeigen
// ----------------------------------------------------

exports.show = async (req, res, next) => {

    try {

        const user = await userService.getById(req.session.user.id);

        res.render("profile/show", {

            title: "Mein Profil",
            user

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Profil bearbeiten
// ----------------------------------------------------

exports.edit = async (req, res, next) => {

    try {

        const user = await userService.getById(req.session.user.id);

        res.render("profile/edit", {

            title: "Profil bearbeiten",
            user

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Profil speichern
// ----------------------------------------------------

exports.update = async (req, res, next) => {

    try {

        await userService.update(

            req.session.user.id,

            {

                firstName: req.body.firstName,
                lastName: req.body.lastName,
                email: req.body.email

            }

        );

        // Session aktualisieren

        req.session.user.firstName = req.body.firstName;
        req.session.user.lastName = req.body.lastName;
        req.session.user.email = req.body.email;

        res.redirect("/crm/profile");

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Passwortseite
// ----------------------------------------------------

exports.password = (req, res) => {

    res.render("profile/password", {

        title: "Passwort ändern"

    });

};

// ----------------------------------------------------
// Passwort ändern
// ----------------------------------------------------

exports.changePassword = async (req, res, next) => {

    try {

        if (req.body.newPassword !== req.body.confirmPassword) {

            throw new Error("Die neuen Passwörter stimmen nicht überein.");

        }

        await userService.changePassword(

            req.session.user.id,

            req.body.currentPassword,

            req.body.newPassword

        );

        res.redirect("/crm/profile");

    } catch (err) {

        next(err);

    }

};