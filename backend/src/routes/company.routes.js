const express = require("express");

const router = express.Router();

const companyController = require("../controllers/company.controller");

// Firmenübersicht
router.get("/", companyController.index);

// Formular "Neue Firma"
router.get("/new", companyController.create);

// Neue Firma speichern
router.post("/", companyController.store);

// Einzelne Firma anzeigen
router.get("/:id", companyController.show);

// Formular "Firma bearbeiten"
router.get("/:id/edit", companyController.edit);

// Änderungen speichern
router.post("/:id/update", companyController.update);

// Firma löschen (Soft Delete)
router.post("/:id/delete", companyController.destroy);

module.exports = router;