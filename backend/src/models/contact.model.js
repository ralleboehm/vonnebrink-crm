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
        required: true,
        unique: true,
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

    notes: {
        type: String,
        trim: true
    },

    // Einwilligung in Marketing-E-Mails (Kampagnen).
    // Änderungen nur über services/marketing.service.js – dort wird auch
    // der Verlauf (Nachweis: wer, wann, wie) geschrieben.
    marketing: {

        status: {
            type: String,
            enum: ["none", "granted", "revoked"],
            default: "none"
        },

        changedAt: {
            type: Date,
            default: null
        },

        // "portal" = vom Kontakt selbst im Kundenportal, "crm" = von einem Mitarbeiter erfasst
        source: {
            type: String,
            enum: ["portal", "crm", null],
            default: null
        },

        history: [
            {
                _id: false,
                status: { type: String, enum: ["granted", "revoked"] },
                at: { type: Date },
                source: { type: String, enum: ["portal", "crm"] },
                by: { type: String, trim: true, maxlength: 200 },
                note: { type: String, trim: true, maxlength: 500 }
            }
        ]

    },

    isDeleted: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Contact", contactSchema);