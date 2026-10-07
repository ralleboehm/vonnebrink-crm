const TicketMessage = require("../models/ticketMessage.model");
const Ticket = require("../models/ticket.model");
const authorService = require("./author.service");

class TicketMessageService {

    async getByTicket(ticketId, includeInternal = true) {

        const ticket = await Ticket.findOne({
            _id: ticketId,
            isDeleted: false
        });

        if (!ticket) {
            return [];
        }

        const query = {
            ticket: ticketId
        };

        if (!includeInternal) {
            query.isInternal = false;
        }

        const messages = await TicketMessage.find(query)
            .sort({ createdAt: 1 })
            .lean();

        // Autor ist ein CRM-Benutzer oder ein Portalzugang
        return await authorService.attach(messages, "author");

    }

    async create(data) {

        const message = new TicketMessage({

            ticket: data.ticket,
            author: data.author,
            message: data.message,
            isInternal: data.isInternal || false

        });

        return await message.save();

    }

}

module.exports = new TicketMessageService();