const authService = require("../../services/auth.service");
const userService = require("../../services/user.service");

// ----------------------------------------------------
// Login-Seite anzeigen
// ----------------------------------------------------

exports.loginPage = (req, res) => {

    res.render("auth/login", {
        title: "Anmeldung"
    });

};

// ----------------------------------------------------
// Login durchführen
// ----------------------------------------------------

exports.login = async (req, res, next) => {

    try {

        const { username, password } = req.body;

        let user;

        try {

            user = await authService.authenticate({

                username,
                password,
                allowedRoles: [
                    "admin",
                    "technician",
                    "sales"
                ]

            });

        } catch (err) {

            let error = "Benutzername oder Passwort ist falsch.";

            switch (err.message) {

                case "USER_DISABLED":
                    error = "Benutzer ist deaktiviert.";
                    break;

                case "ACCESS_DENIED":
                    error = "Für diesen Bereich besteht keine Berechtigung.";
                    break;

            }

            return res.render("auth/login", {
                title: "Anmeldung",
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
                role: user.role
            };

            console.log("========== LOGIN OK ==========");
            console.log(req.session.user);
            console.log("==============================");

            res.redirect("/crm");

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

        res.redirect("/crm/login");

    });

};