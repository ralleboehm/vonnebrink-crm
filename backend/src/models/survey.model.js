const mongoose = require("mongoose");

// ----------------------------------------------------
// Kundenumfrage (NPS) nach Ticket-Abschluss
// ----------------------------------------------------
//
// Entsteht beim Abschluss eines Tickets und steht als 0–10-Leiste in der
// Abschluss-Mail. Der Kunde öffnet über seinen persönlichen Link eine Seite,
// bestätigt den Wert und kann freiwillig einen Kommentar schreiben.
// Je Ticket gibt es höchstens eine Umfrage. Regeln: utils/npsRules.js

const surveySchema = new mongoose.Schema(
    {
        token: { type: String, required: true, unique: true },

        ticket: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", required: true, unique: true },
        company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null, index: true },
        contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },

        // Stand beim Versand (bleibt lesbar, auch wenn sich etwas ändert)
        ticketNumber: { type: String, trim: true, default: "" },
        email: { type: String, trim: true, lowercase: true, default: "" },

        sentAt: { type: Date, default: Date.now, index: true },

        score: { type: Number, min: 0, max: 10, default: null },
        comment: { type: String, trim: true, maxlength: 2000, default: "" },
        answeredAt: { type: Date, default: null, index: true }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Survey", surveySchema);
