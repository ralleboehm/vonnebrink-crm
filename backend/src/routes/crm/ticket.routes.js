const express = require("express");

const router = express.Router();

const ticketController = require("../../controllers/crm/ticket.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");
const { requireInternal } = require("../../middleware/crm/internal.middleware");

// Übersicht
router.get("/", requireAuth, ticketController.index);

// Neues Ticket
router.get("/new", requireAuth, ticketController.create);
router.post("/", requireAuth, ticketController.store);

// Details
router.get("/:id", requireAuth, ticketController.show);
router.post("/:id/messages", requireAuth, ticketController.addMessage);

// Bearbeiten
router.get("/:id/edit", requireAuth, ticketController.edit);
router.post("/:id/update", requireAuth, ticketController.update);

// Bearbeiter ändern
router.post(
    "/:id/assign",
    requireAuth,
    requireInternal,
    ticketController.assign
);

// Löschen
router.post("/:id/delete", requireAuth, ticketController.destroy);

module.exports = router;