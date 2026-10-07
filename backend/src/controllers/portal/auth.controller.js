const portalAuthService = require("../../services/portalAuth.service");
const portalAccountService = require("../../services/portalAccount.service");

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

        let portalAccount;

        try {

            portalAccount = await portalAuthService.authenticate(
                email,
                password
            );

        } catch (err) {

            let error = "E-Mail oder Passwort ist falsch.";

            switch (err.message) {

                case "ACCOUNT_LOCKED":
                    error = "Der Portalzugang wurde vorübergehend gesperrt.";
                    break;

                case "USER_DISABLED":
                    error = "Der Portalzugang ist deaktiviert.";
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

            await portalAccountService.updateLastLogin(
                portalAccount._id
            );

            req.session.portalUser = {

                id: portalAccount._id,

                contact: portalAccount.contact._id,

                company: portalAccount.contact.company._id,

                companyName: portalAccount.contact.company.companyName,

                firstName: portalAccount.contact.firstName,

                lastName: portalAccount.contact.lastName,

                email: portalAccount.contact.email,

                mustChangePassword: portalAccount.mustChangePassword

            };

            if (portalAccount.mustChangePassword) {

                return res.redirect(
                    "/portal/profile/password"
                );

            }

            res.redirect("/portal");

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Formular Passwort ändern
// ----------------------------------------------------

exports.changePasswordForm = async (req, res, next) => {

    try {

        const portalAccount = await portalAccountService.getByContact(

            req.session.portalUser.contact

        );

        res.render("portal/profile/password", {

            title: "Passwort ändern",

            portalAccount

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Passwort ändern
// ----------------------------------------------------

exports.changePassword = async (req, res, next) => {

    try {

        const {

            password,
            passwordConfirm

        } = req.body;

        if (!password || password.length < 8) {

            return res.render("portal/profile/password", {

                title: "Passwort ändern",

                error: "Das Passwort muss mindestens 8 Zeichen lang sein."

            });

        }

        if (password !== passwordConfirm) {

            return res.render("portal/profile/password", {

                title: "Passwort ändern",

                error: "Die Passwörter stimmen nicht überein."

            });

        }

        await portalAccountService.changePassword(

            req.session.portalUser.id,

            password

        );

        req.session.portalUser.mustChangePassword = false;

        res.redirect("/portal");

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