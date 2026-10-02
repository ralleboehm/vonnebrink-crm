const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
    {
        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true
        },

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

        position: {
            type: String,
            trim: true,
            maxlength: 100
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 255
        },

        phone: {
            type: String,
            trim: true,
            maxlength: 30
        },

        mobile: {
            type: String,
            trim: true,
            maxlength: 30
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 5000
        },

        active: {
            type: Boolean,
            default: true
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

module.exports = mongoose.model("Contact", contactSchema);