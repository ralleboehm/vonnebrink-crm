const express = require("express");

const router = express.Router();

const contactController = require("../../controllers/crm/contact.controller");
const portalAccountController = require("../../controllers/crm/portalAccount.controller");

const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");
const marketingController = require("../../controllers/crm/marketing.controller");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

// ----------------------------------------------------
// Kontakte
// ----------------------------------------------------

router.get("/", requireAuth, contactController.index);

router.get("/new", requireAuth, contactController.create);
router.post("/", requireAuth, contactController.store);

router.get("/:id", requireAuth, contactController.show);

router.get("/:id/edit", requireAuth, contactController.edit);
router.post("/:id/update", requireAuth, contactController.update);

router.post("/:id/delete", requireAuth, contactController.destroy);

// ----------------------------------------------------
// Portalzugang
// ----------------------------------------------------

router.post(
    "/:id/portal/create",
    requireAuth,
    portalAccountController.create
);

router.post(
    "/:id/portal/reset-password",
    requireAuth,
    portalAccountController.resetPassword
);

router.post(
    "/:id/portal/activate",
    requireAuth,
    portalAccountController.activate
);

router.post(
    "/:id/portal/deactivate",
    requireAuth,
    portalAccountController.deactivate
);

// ----------------------------------------------------
// Marketing-Einwilligung
// ----------------------------------------------------

router.post(
    "/:id/marketing",
    requirePermission(PERMISSIONS.MARKETING_MANAGE),
    marketingController.setContactConsent
);

// Bestätigungs-E-Mail (Double-Opt-In)
router.post(
    "/:id/marketing/double-opt-in",
    requirePermission(PERMISSIONS.MARKETING_MANAGE),
    marketingController.requestDoubleOptIn
);

module.exports = router;