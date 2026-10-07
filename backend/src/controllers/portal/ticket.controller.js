const fs = require("fs");
const path = require("path");

const ticketService = require("../../services/ticket.service");
const ticketMessageService = require("../../services/ticketMessage.service");
const attachmentService = require("../../services/attachment.service");
const storageService = require("../../services/storage.service");
const formatFileSize = require("../../utils/formatFileSize");

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

        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {

            return res.redirect("/portal/tickets");

        }

        if (

            ticket.company._id.toString() !==
            req.session.portalUser.company.toString()

        ) {

            return res.redirect("/portal/tickets");

        }

        const [messages, attachments] = await Promise.all([

            ticketMessageService.getByTicket(
                req.params.id,
                false
            ),

            attachmentService.getByTicket(
                req.params.id,
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

        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {

            return res.redirect("/portal/tickets");

        }

        if (

            ticket.company._id.toString() !==
            req.session.portalUser.company.toString()

        ) {

            return res.redirect("/portal/tickets");

        }

        const message = req.body.message?.trim();

        if (!message) {

            return res.redirect(`/portal/tickets/${req.params.id}`);

        }

        await ticketMessageService.create({

            ticket: req.params.id,

            author: req.session.portalUser.id,

            message

        });

        res.redirect(`/portal/tickets/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Dateianhang hochladen
// ----------------------------------------------------

exports.uploadAttachment = async (req, res, next) => {

    try {

        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {

            return res.redirect("/portal/tickets");

        }

        if (

            ticket.company._id.toString() !==
            req.session.portalUser.company.toString()

        ) {

            return res.redirect("/portal/tickets");

        }

        if (!req.file) {

            return res.redirect(`/portal/tickets/${req.params.id}`);

        }

        const storedFile = await storageService.storeFile({

            ticketId: req.params.id,

            tempFile: req.file.path,

            originalName: req.file.originalname

        });

        await attachmentService.create({

            ticket: req.params.id,

            uploadedBy: req.session.portalUser.id,

            originalName: req.file.originalname,

            fileName: storedFile.filename,

            path: storedFile.relativePath,

            mimeType: req.file.mimetype,

            size: req.file.size,

            isInternal: false

        });

        if (fs.existsSync(req.file.path)) {

            fs.unlinkSync(req.file.path);

        }

        res.redirect(`/portal/tickets/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};
// ----------------------------------------------------
// Dateianhang herunterladen
// ----------------------------------------------------

exports.downloadAttachment = async (req, res, next) => {

    try {

        const ticket = await ticketService.getById(
            req.params.ticketId
        );

        if (!ticket) {

            return res.redirect("/portal/tickets");

        }

        if (

            ticket.company._id.toString() !==
            req.session.portalUser.company.toString()

        ) {

            return res.redirect("/portal/tickets");

        }

        const attachment = await attachmentService.getById(
            req.params.attachmentId
        );

        if (

            !attachment ||
            attachment.ticket.toString() !== req.params.ticketId ||
            attachment.isInternal

        ) {

            return res.redirect(
                `/portal/tickets/${req.params.ticketId}`
            );

        }

        const filePath = path.join(

            process.cwd(),
            "storage",
            attachment.path

        );

        if (!fs.existsSync(filePath)) {

            return res.redirect(
                `/portal/tickets/${req.params.ticketId}`
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

exports.deleteAttachment = async (req, res, next) => {

    try {

        const ticket = await ticketService.getById(
            req.params.ticketId
        );

        if (!ticket) {

            return res.redirect("/portal/tickets");

        }

        if (

            ticket.company._id.toString() !==
            req.session.portalUser.company.toString()

        ) {

            return res.redirect("/portal/tickets");

        }

        const attachment = await attachmentService.getById(
            req.params.attachmentId
        );

        if (

            !attachment ||
            attachment.ticket.toString() !== req.params.ticketId ||
            attachment.isInternal

        ) {

            return res.redirect(
                `/portal/tickets/${req.params.ticketId}`
            );

        }

        storageService.deleteFile(
            attachment.path
        );

        await attachmentService.delete(
            attachment._id
        );

        res.redirect(
            `/portal/tickets/${req.params.ticketId}`
        );

    } catch (err) {

        next(err);

    }

};