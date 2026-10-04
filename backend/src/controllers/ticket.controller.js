const ticketService = require("../services/ticket.service");
const ticketMessageService = require("../services/ticketMessage.service");
const activityService = require("../services/activity.service");
const companyService = require("../services/company.service");
const contactService = require("../services/contact.service");
const userService = require("../services/user.service");

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
            users
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

        res.redirect("/tickets");

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

        const [messages, users, activities] = await Promise.all([
            ticketMessageService.getByTicket(req.params.id),
            userService.getAll(),
            activityService.getByTicket(req.params.id)
        ]);

        res.render("tickets/show", {
            title: ticket.subject,
            ticket,
            messages: messages || [],
            users: users || [],
            activities: activities || []
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

            return res.redirect(`/tickets/${req.params.id}`);

        }

        await ticketMessageService.create({
            ticket: req.params.id,
            author: req.session.user.id,
            message
        });

        await activityService.log({
            ticket: req.params.id,
            user: req.session.user.id,
            action: "message_added",
            description: "Neue Nachricht hinzugefügt."
        });

        res.redirect(`/tickets/${req.params.id}`);

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

        res.redirect(`/tickets/${req.params.id}`);

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

                return res.redirect(`/tickets/${req.params.id}`);

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

        res.redirect(`/tickets/${req.params.id}`);

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

            return res.redirect("/tickets");

        }

        await activityService.log({
            ticket: req.params.id,
            user: req.session.user.id,
            action: "deleted",
            description: "Ticket gelöscht."
        });

        res.redirect("/tickets");

    } catch (err) {

        next(err);

    }

};