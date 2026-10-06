const express = require("express");

const router = express.Router();

const upload = require("../../config/multer");

const ticketController = require("../../controllers/crm/ticket.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");
const { requireInternal } = require("../../middleware/crm/internal.middleware");

// ----------------------------------------------------
// Übersicht
// ----------------------------------------------------

router.get("/", requireAuth, ticketController.index);

// ----------------------------------------------------
// Neues Ticket
// ----------------------------------------------------

router.get("/new", requireAuth, ticketController.create);
router.post("/", requireAuth, ticketController.store);

// ----------------------------------------------------
// Ticket anzeigen
// ----------------------------------------------------

router.get("/:id", requireAuth, ticketController.show);

// ----------------------------------------------------
// Nachrichten
// ----------------------------------------------------

router.post(
    "/:id/messages",
    requireAuth,
    ticketController.addMessage
);

// ----------------------------------------------------
// Dateianhänge
// ----------------------------------------------------

// Datei hochladen
router.post(
    "/:id/attachments",
    requireAuth,
    upload.single("attachment"),
    ticketController.uploadAttachment
);

// Datei herunterladen
router.get(
    "/:id/attachments/:attachmentId",
    requireAuth,
    ticketController.downloadAttachment
);

// Datei löschen
router.post(
    "/:id/attachments/:attachmentId/delete",
    requireAuth,
    requireInternal,
    ticketController.deleteAttachment
);

// ----------------------------------------------------
// Ticket bearbeiten
// ----------------------------------------------------

router.get("/:id/edit", requireAuth, ticketController.edit);

router.post(
    "/:id/update",
    requireAuth,
    ticketController.update
);

// ----------------------------------------------------
// Bearbeiter ändern
// ----------------------------------------------------

router.post(
    "/:id/assign",
    requireAuth,
    requireInternal,
    ticketController.assign
);

// ----------------------------------------------------
// Ticket löschen
// ----------------------------------------------------

router.post(
    "/:id/delete",
    requireAuth,
    ticketController.destroy
);

module.exports = router;