const express = require("express");

const router = express.Router();

const authController = require("../../controllers/crm/auth.controller");
const { crmLoginLimiter } = require("../../middleware/rateLimit.middleware");

// ----------------------------------------------------
// Login
// ----------------------------------------------------

router.get("/login", authController.loginPage);

router.post("/login", crmLoginLimiter, authController.login);

// ----------------------------------------------------
// Logout
// ----------------------------------------------------

router.get("/logout", authController.logout);

module.exports = router;