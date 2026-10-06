const userService = require("./user.service");

class AuthService {

    async authenticate({
        username = null,
        email = null,
        password,
        allowedRoles = []
    }) {

        let user = null;

        // Anmeldung über Benutzername (CRM)
        if (username) {

            user = await userService.getByUsername(username);

        }

        // Anmeldung über E-Mail (Kundenportal)
        else if (email) {

            user = await userService.getByEmail(email);

        }

        if (!user) {

            throw new Error("INVALID_CREDENTIALS");

        }

        if (!user.active) {

            throw new Error("USER_DISABLED");

        }

        const validPassword = await user.comparePassword(password);

        if (!validPassword) {

            throw new Error("INVALID_CREDENTIALS");

        }

        if (
            allowedRoles.length > 0 &&
            !allowedRoles.includes(user.role)
        ) {

            throw new Error("ACCESS_DENIED");

        }

        return user;

    }

}

module.exports = new AuthService();