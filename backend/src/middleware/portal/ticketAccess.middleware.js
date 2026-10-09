const ticketService = require("../../services/ticket.service");
const attachmentService = require("../../services/attachment.service");

// ----------------------------------------------------
// Kundenportal: nur Tickets der eigenen Firma
// ----------------------------------------------------
//
// Lädt das Ticket aus der URL und prüft, ob es zur Firma des angemeldeten
// Portalbenutzers gehört. Bei Erfolg steht es in req.ticket bereit,
// sonst geht es zurück zur Ticketübersicht. Eine bereits hochgeladene
// temporäre Datei wird dabei verworfen.
//
//   router.get("/:id", requirePortalAuth, loadOwnTicket(), controller.show)
//   router.get("/:ticketId/…", requirePortalAuth, loadOwnTicket("ticketId"), …)

function belongsToCompany(ticket, companyId) {

    if (!ticket || !ticket.company || !companyId) return false;

    const ticketCompany = ticket.company._id || ticket.company;

    return String(ticketCompany) === String(companyId);

}

exports.belongsToCompany = belongsToCompany;

exports.loadOwnTicket = (param = "id") => async (req, res, next) => {

    try {

        const ticket = await ticketService.getById(req.params[param]);

        if (!belongsToCompany(ticket, req.session.portalUser && req.session.portalUser.company)) {

            await attachmentService.discardUpload(req.file);

            return res.redirect("/portal/tickets");

        }

        req.ticket = ticket;

        next();

    } catch (err) {

        await attachmentService.discardUpload(req.file);

        next(err);

    }

};
