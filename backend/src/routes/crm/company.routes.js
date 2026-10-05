const express = require("express");

const router = express.Router();

const companyController = require("../../controllers/crm/company.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");

// Firmenübersicht
router.get("/", requireAuth, companyController.index);

// Neue Firma
router.get("/new", requireAuth, companyController.create);
router.post("/", requireAuth, companyController.store);

// Details
router.get("/:id", requireAuth, companyController.show);

// Bearbeiten
router.get("/:id/edit", requireAuth, companyController.edit);
router.post("/:id/update", requireAuth, companyController.update);

// Löschen
router.post("/:id/delete", requireAuth, companyController.destroy);

module.exports = router;