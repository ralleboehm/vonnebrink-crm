const searchService = require("../../services/search.service");

const RESULT_LIMIT = 25;
const SUGGEST_LIMIT = 5;

/**
 * Ergebnisseite
 */
exports.index = async (req, res, next) => {

    try {

        const query = searchService.normalizeQuery(req.query.q);

        // Exakte Nummer (CUS-000012, CON-..., TIC-...) -> direkt öffnen
        const target = await searchService.findByNumber(query);

        if (target) {
            return res.redirect(target);
        }

        const result = await searchService.searchAll(query, { limit: RESULT_LIMIT });

        res.render("search/index", {
            title: query ? `Suche: ${query}` : "Suche",
            searchQuery: query,
            result,
            limit: RESULT_LIMIT,
            highlight: searchService.highlight
        });

    } catch (err) {

        next(err);

    }

};

/**
 * Live-Vorschläge (JSON) für das Suchfeld in der Navigation
 */
exports.suggest = async (req, res) => {

    try {

        const result = await searchService.searchAll(req.query.q, { limit: SUGGEST_LIMIT });

        const text = (value) => (value === null || value === undefined ? "" : String(value));

        res.set("Cache-Control", "no-store");

        res.json({

            query: result.query,

            companies: {
                total: result.companies.total,
                items: result.companies.items.map((c) => ({
                    url: `/crm/companies/${c._id}`,
                    title: text(c.companyName),
                    detail: [c.customerNumber, c.address && c.address.city].filter(Boolean).join(" · ")
                }))
            },

            contacts: {
                total: result.contacts.total,
                items: result.contacts.items.map((c) => ({
                    url: `/crm/contacts/${c._id}`,
                    title: `${text(c.firstName)} ${text(c.lastName)}`.trim(),
                    detail: [c.company && c.company.companyName, c.email].filter(Boolean).join(" · ")
                }))
            },

            tickets: {
                total: result.tickets.total,
                items: result.tickets.items.map((t) => ({
                    url: `/crm/tickets/${t._id}`,
                    title: `${text(t.ticketNumber)} – ${text(t.subject)}`,
                    detail: [t.company && t.company.companyName].filter(Boolean).join(" · ")
                }))
            }

        });

    } catch (err) {

        console.error("Suche fehlgeschlagen:", err.message);

        res.status(500).json({ error: "Die Suche ist fehlgeschlagen." });

    }

};
