const express = require("express");

const router = express.Router();

const dashboardController = require("../../controllers/portal/dashboard.controller");
const { requirePortalAuth } = require("../../middleware/auth/portalAuth.middleware");

// ----------------------------------------------------
// Dashboard
// ----------------------------------------------------

router.get(
    "/",
    requirePortalAuth,
    dashboardController.index
);

module.exports = router;