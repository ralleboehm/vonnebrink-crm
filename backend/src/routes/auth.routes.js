const express = require("express");

const router = express.Router();

const authController = require("../controllers/auth.controller");

// Login anzeigen
router.get("/login", authController.loginPage);

// Login durchführen
router.post("/login", authController.login);

// Logout
router.get("/logout", authController.logout);

module.exports = router;