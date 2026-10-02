const express = require("express");

const router = express.Router();

const contactController = require("../controllers/contact.controller");
const { requireAuth } = require("../middleware/auth.middleware");

// Alle Kontakte anzeigen

router.get("/", requireAuth, contactController.index);

// Formular für neuen Kontakt

router.get("/new", requireAuth, contactController.create);

// Kontakt speichern

router.post("/", requireAuth, contactController.store);

// Einzelnen Kontakt anzeigen

router.get("/:id", requireAuth, contactController.show);

// Formular zum Bearbeiten

router.get("/:id/edit", requireAuth, contactController.edit);

// Änderungen speichern

router.post("/:id/update", requireAuth, contactController.update);

// Soft Delete

router.post("/:id/delete", requireAuth, contactController.destroy);

module.exports = router;