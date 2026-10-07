const PortalAccount = require("../models/portalAccount.model");

class PortalAuthService {

    async authenticate(email, password) {

        const portalAccount = await PortalAccount.findOne({

            email: email.toLowerCase(),
            active: true

        }).populate({

            path: "contact",

            populate: {

                path: "company"

            }

        });

        if (!portalAccount) {

            throw new Error("INVALID_CREDENTIALS");

        }

        if (!portalAccount.active) {

            throw new Error("USER_DISABLED");

        }

        if (
            portalAccount.lockedUntil &&
            portalAccount.lockedUntil > new Date()
        ) {

            throw new Error("ACCOUNT_LOCKED");

        }

        const validPassword = await portalAccount.comparePassword(password);

        if (!validPassword) {

            portalAccount.failedLoginAttempts += 1;

            if (portalAccount.failedLoginAttempts >= 5) {

                portalAccount.lockedUntil = new Date(
                    Date.now() + (15 * 60 * 1000)
                );

            }

            await portalAccount.save();

            throw new Error("INVALID_CREDENTIALS");

        }

        portalAccount.failedLoginAttempts = 0;
        portalAccount.lockedUntil = null;
        portalAccount.lastLogin = new Date();

        await portalAccount.save();

        return portalAccount;

    }

}

module.exports = new PortalAuthService();