const express = require("express");

const router = express.Router();

const marketingController = require("../../controllers/crm/marketing.controller");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

const view = requirePermission(PERMISSIONS.MARKETING_VIEW);
const manage = requirePermission(PERMISSIONS.MARKETING_MANAGE);

// Empfänger (wer ist für Kampagnen erreichbar?)
router.get("/", view, marketingController.recipients);
router.get("/export", view, marketingController.exportCsv);

// Gruppen
router.get("/groups", view, marketingController.groups);
router.post("/groups/rename", manage, marketingController.renameGroup);
router.post("/groups/remove", manage, marketingController.removeGroup);

module.exports = router;
