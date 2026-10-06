const ticketService = require("../../services/ticket.service");

// ----------------------------------------------------

const ticketMessageService = require("../../services/ticketMessage.service");

// ----------------------------------------------------
// Meine Tickets
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        const tickets = await ticketService.getByCompany(
            req.session.user.company
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

            company: req.session.user.company,

            contact: req.session.user.contact,

            subject: req.body.subject,

            description: req.body.description,

            category: req.body.category,

            priority: req.body.priority,

            createdBy: req.session.user.id

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
            req.session.user.company.toString()

        ) {

            return res.redirect("/portal/tickets");

        }

        const messages = await ticketMessageService.getByTicket(
            req.params.id
        );

        res.render("portal/tickets/show", {

            title: ticket.ticketNumber,

            ticket,

            messages: messages || []

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
            req.session.user.company.toString()

        ) {

            return res.redirect("/portal/tickets");

        }

        const message = req.body.message?.trim();

        if (!message) {

            return res.redirect(`/portal/tickets/${req.params.id}`);

        }

        await ticketMessageService.create({

            ticket: req.params.id,

            author: req.session.user.id,

            message

        });

        res.redirect(`/portal/tickets/${req.params.id}`);

    } catch (err) {

        next(err);

    }

};