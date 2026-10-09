const contactService = require("../../services/contact.service");
const portalAccountService = require("../../services/portalAccount.service");
const marketingService = require("../../services/marketing.service");
const { setFlash, takeFlash } = require("../../core/http/flash");

// ----------------------------------------------------
// Profil anzeigen
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        const contact = await contactService.getById(

            req.session.portalUser.contact

        );

        const portalAccount = await portalAccountService.getByContact(

            req.session.portalUser.contact

        );

        res.render("portal/profile/index", {

            title: "Mein Profil",

            contact,

            portalAccount,

            marketingConsent: marketingService.consentOf(contact),

            flash: takeFlash(req)

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

        await contactService.update(

            req.session.portalUser.contact,

            {

                company: req.body.company,

                salutation: req.body.salutation,

                firstName: req.body.firstName,

                lastName: req.body.lastName,

                position: req.body.position,

                email: req.body.email,

                phone: req.body.phone,

                mobile: req.body.mobile,

                status: "active",

                notes: req.body.notes

            }

        );

        await portalAccountService.updateEmail(

            req.session.portalUser.contact,

            req.body.email

        );

        req.session.portalUser.email = req.body.email;
        req.session.portalUser.firstName = req.body.firstName;
        req.session.portalUser.lastName = req.body.lastName;

        res.redirect("/portal/profile");

    } catch (err) {

        next(err);

    }

};
// ----------------------------------------------------
// Passwort-Seite
// ----------------------------------------------------

exports.password = async (req, res, next) => {

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

        res.redirect("/portal/profile");

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Informationen per E-Mail an-/abbestellen
// ----------------------------------------------------

exports.marketing = async (req, res, next) => {

    try {

        const granted = req.body.marketing === "yes";
        const user = req.session.portalUser;

        await marketingService.setConsent(user.contact, granted, {
            source: "portal",
            by: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
        });

        setFlash(
            req,
            "success",
            granted
                ? "Vielen Dank – Sie erhalten künftig Informationen per E-Mail. Die Abmeldung ist hier jederzeit möglich."
                : "Sie sind abgemeldet und erhalten keine Informations-E-Mails mehr."
        );

        res.redirect("/portal/profile");

    } catch (err) {

        next(err);

    }

};
