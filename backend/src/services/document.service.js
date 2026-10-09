"use strict";

// ----------------------------------------------------
// Dokumente (Nextcloud-Ablage, Metadaten in MongoDB)
// ----------------------------------------------------
//
// Fachlogik für alle Bereiche, die Dokumente haben (Firma; Tickets und
// Assets folgen). Die Datei selbst liegt immer in Nextcloud, MongoDB kennt
// nur die Metadaten (models/document.model.js).
//
//   Kundenordner     ensureCustomerStructure(company)   – auch automatisch bei neuer Firma
//   Seite            referencePage(type, ref, user, {category})
//   Hochladen        upload({ referenceType, referenceId, category, tags, file, user })
//   Herunterladen    getDownload(id, user)
//   Ändern           rename(id, name, user), moveToCategory(id, category, user)
//   Löschen          remove(id, user)               – Nextcloud-Papierkorb
//   Versionen        versions(id, user)
//
// Bezüge: registerReference(type, resolver) – ein Resolver sagt, zu welcher
// Firma ein Bezug gehört und in welchen Unterordner seine Dokumente kommen.
//
// Fehler: Error mit .status (403, 404, 409, 422, 503) und deutscher Meldung.
// Ereignisse (core/events): document.uploaded, .downloaded, .updated,
// .deleted, .versionCreated (später .shared) – für Benachrichtigungen,
// Aktivitäten und Audit.

const crypto = require("crypto");
const fs = require("fs");
const mongoose = require("mongoose");

const Document = require("../models/document.model");
const DocumentFolder = require("../models/documentFolder.model");
const Company = require("../models/company.model");

const nextcloud = require("./nextcloud.service");
const rules = require("../utils/documentRules");
const events = require("../core/events");
const { can } = require("../core/permissions");

const { paths } = nextcloud;
const { EVENTS } = events;

// Unterordner höchstens alle 10 Minuten prüfen (spart Anfragen)
const STRUCTURE_RECHECK_MS = 10 * 60 * 1000;

// Neue Dateien: "Name (2).pdf" usw., falls der Name in Nextcloud schon vergeben ist
const MAX_NAME_ATTEMPTS = 20;

function httpError(message, status) {

    const error = new Error(message);
    error.status = status;

    return error;

}

function emit(event, payload) {

    // Ereignisse blockieren die Aktion nie
    events.emit(event, payload).catch(() => {});

}

function userId(user) {

    return user && (user.id || user._id) ? String(user.id || user._id) : null;

}

// ----------------------------------------------------
// Bezüge
// ----------------------------------------------------

const references = new Map();

/**
 * Bezug anmelden.
 *
 * @param {string} type  Schlüssel aus documentRules.REFERENCE_TYPES
 * @param {(id) => Promise<{company, title, link, folder: (category) => string[]}|null>} resolve
 */
function registerReference(type, resolve) {

    if (!rules.isReferenceType(type)) throw new Error(`Unbekannter Dokument-Bezug "${type}".`);

    references.set(type, resolve);

}

async function resolveReference(type, id) {

    const resolve = references.get(type);

    if (!resolve || !mongoose.isValidObjectId(id)) return null;

    return resolve(id);

}

// Firma: Dokumente nach Kategorie in Contracts/, Offers/ …
registerReference("company", async (id) => {

    const company = await Company.findOne({ _id: id, isDeleted: false }).lean();

    if (!company) return null;

    return {
        company,
        title: company.companyName,
        link: `/crm/companies/${company._id}/documents`,
        folder: (category) => [rules.CATEGORIES[category].folder]
    };

});

// ----------------------------------------------------
// Kundenordner
// ----------------------------------------------------

async function customerFolderPath(company) {

    const known = await DocumentFolder.findOne({ refType: "company", refId: company._id }).lean();

    return {
        path: known ? known.path : nextcloud.rootPath(rules.CUSTOMERS_FOLDER, rules.customerFolderName(company)),
        known
    };

}

/**
 * Kundenordner mit allen Unterordnern anlegen – vorhandene bleiben
 * unangetastet. Der Pfad wird gemerkt (Umbenennen der Firma ändert ihn nicht).
 *
 * @returns {Promise<string>} Pfad des Kundenordners
 */
async function ensureCustomerStructure(company, { force = false } = {}) {

    if (!nextcloud.isConfigured()) throw httpError("Nextcloud ist nicht eingerichtet.", 503);

    const { path, known } = await customerFolderPath(company);

    if (!force && known && known.checkedAt && Date.now() - new Date(known.checkedAt).getTime() < STRUCTURE_RECHECK_MS) {
        return path;
    }

    const created = await nextcloud.ensureSubfolders(path, rules.CUSTOMER_FOLDERS);

    await DocumentFolder.updateOne(
        { refType: "company", refId: company._id },
        { $set: { path, checkedAt: new Date() } },
        { upsert: true }
    );

    if (created.length) {
        console.log(`☁️  Nextcloud: Kundenordner ${path} – ${created.length} Ordner angelegt.`);
    }

    return path;

}

