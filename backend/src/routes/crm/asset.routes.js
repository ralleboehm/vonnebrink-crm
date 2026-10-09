const express = require("express");

const router = express.Router();

const assetController = require("../../controllers/crm/asset.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

// Vertrieb: nur ansehen
const view = requirePermission(PERMISSIONS.ASSETS_VIEW);
const edit = requirePermission(PERMISSIONS.ASSETS_EDIT);
const remove = requirePermission(PERMISSIONS.ASSETS_DELETE);

// Übersicht
router.get("/", requireAuth, view, assetController.index);

// Neues Asset
router.get("/new", requireAuth, edit, assetController.create);
router.post("/", requireAuth, edit, assetController.store);

// Details
router.get("/:id", requireAuth, view, assetController.show);

// Bearbeiten
router.get("/:id/edit", requireAuth, edit, assetController.edit);
router.post("/:id/update", requireAuth, edit, assetController.update);

// Löschen
router.post("/:id/delete", requireAuth, remove, assetController.destroy);

module.exports = router;
