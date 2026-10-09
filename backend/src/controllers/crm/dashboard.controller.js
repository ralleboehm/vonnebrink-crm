const dashboardService = require("../../services/dashboard.service");
const labels = require("../../utils/assetLabels");

exports.index = async (req, res, next) => {
    try {
        const overview = await dashboardService.getOverview();

        res.render("dashboard/index", {
            title: "Dashboard",
            ...overview,
            labels
        });
    } catch (err) {
        next(err);
    }
};
