const mongoose = require("mongoose");

const { STATUS_KEYS, SIGNATURE_KEYS } = require("../utils/contractRules");

// ----------------------------------------------------
// Vertrag (vorbereitet – noch ohne Oberfläche)
// ----------------------------------------------------
//
// Die Vertragsdokumente selbst sind Documents mit reference
// { type: "contract", id } und liegen in Nextcloud unter
// Customers/<Kunde>/Contracts/. Fristen berechnet utils/contractRules.js.

const contractSchema = new mongoose.Schema(
    {
        contractNumber: { type: String, trim: true, unique: true, sparse: true },   // z. B. VTR-000001
        title: { type: String, required: true, trim: true, maxlength: 200 },

        company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
        contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },

        status: { type: String, enum: STATUS_KEYS, default: "draft", index: true },
        signatureStatus: { type: String, enum: SIGNATURE_KEYS, default: "unsigned" },

        startDate: { type: Date, default: null },
        termMonths: { type: Number, min: 0, default: null },              // Laufzeit
        endDate: { type: Date, default: null },
        noticePeriodMonths: { type: Number, min: 0, default: null },      // Kündigungsfrist
        noticeDeadline: { type: Date, default: null },
        renewalMonths: { type: Number, min: 0, default: null },           // automatische Verlängerung
        renewalDate: { type: Date, default: null },

        version: { type: Number, min: 1, default: 1 },
        notes: { type: String, trim: true, maxlength: 5000, default: "" },

        isDeleted: { type: Boolean, default: false }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Contract", contractSchema);