// Neue Firmen im Hintergrund anlegen, nacheinander
let queue = Promise.resolve();

function enqueue(label, task) {

    queue = queue.then(task).catch((err) => {
        console.error(`☁️  Nextcloud: ${label} fehlgeschlagen: ${err.message}`);
    });

    return queue;

}

/**
 * Für Tests und Skripte: warten, bis alle Hintergrundaufgaben fertig sind
 */
function whenIdle() {

    return queue;

}

let subscribed = false;

function subscribe() {

    if (subscribed) return;

    events.on(EVENTS.CUSTOMER_CREATED, (payload = {}) => {

        if (!nextcloud.isConfigured() || !payload.company) return "aus";

        enqueue(`Kundenordner für ${payload.company.customerNumber || payload.company._id}`, () => ensureCustomerStructure(payload.company));

        return "eingeplant";

    }, { name: "documents" });

    subscribed = true;

}

subscribe();

/**
 * Kundenordner für alle Firmen anlegen (Einrichtung, scripts/nextcloud-setup.js)
 *
 * @returns {Promise<{companies: number, failed: Array<{company, error}>}>}
 */
async function ensureAllCustomerStructures() {

    const companies = await Company.find({ isDeleted: false }, "customerNumber companyName").sort({ customerNumber: 1 }).lean();
    const failed = [];

    for (const company of companies) {

        try {
            await ensureCustomerStructure(company, { force: true });
        } catch (err) {
            failed.push({ company: `${company.customerNumber} ${company.companyName}`, error: err.message });
        }

    }

    return { companies: companies.length, failed };

}

// ----------------------------------------------------
// Rechte
// ----------------------------------------------------

function assertPermission(user, permission) {

    if (!can(user, permission)) throw httpError("Dafür fehlen Ihnen die Rechte.", 403);

}

function assertConfigured() {

    if (!nextcloud.isConfigured()) {
        throw httpError("Die Dokumentenablage (Nextcloud) ist noch nicht eingerichtet.", 503);
    }

}

/**
 * Dokument laden, das der Benutzer sehen darf – sonst 404
 * (fremde Kategorien sollen nicht einmal als vorhanden erkennbar sein).
 */
async function loadVisible(id, user) {

    if (!mongoose.isValidObjectId(id)) throw httpError("Dokument nicht gefunden.", 404);

    const document = await Document.findOne({ _id: id, isDeleted: false });

    if (!document || !can(user, "documents.view") || !rules.mayUseCategory(user, document.category)) {
        throw httpError("Dokument nicht gefunden.", 404);
    }

    return document;

}

// ----------------------------------------------------
// Anzeige
// ----------------------------------------------------

/**
 * Link zur Seite, auf der das Dokument angezeigt wird
 */
async function referenceLink(document) {

    const ref = await resolveReference(document.reference.type, document.reference.id);

    return ref ? ref.link : "/crm";

}

/**
 * Daten für die Dokumente-Seite eines Bezugs
 *
 * @param {string} type     z. B. "company"
 * @param {object} record   der Bezug (z. B. die Firma)
 * @param {object} user
 * @param {{category?: string}} [filters]
 */
async function referencePage(type, record, user, filters = {}) {

    const allowed = rules.allowedCategories(user);
    const category = allowed.includes(filters.category) ? filters.category : "";

    const all = await Document.find({
        "reference.type": type,
        "reference.id": record._id,
        isDeleted: false,
        category: { $in: allowed }
    })
        .populate("uploadedBy", "firstName lastName")
        .sort({ uploadedAt: -1 })
        .lean();

    const counts = {};

    for (const doc of all) counts[doc.category] = (counts[doc.category] || 0) + 1;

    const status = nextcloud.status();
    const folder = { path: null, link: null, error: null };

    if (status.configured) {

        try {

            const company = type === "company" ? record : (await resolveReference(type, record._id) || {}).company;

            if (company) {
                folder.path = await ensureCustomerStructure(company);
                folder.link = nextcloud.webLink({ folder: folder.path });
            }

        } catch (err) {

            folder.error = err.message;

        }

    }

    return {
        status,
        folder,
        category,
        categories: allowed.map((key) => ({ key, ...rules.CATEGORIES[key], count: counts[key] || 0 })),
        total: all.length,
        documents: category ? all.filter((d) => d.category === category) : all
    };

}

