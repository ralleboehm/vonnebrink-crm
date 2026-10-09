const mongoose = require("mongoose");
const { SOURCES } = require("../utils/marketingConsent");

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

        // Wie zuletzt geändert (siehe utils/marketingConsent.js):
        // portal, double_opt_in, link = vom Kontakt selbst
        // crm (mit Nachweis), customer (Bestandskunde, § 7 Abs. 3 UWG) = Mitarbeiter
        source: {
            type: String,
            enum: [...SOURCES, null],
            default: null
        },

        // Persönlicher Abmeldelink (/email/abmelden/<token>), entsteht mit der Einwilligung
        unsubscribeToken: {
            type: String,
            index: true
        },

        // Offene Double-Opt-In-Anfrage (/email/bestaetigen/<token>)
        doi: {
            token: { type: String, index: true },
            requestedAt: { type: Date },
            requestedBy: { type: String, trim: true, maxlength: 200 }
        },

        history: [
            {
                _id: false,
                status: { type: String, enum: ["granted", "revoked"] },
                at: { type: Date },
                source: { type: String, enum: SOURCES },
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