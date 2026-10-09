const express = require("express");

const router = express.Router();

const profileController = require("../../controllers/portal/profile.controller");
const { requirePortalAuth } = require("../../middleware/auth/portalAuth.middleware");

// Profil anzeigen
router.get(
    "/",
    requirePortalAuth,
    profileController.index
);

// Profil speichern
router.post(
    "/",
    requirePortalAuth,
    profileController.update
);

// Passwortseite
router.get(
    "/password",
    requirePortalAuth,
    profileController.password
);

// Passwort ändern
router.post(
    "/password",
    requirePortalAuth,
    profileController.changePassword
);

// Informationen per E-Mail an-/abbestellen
router.post(
    "/marketing",
    requirePortalAuth,
    profileController.marketing
);

module.exports = router;