const express = require("express");

const router = express.Router();

const portalAuthController = require("../../controllers/portal/auth.controller");

// Login

router.get("/login", portalAuthController.login);

router.post("/login", portalAuthController.authenticate);

module.exports = router;