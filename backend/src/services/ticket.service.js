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
            ticketNumber,
            company: data.company,
            contact: data.contact || null,
            subject: data.subject,
            description: data.description,
            category: data.category,
            priority: data.priority,
            dueDate: data.dueDate || null,
            createdBy: data.createdBy,
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
            category: data.category,
            priority: data.priority,
            status: data.status,
            dueDate: data.dueDate || null
        };

        return await Ticket.findOneAndUpdate(
            {
                _id: id,
                isDeleted: false
            },
            updateData,
            {
                new: true,
                runValidators: true
            }
        );
    }

    async assign(id, assignedTo) {
        return await Ticket.findOneAndUpdate(
            {
                _id: id,
                isDeleted: false
            },
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
        return await Ticket.findOneAndUpdate(
            {
                _id: id,
                isDeleted: false
            },
            {
                status
            },
            {
                new: true,
                runValidators: true
            }
        );
    }

    async softDelete(id) {
        return await Ticket.findOneAndUpdate(
            {
                _id: id,
                isDeleted: false
            },
            {
                isDeleted: true
            },
            {
                new: true
            }
        );
    }
}

module.exports = new TicketService();