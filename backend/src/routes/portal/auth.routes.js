const express = require("express");

const router = express.Router();

const portalAuthController = require("../../controllers/portal/auth.controller");
const { portalLoginLimiter } = require("../../middleware/rateLimit.middleware");

// ----------------------------------------------------
// Login
// ----------------------------------------------------

router.get(
    "/login",
    portalAuthController.login
);

router.post(
    "/login",
    portalLoginLimiter,
    portalAuthController.authenticate
);

// ----------------------------------------------------
// Logout
// ----------------------------------------------------

router.get(
    "/logout",
    portalAuthController.logout
);

module.exports = router;