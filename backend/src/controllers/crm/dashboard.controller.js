const Company = require("../../models/company.model");
const Contact = require("../../models/contact.model");
const User = require("../../models/user.model");
const Ticket = require("../../models/ticket.model");
const Asset = require("../../models/asset.model");
const SyncRun = require("../../models/syncRun.model");

const assetService = require("../../services/asset.service");
const labels = require("../../utils/assetLabels");
const { coverageFrom } = require("../../utils/action1Coverage");


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
            recentTickets,
            assetSummary,
            coverageRun,
            lastRun,
            attentionAssets
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
                .limit(5),

            assetService.summary(),

            SyncRun.findOne({
                provider: "action1",
                "stats.action1Total": { $type: "number" }
            })
                .sort({ startedAt: -1 })
                .lean(),

            SyncRun.findOne({
                provider: "action1",
                finishedAt: { $ne: null }
            })
                .sort({ startedAt: -1 })
                .lean(),

            // Geräte mit fehlenden kritischen Updates
            Asset.find({
                isDeleted: false,
                status: "active",
                "action1.missingCriticalUpdates": { $gt: 0 }
            })
                .populate("company", "companyName")
                .sort({ "action1.missingCriticalUpdates": -1, name: 1 })
                .limit(5)
                .lean()
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
            recentTickets,
            assetSummary,
            coverage: coverageFrom(coverageRun),
            lastRun,
            attentionAssets,
            labels
        });
    } catch (err) {
        next(err);
    }
};
