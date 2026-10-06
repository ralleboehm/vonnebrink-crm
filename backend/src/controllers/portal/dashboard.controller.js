const ticketService = require("../../services/ticket.service");

// ----------------------------------------------------
// Dashboard
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        const tickets = await ticketService.getByCompany(
            req.session.user.company
        );

        res.render("portal/dashboard", {

            title: "Kundenportal",

            tickets

        });

    } catch (err) {

        next(err);

    }

};