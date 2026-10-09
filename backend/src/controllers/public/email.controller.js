const marketingService = require("../../services/marketing.service");

function page(res, status, data) {
    res.status(status).render("public/message", data);
}

const INVALID = {
    title: "Link ungültig",
    heading: "Dieser Link ist ungültig",
    text: "Der Link ist nicht (mehr) gültig. Bitte wenden Sie sich direkt an uns, wenn Sie Fragen haben.",
    tone: "secondary"
};

// ----------------------------------------------------
// Abmelden
// ----------------------------------------------------

exports.unsubscribePage = async (req, res, next) => {

    try {

        const contact = await marketingService.findByUnsubscribeToken(req.params.token);

        if (!contact) return page(res, 404, INVALID);

        if (marketingService.consentOf(contact).status !== "granted") {
            return page(res, 200, {
                title: "Abgemeldet",
                heading: "Sie sind abgemeldet",
                text: "Sie erhalten keine Informations-E-Mails von uns. Ticket- und Vertragsmails sind davon nicht betroffen.",
                tone: "success"
            });
        }

        page(res, 200, {
            title: "Abmelden",
            heading: "Informations-E-Mails abbestellen?",
            text: `Für ${contact.email}. Ticket- und Vertragsmails erhalten Sie weiterhin.`,
            tone: "primary",
            action: `/email/abmelden/${contact.marketing.unsubscribeToken}`,
            button: "Abmelden"
        });

    } catch (err) {

        next(err);

    }

};

exports.unsubscribe = async (req, res, next) => {

    try {

        const contact = await marketingService.unsubscribeByToken(req.params.token);

        if (!contact) return page(res, 404, INVALID);

        page(res, 200, {
            title: "Abgemeldet",
            heading: "Sie wurden abgemeldet",
            text: "Sie erhalten keine Informations-E-Mails mehr von uns. Ticket- und Vertragsmails sind davon nicht betroffen.",
            tone: "success"
        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Double-Opt-In bestätigen
// ----------------------------------------------------

exports.confirmPage = async (req, res, next) => {

    try {

        const found = await marketingService.findByDoiToken(req.params.token);

        if (!found) return page(res, 404, INVALID);

        if (found.expired) {
            return page(res, 410, {
                ...INVALID,
                text: `Der Bestätigungslink ist nach ${marketingService.DOI_VALID_DAYS} Tagen abgelaufen. Bitte fordern Sie bei uns einen neuen an.`
            });
        }

        page(res, 200, {
            title: "Anmeldung bestätigen",
            heading: "Informationen per E-Mail erhalten?",
            text: `Bitte bestätigen Sie, dass wir ${found.contact.email} gelegentlich über Neuigkeiten, Sicherheitshinweise und Angebote rund um Ihre IT informieren dürfen. Die Abmeldung ist jederzeit über den Link in jeder E-Mail möglich.`,
            tone: "primary",
            action: `/email/bestaetigen/${req.params.token}`,
            button: "Ja, Anmeldung bestätigen"
        });

    } catch (err) {

        next(err);

    }

};

exports.confirm = async (req, res, next) => {

    try {

        const contact = await marketingService.confirmDoubleOptIn(req.params.token);

        if (!contact) return page(res, 404, INVALID);

        page(res, 200, {
            title: "Bestätigt",
            heading: "Vielen Dank – Ihre Anmeldung ist bestätigt",
            text: "Sie können sich jederzeit über den Link in jeder E-Mail wieder abmelden.",
            tone: "success"
        });

    } catch (err) {

        next(err);

    }

};
