const express = require("express");

const router = express.Router();

const integrationController = require("../../controllers/crm/integration.controller");
const { requireRole } = require("../../middleware/auth/crmAuth.middleware");

// Nur Administratoren
router.use(requireRole("admin"));

// Action1: Status, Zuordnung Organisation -> Firma, Sync
router.get("/action1", integrationController.action1);
router.post("/action1/mapping", integrationController.saveAction1Mapping);
router.post("/action1/sync", integrationController.runAction1Sync);

module.exports = router;
