const searchService = require("../../services/search.service");
const { can, PERMISSIONS } = require("../../core/permissions");

const RESULT_LIMIT = 25;
const SUGGEST_LIMIT = 5;

const EMPTY = Object.freeze({ items: [], total: 0 });

// Bereiche, die der Benutzer öffnen darf (Vertrieb: keine Tickets)
const SECTION_PERMISSIONS = {
    tickets: PERMISSIONS.TICKETS_VIEW,
    assets: PERMISSIONS.ASSETS_VIEW
};

function visibleOnly(result, user) {

    const visible = { ...result };

    for (const [section, permission] of Object.entries(SECTION_PERMISSIONS)) {
        if (!can(user, permission)) visible[section] = EMPTY;
    }

    return visible;

}

function allowedTarget(target, user) {

    if (!target) return null;
    if (target.startsWith("/crm/tickets/") && !can(user, PERMISSIONS.TICKETS_VIEW)) return null;
    if (target.startsWith("/crm/assets/") && !can(user, PERMISSIONS.ASSETS_VIEW)) return null;

    return target;

}

/**
 * Ergebnisseite
 */
exports.index = async (req, res, next) => {

    try {

        const query = searchService.normalizeQuery(req.query.q);

        // Exakte Nummer (CUS-000012, CON-..., TIC-..., AST-...) -> direkt öffnen
        const target = allowedTarget(await searchService.findByNumber(query), req.session.user);

        if (target) {
            return res.redirect(target);
        }

        const result = visibleOnly(await searchService.searchAll(query, { limit: RESULT_LIMIT }), req.session.user);

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

        const result = visibleOnly(await searchService.searchAll(req.query.q, { limit: SUGGEST_LIMIT }), req.session.user);

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
            },

            assets: {
                total: result.assets.total,
                items: result.assets.items.map((a) => ({
                    url: `/crm/assets/${a._id}`,
                    title: text(a.name),
                    detail: [a.company && a.company.companyName, a.serialNumber && `SN ${a.serialNumber}`, a.lastUser]
                        .filter(Boolean).join(" · ")
                }))
            }

        });

    } catch (err) {

        console.error("Suche fehlgeschlagen:", err.message);

        res.status(500).json({ error: "Die Suche ist fehlgeschlagen." });

    }

};