// ----------------------------------------------------
// Hochladen
// ----------------------------------------------------

function sha256(filePath) {

    return new Promise((resolve, reject) => {

        const hash = crypto.createHash("sha256");

        fs.createReadStream(filePath)
            .on("data", (chunk) => hash.update(chunk))
            .on("end", () => resolve(hash.digest("hex")))
            .on("error", reject);

    });

}

async function uploadNew(folder, fileName, file) {

    for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt++) {

        const name = attempt === 1 ? fileName : paths.numbered(fileName, attempt);
        const target = paths.join(folder, name);

        try {

            const info = await nextcloud.upload(target, { filePath: file.path }, { contentType: file.mimetype || "application/octet-stream", overwrite: false });

            return { name, info };

        } catch (err) {

            if (err.status !== 412) throw err;

        }

    }

    throw httpError("Für diese Datei wurde kein freier Name gefunden – bitte umbenennen.", 409);

}

/**
 * Datei hochladen. Gleicher Name im gleichen Ordner wird eine neue Version.
 *
 * @param {object} input
 * @param {string} input.referenceType
 * @param {string} input.referenceId
 * @param {string} input.category
 * @param {string|string[]} [input.tags]
 * @param {{path, originalname, mimetype, size}} input.file  von multer (temporäre Datei)
 * @param {object} input.user
 * @returns {Promise<{document, result: "created"|"version"|"unchanged"}>}
 */
async function upload({ referenceType, referenceId, category, tags, file, user }) {

    try {

        assertPermission(user, "documents.upload");
        assertConfigured();

        if (!file || !file.path) throw httpError("Bitte eine Datei auswählen.", 422);
        if (!file.size) throw httpError("Die Datei ist leer.", 422);
        if (!rules.isReferenceType(referenceType)) throw httpError("Unbekannter Bezug.", 422);
        if (!rules.isCategory(category)) throw httpError("Bitte eine Kategorie wählen.", 422);
        if (!rules.mayUseCategory(user, category)) throw httpError(`Dokumente der Kategorie „${rules.CATEGORIES[category].label}“ dürfen Sie nicht hochladen.`, 403);

        const ref = await resolveReference(referenceType, referenceId);

        if (!ref) throw httpError("Der Datensatz für dieses Dokument wurde nicht gefunden.", 404);

        const base = await ensureCustomerStructure(ref.company);
        const folder = paths.join(base, ...ref.folder(category));
        const fileName = paths.cleanFileName(file.originalname);
        const { extension } = paths.splitExtension(fileName);
        const checksum = await sha256(file.path);
        const newTags = rules.parseTags(tags);
        const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(String(file.mimetype || "")) ? String(file.mimetype).toLowerCase().slice(0, 150) : "application/octet-stream";

        // Gibt es das Dokument schon (gleicher Ordner, gleiche Kategorie)? Dann neue Version.
        // Mehrere Kategorien teilen sich Ordner (z. B. Backup/Sonstiges → Other) – eine
        // fremde Kategorie wird nie überschrieben, die Datei bekommt dann einen neuen Namen.
        const existing = await Document.findOne({ "nextcloud.path": paths.join(folder, fileName), isDeleted: false });

        if (existing && existing.category === category) {

            if (existing.checksum === checksum) {
                return { document: existing, result: "unchanged" };
            }

            const info = await nextcloud.upload(existing.nextcloud.path, { filePath: file.path }, { contentType: mimeType, overwrite: true });

            existing.set({
                originalName: String(file.originalname || "").slice(0, 255),
                mimeType,
                size: info.size == null ? file.size : info.size,
                checksum,
                version: existing.version + 1,
                tags: rules.parseTags([...(existing.tags || []), ...newTags]),
                uploadedAt: new Date(),
                uploadedBy: userId(user),
                "nextcloud.fileId": info.fileId || existing.nextcloud.fileId,
                "nextcloud.etag": info.etag
            });

            await existing.save();

            emit(EVENTS.DOCUMENT_VERSION_CREATED, { document: existing.toObject(), userId: userId(user), version: existing.version });

            return { document: existing, result: "version" };

        }

        const { name, info } = await uploadNew(folder, fileName, file);

        const document = await Document.create({
            fileName: name,
            originalName: String(file.originalname || "").slice(0, 255),
            extension,
            mimeType,
            size: info.size == null ? file.size : info.size,
            category,
            tags: newTags,
            checksum,
            version: 1,
            nextcloud: { fileId: info.fileId, path: paths.join(folder, name), etag: info.etag },
            reference: { type: referenceType, id: referenceId },
            company: ref.company._id,
            uploadedAt: new Date(),
            uploadedBy: userId(user)
        });

        emit(EVENTS.DOCUMENT_UPLOADED, { document: document.toObject(), userId: userId(user) });

        return { document, result: "created" };

    } finally {

        // Temporäre Datei von multer immer entfernen
        if (file && file.path) await fs.promises.unlink(file.path).catch(() => {});

    }

}

