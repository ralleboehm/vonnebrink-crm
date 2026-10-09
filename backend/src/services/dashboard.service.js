const Company = require("../models/company.model");
const Contact = require("../models/contact.model");
const User = require("../models/user.model");
const Ticket = require("../models/ticket.model");
const Asset = require("../models/asset.model");

const assetService = require("./asset.service");
const syncService = require("../integrations/action1/sync.service");
const { coverageFrom } = require("../utils/action1Coverage");

// ----------------------------------------------------
// Dashboard: alle Kennzahlen und Listen in einem Aufruf
// ----------------------------------------------------
//
// Alle Abfragen laufen parallel. Neue Kacheln (Vertrieb, Rechnungen …)
// werden hier ergänzt, der Controller bleibt unverändert.

exports.getOverview = async () => {

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

        Ticket.countDocuments({ isDeleted: false, status: "open" }),

        Ticket.countDocuments({ isDeleted: false, status: "in_progress" }),

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

        syncService.getLatestCoverageRun(),

        syncService.getLatestFinishedRun(),

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

    return {
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
        attentionAssets
    };

};
