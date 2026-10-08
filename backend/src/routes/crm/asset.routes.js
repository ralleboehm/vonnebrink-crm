const express = require("express");

const router = express.Router();

const assetController = require("../../controllers/crm/asset.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");

// Übersicht
router.get("/", requireAuth, assetController.index);

// Neues Asset
router.get("/new", requireAuth, assetController.create);
router.post("/", requireAuth, assetController.store);

// Details
router.get("/:id", requireAuth, assetController.show);

// Bearbeiten
router.get("/:id/edit", requireAuth, assetController.edit);
router.post("/:id/update", requireAuth, assetController.update);

// Löschen
router.post("/:id/delete", requireAuth, assetController.destroy);

module.exports = router;
