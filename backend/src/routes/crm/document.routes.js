const express = require("express");

const router = express.Router();

const upload = require("../../config/multer");
const documentController = require("../../controllers/crm/document.controller");
const { requirePermission, PERMISSIONS } = require("../../core/permissions");
const { setFlash } = require("../../core/http/flash");
const { safeRedirectTarget } = require("../../core/http/redirect");

// ----------------------------------------------------
// Dokumente (Nextcloud) unter /crm/documents
// ----------------------------------------------------
//
// Die Seite je Bezug liegt beim Bezug, z. B. /crm/companies/:id/documents.
// Welche Kategorien jemand sieht, prüft der document.service.

/**
 * Datei annehmen; zu große Datei → Hinweis statt Fehlerseite
 */
function receiveFile(req, res, next) {

    upload.single("file")(req, res, (err) => {

        if (!err) return next();

        if (err.code === "LIMIT_FILE_SIZE") {

            const limit = parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 100;

            setFlash(req, "danger", `Die Datei ist zu groß (höchstens ${limit} MB).`);

            return res.redirect(safeRedirectTarget(req.query.returnTo, "/crm"));

        }

        next(err);

    });

}

router.post("/", requirePermission(PERMISSIONS.DOCUMENTS_UPLOAD), receiveFile, documentController.upload);

router.get("/:id/download", requirePermission(PERMISSIONS.DOCUMENTS_VIEW), documentController.download);

router.post("/:id/rename", requirePermission(PERMISSIONS.DOCUMENTS_EDIT), documentController.rename);
router.post("/:id/move", requirePermission(PERMISSIONS.DOCUMENTS_EDIT), documentController.move);
router.post("/:id/delete", requirePermission(PERMISSIONS.DOCUMENTS_DELETE), documentController.remove);

module.exports = router;
