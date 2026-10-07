const fs = require("fs");
const path = require("path");

const ticketService = require("../../services/ticket.service");
const ticketMessageService = require("../../services/ticketMessage.service");
const authorService = require("../../services/author.service");
const attachmentService = require("../../services/attachment.service");
const storageService = require("../../services/storage.service");
const activityService = require("../../services/activity.service");
const companyService = require("../../services/company.service");
const contactService = require("../../services/contact.service");
const userService = require("../../services/user.service");
const formatFileSize = require("../../utils/formatFileSize");

/**
 * Hilfsfunktion zum Erstellen des Ticket-Objekts
 */
function getTicketData(body) {

    return {
        subject: body.subject?.trim(),
        description: body.description?.trim(),
        company: body.company || null,
        contact: body.contact || null,
        category: body.category,
        status: body.status,
        priority: body.priority,
        dueDate: body.dueDate || null
    };

}

/**
 * Ticketübersicht
 */
exports.index = async (req, res, next) => {

    try {

        const filters = {
            search: req.query.search || "",
            status: req.query.status || "",
            priority: req.query.priority || "",
            company: req.query.company || ""
        };

        const tickets = await ticketService.getAll(filters);

        res.render("tickets/index", {
            title: "Tickets",
            tickets,
            filters
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Neues Ticket anzeigen
 */
exports.create = async (req, res, next) => {

    try {

        const [companies, contacts, users] = await Promise.all([
            companyService.getAll(),
            contactService.getAll(),
            userService.getAll()
        ]);

        res.render("tickets/create", {
            title: "Neues Ticket",
            companies,
            contacts,
            users,
            selectedCompany: req.query.company || null
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Ticket speichern
 */
exports.store = async (req, res, next) => {

    try {

        const ticket = await ticketService.create({
            ...getTicketData(req.body),
            createdBy: req.session.user.id
        });

        await activityService.log({
            ticket: ticket._id,
            user: req.session.user.id,
            action: "created",
            description: "Ticket erstellt."
        });

        res.redirect("/crm/tickets");

    } catch (err) {

        next(err);

    }

};

/**
 * Ticket anzeigen
 */
exports.show = async (req, res, next) => {

    try {

        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {

            return res.status(404).render("errors/404", {
                title: "Ticket nicht gefunden"
            });

        }

        const [messages, attachments, users, activities, creatorId] =
            await Promise.all([
                ticketMessageService.getByTicket(req.params.id),
                attachmentService.getByTicket(req.params.id),
                userService.getAll(),
                activityService.getByTicket(req.params.id),
                ticketService.getCreatorId(req.params.id)
            ]);

        // Ersteller kann ein CRM-Benutzer oder ein Kunde (Portal) sein
        const createdBy = await authorService.describe(creatorId);

        res.render("tickets/show", {
            title: ticket.subject,
            ticket,
            createdBy,
            messages: messages || [],
            attachments: attachments || [],
            users: users || [],
            activities: activities || [],
            formatFileSize
        });

    } catch (err) {

        next(err);

    }

};
/**
 * Nachricht zu einem Ticket hinzufügen
 */
exports.addMessage = async (req, res, next) => {

    try {

        const message = req.body.message?.trim();

        if (!message) {

            return res.redirect(`/crm/tickets/${req.params.id}`);

        }

        await ticketMessageService.create({
            ticket: req.params.id,
            author: req.session.user.id,
            message,
            isInternal: req.body.isInternal === "on"
        });

        await activityService.log({
            ticket: req.params.id,
            user: req.session.user.id,
            action: "message_added",
            description: "Neue Nachricht hinzugefügt."
        });

        res.redirect(`/crm/tickets/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

/**
 * Dateianhang hochladen
 */
exports.uploadAttachment = async (req, res, next) => {

    try {

        if (!req.file) {

            return res.redirect(`/crm/tickets/${req.params.id}`);

        }

        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {

            if (fs.existsSync(req.file.path)) {

                fs.unlinkSync(req.file.path);

            }

            return res.redirect("/crm/tickets");

        }

        const ticketDirectory = storageService.getTicketDirectory(
            ticket.ticketNumber
        );

        const destination = path.join(
            ticketDirectory,
            req.file.filename
        );

        fs.renameSync(
            req.file.path,
            destination
        );

        await attachmentService.create({

            ticket: ticket._id,

            uploadedBy: req.session.user.id,

            originalName: req.file.originalname,

            fileName: req.file.filename,

            mimeType: req.file.mimetype,

            size: req.file.size,

            path: path.join(
                "tickets",
                ticket.ticketNumber,
                req.file.filename
            ),

            isInternal: req.body.isInternal === "on"

        });

        await activityService.log({

            ticket: ticket._id,

            user: req.session.user.id,

            action: "attachment_added",

            description: `Datei "${req.file.originalname}" hochgeladen.`

        });

        res.redirect(`/crm/tickets/${ticket._id}`);

    } catch (err) {

        next(err);

    }

};

/**
 * Formular "Ticket bearbeiten"
 */
exports.edit = async (req, res, next) => {

    try {

        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {

            return res.status(404).render("errors/404", {
                title: "Ticket nicht gefunden"
            });

        }

        const [companies, contacts, users] = await Promise.all([
            companyService.getAll(),
            contactService.getAll(),
            userService.getAll()
        ]);

        res.render("tickets/edit", {
            title: "Ticket bearbeiten",
            ticket,
            companies,
            contacts,
            users
        });

    } catch (err) {

        next(err);

    }

};
/**
 * Ticket aktualisieren
 */
exports.update = async (req, res, next) => {

    try {

        await ticketService.update(
            req.params.id,
            getTicketData(req.body)
        );

        res.redirect(`/crm/tickets/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

/**
 * Ticket einem Bearbeiter zuweisen
 */
exports.assign = async (req, res, next) => {

    try {

        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {

            return res.status(404).render("errors/404", {
                title: "Ticket nicht gefunden"
            });

        }

        if (req.body.assignedTo) {

            const user = await userService.getById(req.body.assignedTo);

            if (!user || !user.active) {

                return res.redirect(`/crm/tickets/${req.params.id}`);

            }

        }

        await ticketService.assign(
            req.params.id,
            req.body.assignedTo || null
        );

        await activityService.log({

            ticket: req.params.id,

            user: req.session.user.id,

            action: req.body.assignedTo
                ? "assigned"
                : "unassigned",

            field: "assignedTo",

            newValue: req.body.assignedTo || null,

            description: req.body.assignedTo
                ? "Bearbeiter geändert."
                : "Bearbeiter entfernt."

        });

        res.redirect(`/crm/tickets/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};

/**
 * Ticket löschen (Soft Delete)
 */
exports.destroy = async (req, res, next) => {

    try {

        const deleted = await ticketService.softDelete(req.params.id);

        if (!deleted) {

            return res.redirect("/crm/tickets");

        }

        await activityService.log({

            ticket: req.params.id,

            user: req.session.user.id,

            action: "deleted",

            description: "Ticket gelöscht."

        });

        res.redirect("/crm/tickets");

    } catch (err) {

        next(err);

    }

};
/**
 * Dateianhang herunterladen
 */
exports.downloadAttachment = async (req, res, next) => {

    try {

        const attachment = await attachmentService.getById(
            req.params.attachmentId
        );

        if (!attachment) {

            return res.redirect(`/crm/tickets/${req.params.id}`);

        }

        const absolutePath = path.join(
            process.cwd(),
            "storage",
            attachment.path
        );

        if (!fs.existsSync(absolutePath)) {

            return res.redirect(`/crm/tickets/${req.params.id}`);

        }

        return res.download(
            absolutePath,
            attachment.originalName
        );

    } catch (err) {

        next(err);

    }

};

/**
 * Dateianhang löschen
 */
exports.deleteAttachment = async (req, res, next) => {

    try {

        const attachment = await attachmentService.getById(
            req.params.attachmentId
        );

        if (!attachment) {

            return res.redirect(`/crm/tickets/${req.params.id}`);

        }

        const absolutePath = path.join(
            process.cwd(),
            "storage",
            attachment.path
        );

        if (fs.existsSync(absolutePath)) {

            fs.unlinkSync(absolutePath);

        }

        await attachmentService.delete(
            attachment._id
        );

        await activityService.log({

            ticket: req.params.id,

            user: req.session.user.id,

            action: "attachment_removed",

            description: `Datei "${attachment.originalName}" gelöscht.`

        });

        res.redirect(`/crm/tickets/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};