module.exports = (req, res, next) => {

    res.locals.session = req.session;

    // CRM
    res.locals.currentUser = req.session.user || null;

    // Kundenportal
    res.locals.currentPortalUser = req.session.portalUser || null;

    next();

};