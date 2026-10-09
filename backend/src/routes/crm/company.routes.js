const express = require("express");

const router = express.Router();

const companyController = require("../../controllers/crm/company.controller");
const documentController = require("../../controllers/crm/document.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

// Firmenübersicht
router.get("/", requireAuth, companyController.index);

// Neue Firma
router.get("/new", requireAuth, companyController.create);
router.post("/", requireAuth, companyController.store);

// Details
router.get("/:id", requireAuth, companyController.show);

// Reiter Dokumente (Nextcloud)
router.get("/:id/documents", requireAuth, requirePermission(PERMISSIONS.DOCUMENTS_VIEW), documentController.companyDocuments);

// Bearbeiten
router.get("/:id/edit", requireAuth, companyController.edit);
router.post("/:id/update", requireAuth, companyController.update);

// Löschen
router.post("/:id/delete", requireAuth, companyController.destroy);

module.exports = router;