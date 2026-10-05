const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({

    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
        required: true
    },

    contactNumber: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true
    },

    salutation: {
        type: String,
        enum: [
            "mr",
            "mrs",
            "diverse"
        ]
    },

    firstName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100
    },

    lastName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100
    },

    position: {
        type: String,
        trim: true,
        maxlength: 255
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

    status: {
        type: String,
        enum: [
            "active",
            "inactive"
        ],
        default: "active"
    },

    portal: {

        enabled: {
            type: Boolean,
            default: false
        },

        passwordHash: {
            type: String
        },

        mustChangePassword: {
            type: Boolean,
            default: true
        },

        lastLogin: {
            type: Date
        },

        passwordChangedAt: {
            type: Date
        },

        passwordResetToken: {
            type: String
        },

        passwordResetExpires: {
            type: Date
        }

    },

    notes: {
        type: String,
        trim: true
    },

    isDeleted: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Contact", contactSchema);