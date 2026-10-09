const express = require("express");

const router = express.Router();

const opportunityController = require("../../controllers/crm/opportunity.controller");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

// Admin und Vertrieb (Techniker nicht)
const view = requirePermission(PERMISSIONS.SALES_VIEW);
const edit = requirePermission(PERMISSIONS.SALES_EDIT);

// ----------------------------------------------------
// Vertrieb: Pipeline und Verkaufschancen (unter /crm/sales)
// ----------------------------------------------------

router.get("/", view, opportunityController.board);
router.get("/list", view, opportunityController.list);

router.get("/new", edit, opportunityController.create);
router.post("/", edit, opportunityController.store);

router.get("/:id", view, opportunityController.show);
router.get("/:id/edit", edit, opportunityController.edit);
router.post("/:id/update", edit, opportunityController.update);

router.post("/:id/stage", edit, opportunityController.moveStage);
router.post("/:id/step", edit, opportunityController.completeStep);
router.post("/:id/notes", edit, opportunityController.addNote);
router.post("/:id/delete", edit, opportunityController.destroy);

module.exports = router;
