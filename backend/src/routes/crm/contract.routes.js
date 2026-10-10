const express = require("express");

const router = express.Router();

const contractController = require("../../controllers/crm/contract.controller");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

// Ansehen: alle internen Rollen; Bearbeiten: Admin und Vertrieb; Löschen: Admin
const view = requirePermission(PERMISSIONS.CONTRACTS_VIEW);
const edit = requirePermission(PERMISSIONS.CONTRACTS_EDIT);
const remove = requirePermission(PERMISSIONS.CONTRACTS_DELETE);

// ----------------------------------------------------
// Verträge (unter /crm/contracts)
// ----------------------------------------------------

router.get("/", view, contractController.index);

router.get("/new", edit, contractController.create);
router.post("/", edit, contractController.store);

router.get("/:id", view, contractController.show);
router.get("/:id/edit", edit, contractController.edit);
router.post("/:id/update", edit, contractController.update);
router.post("/:id/status", edit, contractController.setStatus);
router.post("/:id/delete", remove, contractController.destroy);

module.exports = router;