// ----------------------------------------------------
// Herunterladen, Ändern, Löschen
// ----------------------------------------------------

/**
 * @returns {Promise<{document, stream, contentType, size, inlineAllowed}>}
 */
async function getDownload(id, user) {

    assertConfigured();

    const document = await loadVisible(id, user);
    const file = await nextcloud.download(document.nextcloud.path);

    emit(EVENTS.DOCUMENT_DOWNLOADED, { document: document.toObject(), userId: userId(user) });

    return {
        document,
        stream: file.stream,
        contentType: document.mimeType || file.contentType,
        size: file.size,
        inlineAllowed: rules.isPreviewable(document.mimeType)
    };

}

/**
 * Umbenennen (Endung bleibt, wenn sie im neuen Namen fehlt)
 */
async function rename(id, newName, user) {

    assertPermission(user, "documents.edit");
    assertConfigured();

    const document = await loadVisible(id, user);

    let name = paths.cleanFileName(newName, "");

    if (!name || !String(newName || "").trim()) throw httpError("Bitte einen Dateinamen angeben.", 422);

    if (document.extension && !name.toLowerCase().endsWith(`.${document.extension}`)) {
        name = paths.cleanFileName(`${name}.${document.extension}`);
    }

    if (name === document.fileName) return document;

    const from = document.nextcloud.path;
    const target = paths.join(paths.parent(from), name);

    try {
        await nextcloud.move(from, target);
    } catch (err) {
        if (err.status === 412) throw httpError("Eine Datei mit diesem Namen gibt es dort bereits.", 409);
        throw err;
    }

    document.set({ fileName: name, extension: paths.splitExtension(name).extension, "nextcloud.path": target });
    await document.save();

    emit(EVENTS.DOCUMENT_UPDATED, { document: document.toObject(), userId: userId(user), change: "renamed", from });

    return document;

}

/**
 * In eine andere Kategorie (= anderen Ordner) verschieben
 */
async function moveToCategory(id, category, user) {

    assertPermission(user, "documents.edit");
    assertConfigured();

    const document = await loadVisible(id, user);

    if (!rules.isCategory(category)) throw httpError("Bitte eine Kategorie wählen.", 422);
    if (!rules.mayUseCategory(user, category)) throw httpError("In diese Kategorie dürfen Sie nicht verschieben.", 403);
    if (category === document.category) return document;

    const ref = await resolveReference(document.reference.type, document.reference.id);

    if (!ref) throw httpError("Der Datensatz für dieses Dokument wurde nicht gefunden.", 404);

    const base = await ensureCustomerStructure(ref.company);
    const from = document.nextcloud.path;
    const target = paths.join(base, ...ref.folder(category), document.fileName);

    if (target !== from) {

        try {
            await nextcloud.move(from, target);
        } catch (err) {
            if (err.status === 412) throw httpError("Im Zielordner gibt es schon eine Datei mit diesem Namen.", 409);
            throw err;
        }

    }

    const previous = document.category;

    document.set({ category, "nextcloud.path": target });
    await document.save();

    emit(EVENTS.DOCUMENT_UPDATED, { document: document.toObject(), userId: userId(user), change: "moved", from, previousCategory: previous });

    return document;

}

/**
 * Löschen: Datei in den Nextcloud-Papierkorb, Metadaten als gelöscht markieren
 */
async function remove(id, user) {

    assertPermission(user, "documents.delete");
    assertConfigured();

    const document = await loadVisible(id, user);

    await nextcloud.remove(document.nextcloud.path);

    document.set({ isDeleted: true, deletedAt: new Date(), deletedBy: userId(user) });
    await document.save();

    emit(EVENTS.DOCUMENT_DELETED, { document: document.toObject(), userId: userId(user) });

    return document;

}

/**
 * Frühere Versionen aus Nextcloud
 */
async function versions(id, user) {

    assertConfigured();

    const document = await loadVisible(id, user);

    return {
        document,
        versions: await nextcloud.versions(document.nextcloud.fileId)
    };

}

module.exports = {
    STRUCTURE_RECHECK_MS,
    registerReference,
    resolveReference,
    referenceLink,
    status: () => nextcloud.status(),

    ensureCustomerStructure,
    ensureAllCustomerStructures,
    whenIdle,

    referencePage,
    upload,
    getDownload,
    rename,
    moveToCategory,
    remove,
    versions
};
