const Attachment = require("../models/attachment.model");
const authorService = require("./author.service");

class AttachmentService {

    async getByTicket(ticketId, includeInternal = true) {

        const query = {
            ticket: ticketId
        };

        if (!includeInternal) {
            query.isInternal = false;
        }

        const attachments = await Attachment.find(query)
            .sort({
                createdAt: 1
            })
            .lean();

        // Hochgeladen von: CRM-Benutzer oder Portalzugang
        return await authorService.attach(attachments, "uploadedBy");

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