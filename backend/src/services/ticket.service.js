const Ticket = require("../models/ticket.model");
const counterService = require("./counter.service");

class TicketService {
    async getAll() {
        return await Ticket.find({ isDeleted: false })
            .populate("company")
            .populate("contact")
            .populate("assignedTo")
            .populate("createdBy")
            .sort({ createdAt: -1 });
    }

    async getById(id) {
        return await Ticket.findOne({
            _id: id,
            isDeleted: false
        })
            .populate("company")
            .populate("contact")
            .populate("assignedTo")
            .populate("createdBy");
    }

    async create(data) {
        const ticketNumber = await counterService.next("ticket", "TIC");

        const ticketData = {
            ...data,
            ticketNumber,
            contact: data.contact || null,
            assignedTo: null
        };

        const ticket = new Ticket(ticketData);

        return await ticket.save();
    }

    async update(id, data) {
        const updateData = {
            company: data.company,
            contact: data.contact || null,
            subject: data.subject,
            description: data.description,
            priority: data.priority,
            status: data.status
        };

        return await Ticket.findByIdAndUpdate(
            id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        );
    }

    async assign(id, assignedTo) {
        return await Ticket.findByIdAndUpdate(
            id,
            {
                assignedTo: assignedTo || null
            },
            {
                new: true,
                runValidators: true
            }
        );
    }

    async updateStatus(id, status) {
        return await Ticket.findByIdAndUpdate(
            id,
            { status },
            {
                new: true,
                runValidators: true
            }
        );
    }

    async softDelete(id) {
        return await Ticket.findByIdAndUpdate(
            id,
            { isDeleted: true },
            { new: true }
        );
    }
}

module.exports = new TicketService();