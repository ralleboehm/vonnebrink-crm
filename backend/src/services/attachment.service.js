const fs = require("fs");
const path = require("path");

const Attachment = require("../models/attachment.model");
const authorService = require("./author.service");
const storageService = require("./storage.service");

// ----------------------------------------------------
// Dateianhänge an Tickets
// ----------------------------------------------------
//
// Gemeinsam für CRM und Kundenportal:
//   storeUpload()       hochgeladene Datei (multer) ablegen + speichern
//   discardUpload()     temporäre Datei verwerfen (z. B. kein Zugriff)
//   findForTicket()     Anhang nur, wenn er zum Ticket gehört
//   getFilePath()       absoluter Pfad, null wenn die Datei fehlt
//   removeWithFile()    Datei und Datensatz löschen
//
// Ablage: storage/tickets/<Ticketnummer>/<zufälliger Name>.<endung>

class AttachmentService {

    async getByTicket(ticketId, includeInternal = true) {

        const query = {
            ticket: ticketId
        };

        if (!includeInternal) {
            query.isInternal = false;
        }

        const attachments = await Attachment.find(query)
            .sort({
                createdAt: 1
            })
            .lean();

        // Hochgeladen von: CRM-Benutzer oder Portalzugang
        return await authorService.attach(attachments, "uploadedBy");

    }

    async getById(id) {

        return await Attachment.findById(id)
            .populate("uploadedBy");

    }

    async create(data) {

        const attachment = new Attachment(data);

        return await attachment.save();

    }

    async delete(id) {

        return await Attachment.findByIdAndDelete(id);

    }

    // ------------------------------------------------
    // Dateien
    // ------------------------------------------------

    /**
     * Hochgeladene Datei zum Ticket verschieben und Anhang anlegen.
     *
     * @param {object} options
     * @param {object} options.ticket      Ticket (mit _id und ticketNumber)
     * @param {object} options.file        req.file von multer
     * @param {string} options.uploadedBy  CRM-Benutzer- oder Portalzugangs-ID
     * @param {boolean} [options.isInternal]
     */
    async storeUpload({ ticket, file, uploadedBy, isInternal = false }) {

        const directory = storageService.getTicketDirectory(ticket.ticketNumber);
        const destination = path.join(directory, file.filename);

        await fs.promises.rename(file.path, destination);

        try {

            return await this.create({
                ticket: ticket._id,
                uploadedBy,
                originalName: file.originalname,
                fileName: file.filename,
                mimeType: file.mimetype,
                size: file.size,
                path: path.join("tickets", ticket.ticketNumber, file.filename),
                isInternal: Boolean(isInternal)
            });

        } catch (err) {

            // Ohne Datensatz keine verwaiste Datei zurücklassen
            await fs.promises.unlink(destination).catch(() => {});

            throw err;

        }

    }

    /**
     * Temporäre Upload-Datei löschen (Fehler werden ignoriert)
     */
    async discardUpload(file) {

        if (file && file.path) {
            await fs.promises.unlink(file.path).catch(() => {});
        }

    }

    /**
     * Anhang nur liefern, wenn er zum Ticket gehört.
     *
     * @param {string} attachmentId
     * @param {string} ticketId
     * @param {{includeInternal?: boolean}} options  Portal: false
     */
    async findForTicket(attachmentId, ticketId, { includeInternal = true } = {}) {

        const attachment = await this.getById(attachmentId);

        if (!attachment || String(attachment.ticket) !== String(ticketId)) {
            return null;
        }

        if (!includeInternal && attachment.isInternal) {
            return null;
        }

        return attachment;

    }

    /**
     * Absoluter Pfad der Datei oder null, wenn sie nicht (mehr) existiert
     */
    getFilePath(attachment) {

        const filePath = path.join(storageService.basePath, attachment.path);

        return fs.existsSync(filePath) ? filePath : null;

    }

    /**
     * Datei und Datensatz löschen
     */
    async removeWithFile(attachment) {

        storageService.deleteFile(attachment.path);

        return this.delete(attachment._id);

    }

}

module.exports = new AttachmentService();
