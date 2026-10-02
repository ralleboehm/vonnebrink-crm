const express = require("express");

const router = express.Router();

const dashboardController = require("../controllers/dashboard.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/", requireAuth, dashboardController.index);

module.exports = router;