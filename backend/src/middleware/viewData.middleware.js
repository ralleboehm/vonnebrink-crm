module.exports = (req, res, next) => {

    res.locals.session = req.session;

    res.locals.currentUser = req.session.user || null;

    next();

};