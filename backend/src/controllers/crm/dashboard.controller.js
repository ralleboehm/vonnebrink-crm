const Company = require("../../models/company.model");
const Contact = require("../../models/contact.model");
const User = require("../../models/user.model");
const Ticket = require("../../models/ticket.model");

exports.index = async (req, res, next) => {
    try {
        const [
            companyCount,
            contactCount,
            userCount,
            openTicketCount,
            inProgressTicketCount,
            recentCompanies,
            recentContacts,
            recentTickets
        ] = await Promise.all([
            Company.countDocuments({ isDeleted: false }),

            Contact.countDocuments({ isDeleted: false }),

            User.countDocuments({ active: true }),

            Ticket.countDocuments({
                isDeleted: false,
                status: "open"
            }),

            Ticket.countDocuments({
                isDeleted: false,
                status: "in_progress"
            }),

            Company.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(5),

            Contact.find({ isDeleted: false })
                .populate("company")
                .sort({ createdAt: -1 })
                .limit(5),

            Ticket.find({ isDeleted: false })
                .populate("company")
                .populate("assignedTo")
                .sort({ createdAt: -1 })
                .limit(5)
        ]);

        res.render("dashboard/index", {
            title: "Dashboard",
            companyCount,
            contactCount,
            userCount,
            openTicketCount,
            inProgressTicketCount,
            recentCompanies,
            recentContacts,
            recentTickets
        });
    } catch (err) {
        next(err);
    }
};