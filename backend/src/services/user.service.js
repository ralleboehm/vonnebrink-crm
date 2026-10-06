const bcrypt = require("bcrypt");
const User = require("../models/user.model");

class UserService {

    async getAll() {

        return await User.find({
            active: true
        })
            .populate("company")
            .populate("contact")
            .sort({
                lastName: 1,
                firstName: 1
            });

    }

    async getById(id) {

        return await User.findOne({
            _id: id,
            active: true
        })
            .populate("company")
            .populate("contact");

    }

    async getByUsername(username) {

        return await User.findOne({
            username: username.toLowerCase()
        })
            .populate("company")
            .populate("contact");

    }

    async getByEmail(email) {

        return await User.findOne({
            email: email.toLowerCase()
        })
            .populate("company")
            .populate("contact");

    }

    async create(data) {

        const user = new User({

            username: data.username,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            password: data.password,
            role: data.role,

            company: data.company || null,
            contact: data.contact || null,

            active: true

        });

        return await user.save();

    }

    async update(id, data) {

        const updateData = {

            username: data.username,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            role: data.role,

            company: data.company || null,
            contact: data.contact || null

        };

        if (data.password) {

            updateData.password = await bcrypt.hash(data.password, 12);

        }

        return await User.findOneAndUpdate(

            {
                _id: id,
                active: true
            },

            updateData,

            {
                new: true,
                runValidators: true
            }

        )
            .populate("company")
            .populate("contact");

    }

    async deactivate(id) {

        return await User.findOneAndUpdate(

            {
                _id: id,
                active: true
            },

            {
                active: false
            },

            {
                new: true
            }

        );

    }

    async updateLastLogin(id) {

        return await User.findOneAndUpdate(

            {
                _id: id,
                active: true
            },

            {
                lastLogin: new Date()
            },

            {
                new: true
            }

        );

    }

    // ----------------------------------------------------
    // Eigenes Profil aktualisieren
    // ----------------------------------------------------

    async updateProfile(id, data) {

        return await User.findOneAndUpdate(

            {
                _id: id,
                active: true
            },

            {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email
            },

            {
                new: true,
                runValidators: true
            }

        );

    }

    // ----------------------------------------------------
    // Passwort ändern
    // ----------------------------------------------------

    async changePassword(id, currentPassword, newPassword) {

        const user = await User.findById(id);

        if (!user) {

            throw new Error("Benutzer nicht gefunden");

        }

        const validPassword = await user.comparePassword(currentPassword);

        if (!validPassword) {

            throw new Error("Das aktuelle Passwort ist falsch.");

        }

        user.password = await bcrypt.hash(newPassword, 12);

        await user.save();

        return user;

    }

}

module.exports = new UserService();