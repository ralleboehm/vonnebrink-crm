const authService = require("../../services/auth.service");
const userService = require("../../services/user.service");

// ----------------------------------------------------
// Login-Seite anzeigen
// ----------------------------------------------------

exports.login = (req, res) => {

    res.render("portal/login", {
        title: "Kundenportal"
    });

};

// ----------------------------------------------------
// Login durchführen
// ----------------------------------------------------

exports.authenticate = async (req, res, next) => {

    try {

        const { email, password } = req.body;

        let user;

        try {

            user = await authService.authenticate({

                email,
                password,
                allowedRoles: [
                    "portal"
                ]

            });

        } catch (err) {

            let error = "Benutzername oder Passwort ist falsch.";

            switch (err.message) {

                case "USER_DISABLED":
                    error = "Benutzer ist deaktiviert.";
                    break;

                case "ACCESS_DENIED":
                    error = "Für das Kundenportal besteht keine Berechtigung.";
                    break;

            }

            return res.render("portal/login", {
                title: "Kundenportal",
                error
            });

        }

        req.session.regenerate(async (err) => {

            if (err) {
                return next(err);
            }

            await userService.updateLastLogin(user._id);

            req.session.user = {

                id: user._id,

                username: user.username,

                firstName: user.firstName,

                lastName: user.lastName,

                email: user.email,

                role: user.role,

                company: user.company?._id || user.company,

                contact: user.contact?._id || user.contact

            };

            res.redirect("/portal");

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Logout
// ----------------------------------------------------

exports.logout = (req, res, next) => {

    req.session.destroy((err) => {

        if (err) {
            return next(err);
        }

        res.clearCookie("vonnebrink.sid");

        res.redirect("/portal/login");

    });

};