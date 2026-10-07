const express = require("express");

const router = express.Router();

const searchController = require("../../controllers/crm/search.controller");
const { requireAuth } = require("../../middleware/auth/crmAuth.middleware");
const { requireInternal } = require("../../middleware/crm/internal.middleware");

// Live-Vorschläge für das Suchfeld (JSON) – vor "/" eintragen
router.get("/suggest", requireAuth, requireInternal, searchController.suggest);

// Ergebnisseite
router.get("/", requireAuth, requireInternal, searchController.index);

module.exports = router;
