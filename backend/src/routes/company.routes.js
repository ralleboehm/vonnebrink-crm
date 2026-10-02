const express = require("express");

const router = express.Router();

const companyController = require("../controllers/company.controller");
const { requireAuth } = require("../middleware/auth.middleware");

// Alle Firmen anzeigen

router.get("/", requireAuth, companyController.index);

// Formular für neue Firma

router.get("/new", requireAuth, companyController.create);

// Neue Firma speichern

router.post("/", requireAuth, companyController.store);

// Einzelne Firma anzeigen

router.get("/:id", requireAuth, companyController.show);

// Formular zum Bearbeiten

router.get("/:id/edit", requireAuth, companyController.edit);

// Firma aktualisieren

router.post("/:id/update", requireAuth, companyController.update);

// Firma löschen (Soft Delete)

router.post("/:id/delete", requireAuth, companyController.destroy);

module.exports = router;