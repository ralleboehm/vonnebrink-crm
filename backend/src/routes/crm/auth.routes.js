const express = require("express");

const router = express.Router();

const authController = require("../../controllers/crm/auth.controller");

// ----------------------------------------------------
// Login
// ----------------------------------------------------

router.get("/login", authController.loginPage);

router.post("/login", authController.login);

// ----------------------------------------------------
// Logout
// ----------------------------------------------------

router.get("/logout", authController.logout);

module.exports = router;