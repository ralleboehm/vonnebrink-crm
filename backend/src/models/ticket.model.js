const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
    {
        ticketNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        subject: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },

        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 10000
        },

        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true
        },

        contact: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Contact",
            default: null
        },

        category: {
            type: String,
            enum: [
                "support",
                "hardware",
                "software",
                "network",
                "server",
                "cloud",
                "security",
                "other"
            ],
            default: "support"
        },

        status: {
            type: String,
            enum: [
                "open",
                "in_progress",
                "waiting",
                "resolved",
                "closed"
            ],
            default: "open"
        },

        priority: {
            type: String,
            enum: [
                "low",
                "normal",
                "high",
                "urgent"
            ],
            default: "normal"
        },

        dueDate: {
            type: Date,
            default: null
        },

        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
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

module.exports = mongoose.model("Ticket", ticketSchema);