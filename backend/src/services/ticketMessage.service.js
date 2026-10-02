const TicketMessage = require("../models/ticketMessage.model");

class TicketMessageService {
    async getByTicket(ticketId) {
        return await TicketMessage.find({
            ticket: ticketId
        })
            .populate("author")
            .sort({ createdAt: 1 });
    }

    async create(data) {
        const message = new TicketMessage(data);

        return await message.save();
    }
}

module.exports = new TicketMessageService();