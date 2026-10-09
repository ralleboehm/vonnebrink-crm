const ticketService = require("../../services/ticket.service");
const ticketMessageService = require("../../services/ticketMessage.service");
const attachmentService = require("../../services/attachment.service");
const formatFileSize = require("../../utils/formatFileSize");
const notificationService = require("../../services/notification.service");

// ----------------------------------------------------
// Meine Tickets
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        const tickets = await ticketService.getByCompany(
            req.session.portalUser.company
        );

        res.render("portal/tickets/index", {

            title: "Meine Tickets",

            tickets

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Neues Ticket
// ----------------------------------------------------

exports.create = async (req, res, next) => {

    try {

        res.render("portal/tickets/create", {

            title: "Neues Ticket"

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Ticket speichern
// ----------------------------------------------------

exports.store = async (req, res, next) => {

    try {

        const ticket = await ticketService.create({

            company: req.session.portalUser.company,

            contact: req.session.portalUser.contact,

            subject: req.body.subject,

            description: req.body.description,

            category: req.body.category,

            priority: req.body.priority,

            createdBy: req.session.portalUser.id

        });

        // Benachrichtigungen & E-Mails (scheitert nie, Mails laufen im Hintergrund)
        await notificationService.ticketCreated(ticket, {
            source: "portal"
        });

        res.redirect(`/portal/tickets/${ticket._id}`);

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Ticket anzeigen
// ----------------------------------------------------

exports.show = async (req, res, next) => {

    try {

        // req.ticket: geladen und geprüft von loadOwnTicket()
        const ticket = req.ticket;

        const [messages, attachments] = await Promise.all([

            ticketMessageService.getByTicket(
                ticket._id,
                false
            ),

            attachmentService.getByTicket(
                ticket._id,
                false
            )

        ]);

        res.render("portal/tickets/show", {

            title: ticket.ticketNumber,

            ticket,

            messages: messages || [],

            attachments: attachments || [],

            formatFileSize

        });

    } catch (err) {

        next(err);

    }

};
// ----------------------------------------------------
// Antwort hinzufügen
// ----------------------------------------------------

exports.addMessage = async (req, res, next) => {

    try {

        const ticket = req.ticket;

        const message = req.body.message?.trim();

        if (!message) {

            return res.redirect(`/portal/tickets/${ticket._id}`);

        }

        await ticketMessageService.create({

            ticket: ticket._id,

            author: req.session.portalUser.id,

            message

        });

        res.redirect(`/portal/tickets/${ticket._id}`);

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Dateianhang hochladen
// ----------------------------------------------------

exports.uploadAttachment = async (req, res, next) => {

    try {

        const ticket = req.ticket;

        if (!req.file) {

            return res.redirect(`/portal/tickets/${ticket._id}`);

        }

        await attachmentService.storeUpload({

            ticket,

            file: req.file,

            uploadedBy: req.session.portalUser.id,

            isInternal: false

        });

        res.redirect(`/portal/tickets/${ticket._id}`);

    } catch (err) {

        await attachmentService.discardUpload(req.file);

        next(err);

    }

};
// ----------------------------------------------------
// Dateianhang herunterladen
// ----------------------------------------------------

exports.downloadAttachment = async (req, res, next) => {

    try {

        const ticket = req.ticket;

        // Nur Anhänge dieses Tickets, keine internen
        const attachment = await attachmentService.findForTicket(
            req.params.attachmentId,
            ticket._id,
            { includeInternal: false }
        );

        const filePath = attachment && attachmentService.getFilePath(attachment);

        if (!filePath) {

            return res.redirect(
                `/portal/tickets/${ticket._id}`
            );

        }

        return res.download(
            filePath,
            attachment.originalName
        );

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Dateianhang löschen
// ----------------------------------------------------

// Hinweis: derzeit nicht verdrahtet. Beim Einbinden in die Routen
// loadOwnTicket("ticketId") davorsetzen (stellt req.ticket bereit).
exports.deleteAttachment = async (req, res, next) => {

    try {

        const ticket = req.ticket;

        const attachment = await attachmentService.findForTicket(
            req.params.attachmentId,
            ticket._id,
            { includeInternal: false }
        );

        if (attachment) {

            await attachmentService.removeWithFile(attachment);

        }

        res.redirect(
            `/portal/tickets/${ticket._id}`
        );

    } catch (err) {

        next(err);

    }

};