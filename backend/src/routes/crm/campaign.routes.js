const express = require("express");

const router = express.Router();

const campaignController = require("../../controllers/crm/campaign.controller");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

const view = requirePermission(PERMISSIONS.MARKETING_VIEW);
const manage = requirePermission(PERMISSIONS.MARKETING_MANAGE);

// ----------------------------------------------------
// E-Mail-Kampagnen (unter /crm/marketing/campaigns)
// ----------------------------------------------------

router.get("/", view, campaignController.index);

// Neue Kampagne
router.get("/new", manage, campaignController.create);
router.post("/", manage, campaignController.store);

// Vorschau aus dem Formular (ungespeichert, öffnet in neuem Tab)
router.post("/preview", manage, campaignController.previewDraft);

// Anzeigen, Vorschau
router.get("/:id", view, campaignController.show);
router.get("/:id/preview", view, campaignController.preview);

// Bearbeiten (nur Entwürfe)
router.get("/:id/edit", manage, campaignController.edit);
router.post("/:id/update", manage, campaignController.update);

// Test-Mail, Versand
router.post("/:id/test", manage, campaignController.sendTest);
router.post("/:id/send", manage, campaignController.send);

// Kopieren, Löschen
router.post("/:id/duplicate", manage, campaignController.duplicate);
router.post("/:id/delete", manage, campaignController.destroy);

module.exports = router;
