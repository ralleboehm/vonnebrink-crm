const mongoose = require("mongoose");

const Company = require("../models/company.model");
const Contact = require("../models/contact.model");
const User = require("../models/user.model");
const Ticket = require("../models/ticket.model");
const Asset = require("../models/asset.model");
const Opportunity = require("../models/opportunity.model");
const EmailLog = require("../models/emailLog.model");

const assetService = require("./asset.service");
const contractService = require("./contract.service");
const syncService = require("../integrations/action1/sync.service");
const { coverageFrom } = require("../utils/action1Coverage");
const salesRules = require("../utils/salesRules");
const cards = require("../utils/dashboardCards");

// ----------------------------------------------------
// Dashboard je Rolle
// ----------------------------------------------------
//
// Welche Karten jemand sieht, steht in utils/dashboardCards.js
// (Techniker: Tickets und Geräte, Vertrieb: Pipeline und Verträge,
// Admin: alles). Geladen werden nur die Daten der sichtbaren Karten –
// alle Abfragen laufen parallel.

const ACTIVE_TICKET = ["open", "in_progress", "waiting"];
const LIST_SIZE = 6;
const DAY = 24 * 60 * 60 * 1000;

function userIdOf(user) {

    const id = user && (user.id || user._id);

    return mongoose.isValidObjectId(id) ? String(id) : null;

}

/**
 * Daten fürs Dashboard dieses Benutzers
 *
 * @returns {Promise<{cards: string[], sections: object[], ...}>}
 */
exports.getOverview = async (user, now = new Date()) => {

    const visible = cards.cardsFor(user);
    const show = new Set(visible);
    const me = userIdOf(user);

    // Mehrfach gebrauchte Abfragen nur einmal ausführen
    const once = {};
    const shared = (key, load) => {
        if (!once[key]) once[key] = load();
        return once[key];
    };

    const openOpportunities = () => shared("opps", () => Opportunity.find({ isDeleted: false, stage: { $in: salesRules.OPEN_STAGES } }, "-history")
        .populate("company", "companyName")
        .populate("owner", "firstName lastName")
        .lean());

    const contractSummary = () => shared("contracts", () => contractService.summary(now));

    const loaders = {

        // ---------------- Technik ----------------

        async techKpis() {
            const [mine, unassigned, urgent, inProgress] = await Promise.all([
                me ? Ticket.countDocuments({ isDeleted: false, assignedTo: me, status: { $in: ACTIVE_TICKET } }) : 0,
                Ticket.countDocuments({ isDeleted: false, assignedTo: null, status: "open" }),
                Ticket.countDocuments({ isDeleted: false, priority: { $in: ["urgent", "high"] }, status: { $in: ACTIVE_TICKET } }),
                Ticket.countDocuments({ isDeleted: false, status: "in_progress" })
            ]);
            return { techKpis: { mine, unassigned, urgent, inProgress } };
        },

        async myTickets() {
            const list = me
                ? await Ticket.find({ isDeleted: false, assignedTo: me, status: { $in: ACTIVE_TICKET } })
                    .populate("company", "companyName").sort({ createdAt: 1 }).limit(500).lean()
                : [];
            return { myTickets: list.sort(cards.byUrgency).slice(0, LIST_SIZE) };
        },

        async unassigned() {
            const list = await Ticket.find({ isDeleted: false, assignedTo: null, status: "open" })
                .populate("company", "companyName").sort({ createdAt: 1 }).limit(500).lean();
            return { unassignedTickets: list.sort(cards.byUrgency).slice(0, LIST_SIZE) };
        },

        async attention() {
            const attentionAssets = await Asset.find({ isDeleted: false, status: "active", "action1.missingCriticalUpdates": { $gt: 0 } })
                .populate("company", "companyName")
                .sort({ "action1.missingCriticalUpdates": -1, name: 1 })
                .limit(5)
                .lean();
            return { attentionAssets };
        },

        async assets() {
            return { assetSummary: await assetService.summary() };
        },

        async action1() {
            const [coverageRun, lastRun] = await Promise.all([syncService.getLatestCoverageRun(), syncService.getLatestFinishedRun()]);
            return { coverage: coverageFrom(coverageRun), lastRun };
        },

        // ---------------- Vertrieb ----------------

        async salesKpis() {
            const [opps, contracts] = await Promise.all([openOpportunities(), contractSummary()]);
            const { totals } = salesRules.summarize(opps);
            return { salesKpis: { ...totals, noticeDue: contracts.noticeDue, warningDays: contracts.warningDays } };
        },

        async salesTodo() {
            const opps = await openOpportunities();
            const rank = { overdue: 0, today: 1, none: 2, soon: 3 };
            const todo = opps
                .map((opp) => ({ ...opp, stepState: salesRules.nextStepState(opp, now) }))
                .filter((opp) => opp.stepState in rank)
                .sort((a, b) => rank[a.stepState] - rank[b.stepState] || new Date((a.nextStep || {}).dueDate || 0) - new Date((b.nextStep || {}).dueDate || 0))
                .slice(0, LIST_SIZE);
            return { salesTodo: todo };
        },

        async contractsDue() {
            const [list, summary] = await Promise.all([contractService.findAll({ due: "notice" }, now), contractSummary()]);
            const sorted = list.sort((a, b) => new Date(a.period.noticeDeadline || 0) - new Date(b.period.noticeDeadline || 0));
            return { contractsDue: sorted.slice(0, LIST_SIZE), contractWarningDays: summary.warningDays };
        },

        async recentCompanies() {
            return { recentCompanies: await Company.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean() };
        },

        async recentContacts() {
            return { recentContacts: await Contact.find({ isDeleted: false }).populate("company", "companyName").sort({ createdAt: -1 }).limit(5).lean() };
        },

        // ---------------- Verwaltung ----------------

        async overviewKpis() {
            const [companyCount, contactCount, openTicketCount, inProgressTicketCount] = await Promise.all([
                Company.countDocuments({ isDeleted: false }),
                Contact.countDocuments({ isDeleted: false }),
                Ticket.countDocuments({ isDeleted: false, status: "open" }),
                Ticket.countDocuments({ isDeleted: false, status: "in_progress" })
            ]);
            return { overviewKpis: { companyCount, contactCount, openTicketCount, inProgressTicketCount } };
        },

        async adminHealth() {
            const surveyService = require("./survey.service");
            const [survey, failedMails, userCount] = await Promise.all([
                surveyService.stats(surveyService.readFilters({ period: "90" }), now),
                EmailLog.countDocuments({ status: "failed", createdAt: { $gte: new Date(now.getTime() - 7 * DAY) } }),
                User.countDocuments({ active: true })
            ]);
            return { adminHealth: { nps: survey.summary.nps, answers: survey.summary.count, responseRate: survey.responseRate, failedMails, userCount } };
        },

        async recentTickets() {
            return {
                recentTickets: await Ticket.find({ isDeleted: false })
                    .populate("company", "companyName")
                    .populate("assignedTo", "firstName lastName")
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean()
            };
        }

    };

    const parts = await Promise.all(visible.map((key) => loaders[key]()));

    return Object.assign({ cards: visible, sections: cards.sectionsFor(user), show: (key) => show.has(key) }, ...parts);

};
