const mongoose = require("mongoose");

// ----------------------------------------------------
// E-Mail-Protokoll
// ----------------------------------------------------
//
// Ein Eintrag je E-Mail mit dem ENDGÜLTIGEN Ergebnis:
//   sent     vom Mailserver angenommen
//   failed   auch nach allen Versuchen nicht verschickt
//   skipped  nicht verschickt (kein SMTP eingetragen, keine gültige Adresse)
//
// Einträge werden nach 180 Tagen automatisch gelöscht.

const STATUSES = ["sent", "failed", "skipped"];

const RETENTION_DAYS = 180;

const emailLogSchema = new mongoose.Schema(
    {
        template: {
            type: String,
            trim: true,
            maxlength: 100,
            default: null
        },

        to: {
            type: [String],
            default: []
        },

        subject: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },

        status: {
            type: String,
            enum: STATUSES,
            required: true
        },

        // Grund bei failed / skipped
        error: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null
        },

        attempts: {
            type: Number,
            default: 1
        },

        messageId: {
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

emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ status: 1, createdAt: -1 });

emailLogSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60, name: "ttl_createdAt" }
);

const EmailLog = mongoose.model("EmailLog", emailLogSchema);

EmailLog.STATUSES = STATUSES;
EmailLog.RETENTION_DAYS = RETENTION_DAYS;

module.exports = EmailLog;
