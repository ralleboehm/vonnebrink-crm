const mongoose = require("mongoose");

const { STAGE_KEYS, SOURCES } = require("../utils/salesRules");

// ----------------------------------------------------
// Verkaufschance (Vertrieb / Pipeline)
// ----------------------------------------------------
//
// Gehört zu einer Firma (Interessent oder Kunde), optional zu einem
// Kontakt. Phasen und Regeln: utils/salesRules.js.
//
// Jede offene Chance sollte genau einen nächsten Schritt mit Datum haben.
// Der Verlauf (history) hält Notizen, Phasenwechsel und erledigte Schritte
// fest – wer, wann, was.

const HISTORY_TYPES = ["created", "stage", "note", "step_done", "step_set", "updated"];

const historySchema = new mongoose.Schema(
    {
        type: { type: String, enum: HISTORY_TYPES, required: true },
        text: { type: String, trim: true, maxlength: 2000, default: "" },
        at: { type: Date, default: Date.now },
        by: { type: String, trim: true, maxlength: 200, default: "" }
    },
    { _id: true }
);

const opportunitySchema = new mongoose.Schema(
    {
        opportunityNumber: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            trim: true
        },

        title: { type: String, required: true, trim: true, maxlength: 150 },

        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
            index: true
        },

        contact: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Contact",
            default: null
        },

        // Zuständig im Vertrieb
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        stage: { type: String, enum: STAGE_KEYS, default: "new", index: true },

        probability: { type: Number, min: 0, max: 100, default: 10 },

        // Wert in Euro: monatlich (MRR) und einmalig
        mrr: { type: Number, min: 0, default: 0 },
        oneTime: { type: Number, min: 0, default: 0 },

        expectedCloseDate: { type: Date, default: null },

        source: { type: String, enum: [...Object.keys(SOURCES), null], default: null },

        campaign: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Campaign",
            default: null
        },

        nextStep: {
            text: { type: String, trim: true, maxlength: 300, default: "" },
            dueDate: { type: Date, default: null }
        },

        notes: { type: String, trim: true, maxlength: 2000, default: "" },

        lostReason: { type: String, trim: true, maxlength: 300, default: "" },

        closedAt: { type: Date, default: null },

        history: { type: [historySchema], default: [] },

        createdBy: { type: String, trim: true, maxlength: 200, default: null },

        isDeleted: { type: Boolean, default: false }
    },
    {
        timestamps: true
    }
);

opportunitySchema.index({ isDeleted: 1, stage: 1, "nextStep.dueDate": 1 });

const Opportunity = mongoose.model("Opportunity", opportunitySchema);

Opportunity.HISTORY_TYPES = HISTORY_TYPES;

module.exports = Opportunity;
