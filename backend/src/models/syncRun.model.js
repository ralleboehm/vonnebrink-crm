const mongoose = require("mongoose");

// Protokoll eines Synchronisationslaufs (z. B. Action1 -> Assets)

const syncRunSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: true,
            enum: ["action1"],
            index: true
        },

        trigger: {
            type: String,
            enum: ["manual", "schedule"],
            default: "manual"
        },

        startedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        startedAt: {
            type: Date,
            required: true
        },

        finishedAt: {
            type: Date,
            default: null
        },

        ok: {
            type: Boolean,
            default: false
        },

        stats: {
            organizations: { type: Number, default: 0 },
            endpoints: { type: Number, default: 0 },
            created: { type: Number, default: 0 },
            updated: { type: Number, default: 0 },
            linked: { type: Number, default: 0 },
            missing: { type: Number, default: 0 },
            skipped: { type: Number, default: 0 },

            // Alle Geräte in Action1 (auch in Organisationen ohne Firma)
            action1Total: { type: Number, default: null },
            unmapped: { type: Number, default: null }
        },

        // Geräte je Action1-Organisation zum Zeitpunkt des Syncs
        organizations: [
            {
                _id: false,
                id: String,
                name: String,
                endpoints: Number,
                mapped: Boolean
            }
        ],

        // Fehler je Organisation (ein Fehler stoppt den Lauf nicht)
        failures: [
            {
                _id: false,
                organizationId: String,
                company: String,
                message: String
            }
        ]
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("SyncRun", syncRunSchema);
