const { pipeline } = require("stream");
const mongoose = require("mongoose");

const documentService = require("../../services/document.service");
const companyService = require("../../services/company.service");
const rules = require("../../utils/documentRules");
const format = require("../../utils/format");
const { setFlash, takeFlash } = require("../../core/http/flash");
const { safeRedirectTarget } = require("../../core/http/redirect");

const RESULT_TEXT = {
    created: (doc) => `„${doc.fileName}“ wurde hochgeladen.`,
    version: (doc) => `„${doc.fileName}“ gab es schon – als Version ${doc.version} gespeichert. Frühere Fassungen bleiben in Nextcloud erhalten.`,
    unchanged: (doc) => `„${doc.fileName}“ ist unverändert (gleicher Inhalt) – nichts hochgeladen.`
};

/**
 * Fehler aus dem Service als Hinweis zeigen; unbekannte Fehler weiterreichen
 */
function flashError(req, err) {

    if (!err.status) return false;

    setFlash(req, err.status === 503 ? "warning" : "danger", err.message);

    return true;

}

async function backTo(req, document, fallback = "/crm") {

    const target = safeRedirectTarget(req.query.returnTo || (req.body && req.body.returnTo), null);

    if (target) return target;

    return document ? documentService.referenceLink(document) : fallback;

}

/**
 * Reiter „Dokumente“ einer Firma
 */
exports.companyDocuments = async (req, res, next) => {

    try {

        const company = mongoose.isValidObjectId(req.params.id) ? await companyService.getById(req.params.id) : null;

        if (!company) return next();

        const page = await documentService.referencePage("company", company, req.session.user, {
            category: typeof req.query.category === "string" ? req.query.category : ""
        });

        res.render("companies/documents", {
            title: `${company.companyName} – Dokumente`,
            company,
            page,
            rules,
            format,
            returnTo: req.originalUrl,
            maxUploadMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 100,
            flash: takeFlash(req)
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Datei hochladen (multer: Feld "file")
 */
exports.upload = async (req, res, next) => {

    const body = req.body || {};
    const fallback = safeRedirectTarget(req.query.returnTo, "/crm");

    try {

        const { document, result } = await documentService.upload({
            referenceType: body.referenceType,
            referenceId: body.referenceId,
            category: body.category,
            tags: body.tags,
            file: req.file,
            user: req.session.user
        });

        setFlash(req, result === "unchanged" ? "info" : "success", RESULT_TEXT[result](document));

        res.redirect(await backTo(req, document));

    } catch (err) {

        if (!flashError(req, err)) return next(err);

        res.redirect(fallback);

    }

};

/**
 * Herunterladen bzw. im Browser ansehen (?inline=1, nur PDF/Bilder/Text)
 */
exports.download = async (req, res, next) => {

    try {

        const file = await documentService.getDownload(req.params.id, req.session.user);
        const inline = req.query.inline === "1" && file.inlineAllowed;

        res.set("Content-Type", file.contentType);
        res.set("Content-Disposition", rules.contentDisposition(file.document.fileName, inline));
        res.set("Cache-Control", "private, no-store");

        // Hochgeladene Inhalte nie als aktive Seite ausführen. Ausnahme: PDF-Vorschau –
        // der PDF-Betrachter der Browser läuft in einer Sandbox nicht.
        if (!(inline && /^application\/pdf\b/i.test(file.contentType))) {
            res.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
        }

        if (file.size != null) res.set("Content-Length", String(file.size));

        // pipeline schließt auch die Nextcloud-Verbindung, wenn der Browser abbricht
        pipeline(file.stream, res, (err) => {
            if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
                console.error("Download aus Nextcloud abgebrochen:", err.message);
            }
        });

    } catch (err) {

        if (err.status === 404) return next();

        if (!flashError(req, err)) return next(err);

        res.redirect(safeRedirectTarget(req.query.returnTo, "/crm"));

    }

};

/**
 * Umbenennen
 */
exports.rename = async (req, res, next) => {

    try {

        const document = await documentService.rename(req.params.id, (req.body || {}).fileName, req.session.user);

        setFlash(req, "success", `Umbenannt in „${document.fileName}“.`);

        res.redirect(await backTo(req, document));

    } catch (err) {

        if (!flashError(req, err)) return next(err);

        res.redirect(await backTo(req, null));

    }

};

/**
 * Andere Kategorie (anderer Ordner)
 */
exports.move = async (req, res, next) => {

    try {

        const document = await documentService.moveToCategory(req.params.id, (req.body || {}).category, req.session.user);

        setFlash(req, "success", `„${document.fileName}“ liegt jetzt unter ${rules.CATEGORIES[document.category].label}.`);

        res.redirect(await backTo(req, document));

    } catch (err) {

        if (!flashError(req, err)) return next(err);

        res.redirect(await backTo(req, null));

    }

};

/**
 * Löschen (Nextcloud-Papierkorb)
 */
exports.remove = async (req, res, next) => {

    try {

        const document = await documentService.remove(req.params.id, req.session.user);

        setFlash(req, "success", `„${document.fileName}“ wurde gelöscht (in Nextcloud im Papierkorb wiederherstellbar).`);

        res.redirect(await backTo(req, document));

    } catch (err) {

        if (!flashError(req, err)) return next(err);

        res.redirect(await backTo(req, null));

    }

};
