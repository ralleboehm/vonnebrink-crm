const dashboardService = require("../../services/dashboard.service");
const labels = require("../../utils/assetLabels");
const salesRules = require("../../utils/salesRules");
const contractRules = require("../../utils/contractRules");
const format = require("../../utils/format");

// Dashboard je Rolle: Techniker, Vertrieb, Admin = alle Karten
exports.index = async (req, res, next) => {
    try {
        const overview = await dashboardService.getOverview(req.session.user);

        res.render("dashboard/index", {
            title: "Dashboard",
            ...overview,
            labels,
            euro: salesRules.formatEuro,
            stageLabels: salesRules.STAGE_LABELS,
            statuses: contractRules.STATUSES,
            format
        });
    } catch (err) {
        next(err);
    }
};
