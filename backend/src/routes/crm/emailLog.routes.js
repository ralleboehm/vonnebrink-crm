const express = require("express");

const router = express.Router();

const emailLogController = require("../../controllers/crm/emailLog.controller");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

// Nur Administratoren (Recht "email.log")
router.use(requirePermission(PERMISSIONS.EMAIL_LOG_VIEW));

router.get("/", emailLogController.index);
router.post("/verify", emailLogController.verify);
router.post("/test", emailLogController.sendTest);

module.exports = router;
