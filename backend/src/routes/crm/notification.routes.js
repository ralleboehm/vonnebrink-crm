const express = require("express");

const router = express.Router();

const notificationController = require("../../controllers/crm/notification.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");

// Übersicht
router.get("/", requireAuth, notificationController.index);

// Alle als gelesen markieren
router.post("/read-all", requireAuth, notificationController.markAllAsRead);

// Öffnen (als gelesen markieren und zum Ziel springen)
router.get("/:id/open", requireAuth, notificationController.open);

// Als gelesen markieren
router.post("/:id/read", requireAuth, notificationController.markAsRead);

module.exports = router;
