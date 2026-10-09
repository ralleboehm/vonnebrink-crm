const mongoose = require("mongoose");

// ----------------------------------------------------
// Benachrichtigung (Glocke in der Navigation)
// ----------------------------------------------------
//
// Allgemein gehalten, damit alle Module (Tickets, Angebote, Rechnungen,
// Action1, Nextcloud …) dieselbe Struktur nutzen. Woher eine
// Benachrichtigung stammt, steht in "event" (z. B. "ticket.created").
//
// Gelesene Benachrichtigungen werden 90 Tage nach dem Lesen automatisch
// von MongoDB gelöscht (TTL-Index auf readAt). Ungelesene bleiben.

const NOTIFICATION_TYPES = [
    "success",
    "info",
    "warning",
    "danger"
];

const READ_RETENTION_DAYS = 90;

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },

        message: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
        },

        type: {
            type: String,
            enum: NOTIFICATION_TYPES,
            default: "info"
        },

        // Bootstrap-Icon, z. B. "bi-ticket-detailed"
        icon: {
            type: String,
            trim: true,
            maxlength: 50,
            default: "bi-bell"
        },

        // Interner Link, z. B. "/crm/tickets/…"
        link: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null
        },

        // Auslösendes Ereignis, z. B. "ticket.created"
        event: {
            type: String,
            trim: true,
            maxlength: 100,
            default: null
        },

        isRead: {
            type: Boolean,
            default: false
        },

        readAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Glocke & Übersicht: ungelesene / neueste Benachrichtigungen eines Benutzers
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

// Gelesene Benachrichtigungen nach 90 Tagen löschen
notificationSchema.index(
    { readAt: 1 },
    { expireAfterSeconds: READ_RETENTION_DAYS * 24 * 60 * 60 }
);

const Notification = mongoose.model("Notification", notificationSchema);

Notification.TYPES = NOTIFICATION_TYPES;

module.exports = Notification;
