const express = require("express");

const router = express.Router();

const profileController = require("../../controllers/crm/profile.controller");

const {
    requireAuth
} = require("../../middleware/auth/crmAuth.middleware");

router.get("/", requireAuth, profileController.show);

router.get("/edit", requireAuth, profileController.edit);

router.post("/update", requireAuth, profileController.update);

router.get("/password", requireAuth, profileController.password);

router.post("/password", requireAuth, profileController.changePassword);

module.exports = router;