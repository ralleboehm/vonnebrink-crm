const express = require("express");

const router = express.Router();

const controller = require("../../controllers/public/email.controller");
const { emailLinkLimiter } = require("../../middleware/rateLimit.middleware");

// ----------------------------------------------------
// Öffentliche Links aus E-Mails (ohne Anmeldung)
// ----------------------------------------------------
//
// GET zeigt nur eine Seite mit Knopf – erst POST ändert etwas. So melden
// Virenscanner, die Links vorab öffnen, niemanden versehentlich ab/an.
// POST /abmelden/:token unterstützt auch "List-Unsubscribe-Post"
// (Ein-Klick-Abmeldung in Gmail, Outlook & Co.).

router.use(emailLinkLimiter);

router.get("/abmelden/:token", controller.unsubscribePage);
router.post("/abmelden/:token", controller.unsubscribe);

router.get("/bestaetigen/:token", controller.confirmPage);
router.post("/bestaetigen/:token", controller.confirm);

// Kundenumfrage (NPS) aus der Abschluss-Mail
router.get("/umfrage/:token", controller.surveyPage);
router.post("/umfrage/:token", controller.surveySubmit);

module.exports = router;
