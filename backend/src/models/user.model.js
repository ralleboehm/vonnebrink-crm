const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        lastName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            maxlength: 255
        },

        passwordHash: {
            type: String,
            required: true
        },

        role: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Role",
            required: true
        },

        active: {
            type: Boolean,
            default: true
        },

        lastLogin: {
            type: Date
        },

        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);