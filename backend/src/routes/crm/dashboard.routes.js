const express = require("express");

const router = express.Router();

const dashboardController = require("../../controllers/crm/dashboard.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");

router.get("/", requireAuth, dashboardController.index);

module.exports = router;