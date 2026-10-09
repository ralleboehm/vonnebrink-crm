const surveyService = require("../../services/survey.service");
const companyService = require("../../services/company.service");
const npsRules = require("../../utils/npsRules");

/**
 * Auswertung: NPS, Verteilung, Verlauf, Rücklauf, je Firma, Antworten
 */
exports.index = async (req, res, next) => {

    try {

        const filters = surveyService.readFilters(req.query);

        const [stats, answers, companies] = await Promise.all([
            surveyService.stats(filters),
            surveyService.findAnswered(filters),
            companyService.getAll()
        ]);

        res.render("surveys/index", {
            title: "Kundenumfragen",
            filters,
            stats,
            answers,
            companies,
            periods: surveyService.PERIODS,
            categories: npsRules.CATEGORIES,
            categoryOf: npsRules.category,
            fatigueDays: surveyService.FATIGUE_DAYS
        });

    } catch (err) {

        next(err);

    }

};

/**
 * CSV mit allen Antworten des Filters
 */
exports.exportCsv = async (req, res, next) => {

    try {

        const filters = surveyService.readFilters(req.query);
        const answers = await surveyService.findAnswered(filters);
        const date = new Date().toISOString().slice(0, 10);

        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="umfragen-${date}.csv"`);

        res.send(surveyService.toExportCsv(answers));

    } catch (err) {

        next(err);

    }

};
