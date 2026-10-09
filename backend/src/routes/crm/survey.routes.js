const express = require("express");

const router = express.Router();

const surveyController = require("../../controllers/crm/survey.controller");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");

// Nur Admins
const view = requirePermission(PERMISSIONS.SURVEYS_VIEW);

// ----------------------------------------------------
// Kundenumfragen (NPS): Auswertung (unter /crm/surveys)
// ----------------------------------------------------

router.get("/", view, surveyController.index);
router.get("/export", view, surveyController.exportCsv);

module.exports = router;
