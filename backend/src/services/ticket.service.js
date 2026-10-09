const Ticket = require("../models/ticket.model");
const counterService = require("./counter.service");
const { escapeRegex } = require("./search.service");

class TicketService {

    /**
     * Alle Tickets laden
     */
    async getAll(filters = {}) {

        const query = {
            isDeleted: false
        };

        if (filters.status) {
            query.status = filters.status;
        }

        if (filters.priority) {
            query.priority = filters.priority;
        }

        if (filters.company) {
            query.company = filters.company;
        }

        if (filters.search) {

            query.$or = [

                {
                    ticketNumber: {
                        $regex: escapeRegex(filters.search),
                        $options: "i"
                    }
                },

                {
                    subject: {
                        $regex: escapeRegex(filters.search),
                        $options: "i"
                    }
                },

                {
                    description: {
                        $regex: escapeRegex(filters.search),
                        $options: "i"
                    }
                }

            ];

        }

        return await Ticket.find(query)
            .populate("company")
            .populate("contact")
            .populate("assignedTo")
            .populate("createdBy")
            .sort({ createdAt: -1 });

    }

    /**
     * Einzelnes Ticket laden
     */
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

    /**
     * ID des Erstellers (CRM-Benutzer oder Portalzugang), unaufgelöst
     */
    async getCreatorId(id) {

        const ticket = await Ticket.findOne({ _id: id, isDeleted: false }, "createdBy").lean();

        return ticket ? ticket.createdBy : null;

    }

    /**
     * Letzte Tickets einer Firma
     */
    async getRecentByCompany(companyId, limit = 5) {

        return await Ticket.find({

            company: companyId,
            isDeleted: false

        })

            .populate("assignedTo")

            .sort({
                createdAt: -1
            })

            .limit(limit);

    }

    /**
     * Alle Tickets einer Firma
     */
    async getByCompany(companyId) {

        return await Ticket.find({

            company: companyId,
            isDeleted: false

        })

            .populate("contact")
            .populate("assignedTo")
            .populate("createdBy")

            .sort({
                createdAt: -1
            });

    }

    /**
     * Ticket erstellen
     */
    async create(data) {

        const ticketNumber = await counterService.next(
            "ticket",
            "TIC"
        );

        const ticket = new Ticket({

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

        });

        return await ticket.save();

    }

    /**
     * Ticket aktualisieren
     */
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
                returnDocument: "after",
                runValidators: true
            }

        );

    }

    /**
     * Bearbeiter zuweisen
     */
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
                returnDocument: "after",
                runValidators: true
            }

        );

    }

    /**
     * Status ändern
     */
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
                returnDocument: "after",
                runValidators: true
            }

        );

    }

    /**
     * Ticket archivieren (Soft Delete)
     */
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
                returnDocument: "after"
            }

        );

    }

}

const { applyCrudAliases } = require("../core/service/crudAliases");

// Einheitliche Namen (findAll, findById, delete) zusätzlich zu den bisherigen
module.exports = applyCrudAliases(new TicketService());
