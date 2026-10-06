const userService = require("../../services/user.service");

// ----------------------------------------------------
// Profil anzeigen
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        const user = await userService.getById(
            req.session.user.id
        );

        res.render("portal/profile/index", {

            title: "Mein Profil",

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

        await userService.updateProfile(

            req.session.user.id,

            {

                firstName: req.body.firstName,

                lastName: req.body.lastName,

                email: req.body.email

            }

        );

        res.redirect("/portal/profile");

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Passwort-Seite
// ----------------------------------------------------

exports.password = (req, res) => {

    res.render("portal/profile/password", {

        title: "Passwort ändern"

    });

};

// ----------------------------------------------------
// Passwort ändern
// ----------------------------------------------------

exports.changePassword = async (req, res, next) => {

    try {

        if (req.body.newPassword !== req.body.confirmPassword) {

            return res.render("portal/profile/password", {

                title: "Passwort ändern",

                error: "Die neuen Passwörter stimmen nicht überein."

            });

        }

        await userService.changePassword(

            req.session.user.id,

            req.body.currentPassword,

            req.body.newPassword

        );

        res.redirect("/portal/profile");

    } catch (err) {

        res.render("portal/profile/password", {

            title: "Passwort ändern",

            error: err.message

        });

    }

};