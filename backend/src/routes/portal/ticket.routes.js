const express = require("express");

const router = express.Router();

const upload = require("../../config/multer");

const ticketController = require("../../controllers/portal/ticket.controller");
const { requirePortalAuth } = require("../../middleware/auth/portalAuth.middleware");

// Ticketübersicht
router.get("/", requirePortalAuth, ticketController.index);

// Neues Ticket
router.get("/new", requirePortalAuth, ticketController.create);
router.post("/new", requirePortalAuth, ticketController.store);

// Ticket anzeigen
router.get("/:id", requirePortalAuth, ticketController.show);

// Antwort hinzufügen
router.post("/:id/messages", requirePortalAuth, ticketController.addMessage);

// Dateianhang hochladen
router.post(
    "/:id/attachments",
    requirePortalAuth,
    upload.single("attachment"),
    ticketController.uploadAttachment
);

// Dateianhang herunterladen
router.get(
    "/:ticketId/attachments/:attachmentId",
    requirePortalAuth,
    ticketController.downloadAttachment
);

module.exports = router;