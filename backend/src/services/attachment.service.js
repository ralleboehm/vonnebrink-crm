const Attachment = require("../models/attachment.model");

class AttachmentService {

    async getByTicket(ticketId, includeInternal = true) {

        const query = {
            ticket: ticketId
        };

        if (!includeInternal) {
            query.isInternal = false;
        }

        return await Attachment.find(query)
            .populate("uploadedBy")
            .sort({
                createdAt: 1
            });

    }

    async getById(id) {

        return await Attachment.findById(id)
            .populate("uploadedBy");

    }

    async create(data) {

        const attachment = new Attachment(data);

        return await attachment.save();

    }

    async delete(id) {

        return await Attachment.findByIdAndDelete(id);

    }

}

module.exports = new AttachmentService();