const TicketMessage = require("../models/ticketMessage.model");
const Ticket = require("../models/ticket.model");

class TicketMessageService {
    async getByTicket(ticketId) {
        const ticket = await Ticket.findOne({
            _id: ticketId,
            isDeleted: false
        });

        if (!ticket) {
            return [];
        }

        return await TicketMessage.find({
            ticket: ticketId
        })
            .populate("author")
            .sort({ createdAt: 1 });
    }

    async create(data) {
        const message = new TicketMessage({
            ticket: data.ticket,
            author: data.author,
            message: data.message
        });

        return await message.save();
    }
}

module.exports = new TicketMessageService();