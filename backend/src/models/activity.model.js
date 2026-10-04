const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
    {
        ticket: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ticket",
            required: true,
            index: true
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        action: {
            type: String,
            required: true,
            enum: [
                "created",
                "updated",
                "status_changed",
                "priority_changed",
                "assigned",
                "unassigned",
                "message_added",
                "attachment_added",
                "attachment_removed",
                "closed",
                "reopened",
                "deleted"
            ]
        },

        field: {
            type: String,
            default: null
        },

        oldValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        newValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        description: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Activity", activitySchema);