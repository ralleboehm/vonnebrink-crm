const ticketService = require("../../services/ticket.service");

// ----------------------------------------------------
// Dashboard
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        const tickets = await ticketService.getByCompany(
            req.session.portalUser.company
        );

        res.render("portal/dashboard", {

            title: "Übersicht",

            tickets

        });

    } catch (err) {

        next(err);

    }

};