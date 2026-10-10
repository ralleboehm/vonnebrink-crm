const { pipeline } = require("stream");

const documentService = require("../../services/document.service");
const rules = require("../../utils/documentRules");
const format = require("../../utils/format");

// ----------------------------------------------------
// Meine Dokumente (nur, was für diesen Kontakt freigegeben ist)
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        const documents = await documentService.portalDocuments(req.session.portalUser);

        // Nach Kategorie gruppieren, in der Reihenfolge der Portal-Kategorien
        const groups = rules.PORTAL_CATEGORIES
            .map((key) => ({ key, ...rules.CATEGORIES[key], documents: documents.filter((d) => d.category === key) }))
            .filter((group) => group.documents.length);

        res.render("portal/documents/index", {
            title: "Meine Dokumente",
            groups,
            total: documents.length,
            unavailable: req.query.fehler === "1",
            rules,
            format
        });

    } catch (err) {

        next(err);

    }

};

exports.download = async (req, res, next) => {

    try {

        const file = await documentService.getPortalDownload(req.params.id, req.session.portalUser);
        const inline = req.query.ansehen === "1" && rules.isPreviewable(file.document.mimeType);

        res.set("Content-Type", file.contentType);
        res.set("Content-Disposition", rules.contentDisposition(file.document.fileName, inline));
        res.set("Cache-Control", "private, no-store");

        if (!(inline && /^application\/pdf\b/i.test(file.contentType))) {
            res.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
        }

        if (file.size != null) res.set("Content-Length", String(file.size));

        pipeline(file.stream, res, (err) => {
            if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
                console.error("Portal-Download abgebrochen:", err.message);
            }
        });

    } catch (err) {

        if (err.status === 404) return next();

        // Nextcloud nicht erreichbar oder nicht eingerichtet
        if (err.status) return res.redirect("/portal/documents?fehler=1");

        next(err);

    }

};
