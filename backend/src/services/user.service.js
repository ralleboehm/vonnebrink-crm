const bcrypt = require("bcrypt");
const User = require("../models/user.model");

class UserService {
    async getAll() {
        return await User.find({ active: true }).sort({
            lastName: 1,
            firstName: 1
        });
    }

    async getById(id) {
        return await User.findOne({
            _id: id,
            active: true
        });
    }

    async getByUsername(username) {
        return await User.findOne({
            username: username.toLowerCase()
        });
    }

    async getByEmail(email) {
        return await User.findOne({
            email: email.toLowerCase()
        });
    }

    async create(data) {
        const user = new User(data);
        return await user.save();
    }

    async update(id, data) {
        const updateData = { ...data };

        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 12);
        } else {
            delete updateData.password;
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
        );
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
}

module.exports = new UserService();