const mongoose = require("mongoose");

// ----------------------------------------------------
// E-Mail-Kampagne
// ----------------------------------------------------
//
// Ablauf: Entwurf (draft) → wird versendet (sending) → versendet (sent).
// Nur Entwürfe können bearbeitet werden. Beim Start des Versands wird die
// Empfängerliste festgeschrieben (deliveries); jeder Eintrag bekommt sein
// Ergebnis. Ein zweiter Klick auf „Senden“ verschickt nichts doppelt.
// Startet der Server mitten im Versand neu, werden nur die noch offenen
// Einträge weiter abgearbeitet (im ungünstigsten Fall bekommt der eine
// Empfänger, bei dem der Neustart genau passierte, die Mail zweimal).
//
// Empfänger sind nur Kontakte, die für Kampagnen erreichbar sind
// (Einwilligung, siehe utils/marketingConsent.js). Jede Mail enthält
// den persönlichen Abmeldelink.

const STATUSES = ["draft", "sending", "sent"];

const DELIVERY_STATUSES = ["pending", "sent", "failed", "skipped"];

const deliverySchema = new mongoose.Schema(
    {
        contact: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Contact",
            required: true
        },

        // Stand beim Versand (bleibt lesbar, auch wenn der Kontakt später geändert wird)
        email: { type: String, trim: true, maxlength: 255, required: true },
        name: { type: String, trim: true, maxlength: 255, default: "" },
        companyName: { type: String, trim: true, maxlength: 255, default: "" },

        status: {
            type: String,
            enum: DELIVERY_STATUSES,
            default: "pending"
        },

        error: { type: String, trim: true, maxlength: 1000, default: null },

        sentAt: { type: Date, default: null }
    },
    { _id: false }
);

const campaignSchema = new mongoose.Schema(
    {
        campaignNumber: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            trim: true
        },

        name: { type: String, required: true, trim: true, maxlength: 150 },

        description: { type: String, trim: true, maxlength: 500, default: "" },

        subject: { type: String, required: true, trim: true, maxlength: 200 },

        // Inhalt mit {{platzhaltern}}, siehe utils/campaignContent.js
        //   html: aus dem Editor, bereinigt, Bilder eingebettet
        //   text: ältere Kampagnen (normaler Text)
        format: { type: String, enum: ["html", "text"], default: "text" },

        content: { type: String, required: true, maxlength: 6 * 1024 * 1024 },

        audience: {
            // Gruppen (Schlagwörter der Firmen). Leer = alle erreichbaren Kontakte
            tags: { type: [String], default: [] }
        },

        status: {
            type: String,
            enum: STATUSES,
            default: "draft"
        },

        deliveries: {
            type: [deliverySchema],
            default: []
        },

        stats: {
            total: { type: Number, default: 0 },
            sent: { type: Number, default: 0 },
            failed: { type: Number, default: 0 },
            skipped: { type: Number, default: 0 }
        },

        startedAt: { type: Date, default: null },
        sentAt: { type: Date, default: null },
        sentBy: { type: String, trim: true, maxlength: 200, default: null },

        createdBy: { type: String, trim: true, maxlength: 200, default: null },
        updatedBy: { type: String, trim: true, maxlength: 200, default: null },

        isDeleted: { type: Boolean, default: false }
    },
    {
        timestamps: true
    }
);

campaignSchema.index({ isDeleted: 1, createdAt: -1 });
campaignSchema.index({ status: 1 });

const Campaign = mongoose.model("Campaign", campaignSchema);

Campaign.STATUSES = STATUSES;
Campaign.DELIVERY_STATUSES = DELIVERY_STATUSES;

module.exports = Campaign;
