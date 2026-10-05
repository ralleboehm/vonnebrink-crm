exports.login = async (req, res) => {

    res.render("portal/login", {

        title: "Kundenportal"

    });

};

exports.authenticate = async (req, res, next) => {

    try {

        // Login folgt im nächsten Schritt

        res.send("Portal Login wird als Nächstes implementiert.");

    } catch (err) {

        next(err);

    }

};