const express = require("express");

const router = express.Router();

const contactController = require("../../controllers/crm/contact.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");

// Kontaktübersicht
router.get("/", requireAuth, contactController.index);

// Neuer Kontakt
router.get("/new", requireAuth, contactController.create);
router.post("/", requireAuth, contactController.store);

// Details
router.get("/:id", requireAuth, contactController.show);

// Bearbeiten
router.get("/:id/edit", requireAuth, contactController.edit);
router.post("/:id/update", requireAuth, contactController.update);

// Löschen
router.post("/:id/delete", requireAuth, contactController.destroy);

module.exports = router;