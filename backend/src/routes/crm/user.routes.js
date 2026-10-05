const express = require("express");

const router = express.Router();

const userController = require("../../controllers/crm/user.controller");
const { requireAuth, requireRole } = require("../../middleware/auth/crmAuth.middleware");

// Benutzer anzeigen

router.get(
    "/",
    requireAuth,
    requireRole("admin"),
    userController.index
);

// Formular für neuen Benutzer

router.get(
    "/new",
    requireAuth,
    requireRole("admin"),
    userController.create
);

// Benutzer speichern

router.post(
    "/",
    requireAuth,
    requireRole("admin"),
    userController.store
);

// Benutzer anzeigen

router.get(
    "/:id",
    requireAuth,
    requireRole("admin"),
    userController.show
);

// Benutzer bearbeiten

router.get(
    "/:id/edit",
    requireAuth,
    requireRole("admin"),
    userController.edit
);

// Änderungen speichern

router.post(
    "/:id/update",
    requireAuth,
    requireRole("admin"),
    userController.update
);

// Benutzer deaktivieren

router.post(
    "/:id/deactivate",
    requireAuth,
    requireRole("admin"),
    userController.deactivate
);

module.exports = router;