const userService = require("../services/user.service");

// Login-Seite anzeigen
exports.loginPage = (req, res) => {

    res.render("auth/login", {
        title: "Anmeldung"
    });

};

// Login durchführen
exports.login = async (req, res, next) => {

    try {

        const { username, password } = req.body;

        const user = await userService.getByUsername(username);

        if (!user) {

            return res.render("auth/login", {
                title: "Anmeldung",
                error: "Benutzername oder Passwort ist falsch."
            });

        }

        if (!user.active) {

            return res.render("auth/login", {
                title: "Anmeldung",
                error: "Benutzer ist deaktiviert."
            });

        }

        const validPassword = await user.comparePassword(password);

        if (!validPassword) {

            return res.render("auth/login", {
                title: "Anmeldung",
                error: "Benutzername oder Passwort ist falsch."
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

            res.redirect("/");

        });

    } catch (err) {

        next(err);

    }

};

// Logout
exports.logout = (req, res, next) => {

    req.session.destroy((err) => {

        if (err) {
            return next(err);
        }

        res.clearCookie("connect.sid");

        res.redirect("/login");

    });

};