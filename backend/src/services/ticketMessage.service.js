const TicketMessage = require("../models/ticketMessage.model");
const Ticket = require("../models/ticket.model");

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

        return await TicketMessage.find(query)
            .populate("author")
            .sort({ createdAt: 1 });

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