const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100
        },

        customerNumber: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            trim: true
        },

        status: {
            type: String,
            enum: ["prospect", "active", "inactive"],
            default: "prospect"
        },

        address: {
            street: {
                type: String,
                trim: true,
                maxlength: 100
            },

            houseNumber: {
                type: String,
                trim: true,
                maxlength: 20
            },

            postalCode: {
                type: String,
                trim: true,
                maxlength: 10
            },

            city: {
                type: String,
                trim: true,
                maxlength: 100
            },

            country: {
                type: String,
                trim: true,
                default: "Deutschland",
                maxlength: 100
            }
        },

        phone: {
            type: String,
            trim: true,
            maxlength: 30
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 100
        },

        website: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 255
        },

        notes: {
            type: String,
            trim: true
        },

        // Branche / Gruppen: freie Schlagwörter für Marketing & Kampagnen
        // (bereinigt über utils/tags.js)
        tags: {
            type: [
                {
                    type: String,
                    trim: true,
                    maxlength: 40
                }
            ],
            default: [],
            index: true
        },

        // Verknüpfung mit einer Organisation in Action1 (RMM).
        // Wird auf der Seite "Action1" (nur Admins) gepflegt.
        action1: {
            organizationId: {
                type: String,
                trim: true,
                maxlength: 100,
                default: null
            },

            organizationName: {
                type: String,
                trim: true,
                maxlength: 255,
                default: null
            }
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

module.exports = mongoose.model("Company", companySchema);