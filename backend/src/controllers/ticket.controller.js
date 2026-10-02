const ticketService = require("../services/ticket.service");
const ticketMessageService = require("../services/ticketMessage.service");
const companyService = require("../services/company.service");
const contactService = require("../services/contact.service");
const userService = require("../services/user.service");

exports.index = async (req, res, next) => {
    try {
        const tickets = await ticketService.getAll();

        res.render("tickets/index", {
            title: "Tickets",
            tickets
        });
    } catch (err) {
        next(err);
    }
};

exports.create = async (req, res, next) => {
    try {
        const companies = await companyService.getAll();
        const contacts = await contactService.getAll();
        const users = await userService.getAll();

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

exports.store = async (req, res, next) => {
    try {
        await ticketService.create({
            ...req.body,
            createdBy: req.session.user.id
        });

        res.redirect("/tickets");
    } catch (err) {
        next(err);
    }
};

exports.show = async (req, res, next) => {
    try {
        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {
            return res.status(404).send("Ticket nicht gefunden");
        }

        const messages = await ticketMessageService.getByTicket(
            req.params.id
        );

        const users = await userService.getAll();

        res.render("tickets/show", {
            title: ticket.subject,
            ticket,
            messages,
            users
        });
    } catch (err) {
        next(err);
    }
};

exports.addMessage = async (req, res, next) => {
    try {
        await ticketMessageService.create({
            ticket: req.params.id,
            author: req.session.user.id,
            message: req.body.message
        });

        res.redirect(`/tickets/${req.params.id}`);
    } catch (err) {
        next(err);
    }
};

exports.edit = async (req, res, next) => {
    try {
        const ticket = await ticketService.getById(req.params.id);

        if (!ticket) {
            return res.status(404).send("Ticket nicht gefunden");
        }

        const companies = await companyService.getAll();
        const contacts = await contactService.getAll();
        const users = await userService.getAll();

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

exports.update = async (req, res, next) => {
    try {
        await ticketService.update(req.params.id, req.body);

        res.redirect(`/tickets/${req.params.id}`);
    } catch (err) {
        next(err);
    }
};

exports.assign = async (req, res, next) => {
    try {
        await ticketService.assign(
            req.params.id,
            req.body.assignedTo
        );

        res.redirect(`/tickets/${req.params.id}`);
    } catch (err) {
        next(err);
    }
};

exports.destroy = async (req, res, next) => {
    try {
        await ticketService.softDelete(req.params.id);

        res.redirect("/tickets");
    } catch (err) {
        next(err);
    }
};