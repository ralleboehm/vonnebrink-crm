const express = require("express");

const router = express.Router();

const upload = require("../../config/multer");

const ticketController = require("../../controllers/crm/ticket.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");
const { requireInternal } = require("../../middleware/crm/internal.middleware");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

// Vertrieb sieht nur die Liste (tickets.list), Techniker/Admin alles
const list = requirePermission(PERMISSIONS.TICKETS_LIST);
const view = requirePermission(PERMISSIONS.TICKETS_VIEW);
const edit = requirePermission(PERMISSIONS.TICKETS_EDIT);
const remove = requirePermission(PERMISSIONS.TICKETS_DELETE);

// ----------------------------------------------------
// Übersicht
// ----------------------------------------------------

router.get("/", requireAuth, list, ticketController.index);

// ----------------------------------------------------
// Neues Ticket
// ----------------------------------------------------

router.get("/new", requireAuth, edit, ticketController.create);
router.post("/", requireAuth, edit, ticketController.store);

// ----------------------------------------------------
// Ticket anzeigen
// ----------------------------------------------------

router.get("/:id", requireAuth, view, ticketController.show);

// ----------------------------------------------------
// Nachrichten
// ----------------------------------------------------

router.post(
    "/:id/messages",
    requireAuth,
    edit,
    ticketController.addMessage
);

// ----------------------------------------------------
// Dateianhänge
// ----------------------------------------------------

// Datei hochladen
router.post(
    "/:id/attachments",
    requireAuth,
    edit,
    upload.single("attachment"),
    ticketController.uploadAttachment
);

// Datei herunterladen
router.get(
    "/:id/attachments/:attachmentId",
    requireAuth,
    view,
    ticketController.downloadAttachment
);

// Datei löschen
router.post(
    "/:id/attachments/:attachmentId/delete",
    requireAuth,
    edit,
    requireInternal,
    ticketController.deleteAttachment
);

// ----------------------------------------------------
// Ticket bearbeiten
// ----------------------------------------------------

router.get("/:id/edit", requireAuth, edit, ticketController.edit);

router.post(
    "/:id/update",
    requireAuth,
    edit,
    ticketController.update
);

// ----------------------------------------------------
// Bearbeiter ändern
// ----------------------------------------------------

router.post(
    "/:id/assign",
    requireAuth,
    edit,
    requireInternal,
    ticketController.assign
);

// ----------------------------------------------------
// Ticket löschen
// ----------------------------------------------------

router.post(
    "/:id/delete",
    requireAuth,
    remove,
    ticketController.destroy
);

module.exports = router;