const express = require("express");

const router = express.Router();

const contactController = require("../controllers/contact.controller");

// Alle Kontakte anzeigen
router.get("/", contactController.index);

// Formular für neuen Kontakt
router.get("/new", contactController.create);

// Kontakt speichern
router.post("/", contactController.store);

// Einzelnen Kontakt anzeigen
router.get("/:id", contactController.show);

// Formular zum Bearbeiten
router.get("/:id/edit", contactController.edit);

// Änderungen speichern
router.post("/:id/update", contactController.update);

// Soft Delete
router.post("/:id/delete", contactController.destroy);

module.exports = router;