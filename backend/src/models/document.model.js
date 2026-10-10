const mongoose = require("mongoose");

// ----------------------------------------------------
// Dokument (nur Metadaten – die Datei liegt in Nextcloud)
// ----------------------------------------------------
//
// Ein Dokument gehört zu genau einem Bezug (Firma, Kontakt, Ticket, Asset,
// später Vertrag/Angebot/Rechnung). "company" ist zusätzlich gesetzt, damit
// alle Dokumente eines Kunden schnell auffindbar sind (auch fürs Portal).
//
// Gleicher Dateiname im gleichen Ordner = neue Version: Nextcloud behält
// die alte Fassung, "version" zählt hoch.
// Kategorien und Bezüge: utils/documentRules.js

const documentSchema = new mongoose.Schema(
    {
        fileName: { type: String, required: true, trim: true, maxlength: 200 },       // Name in Nextcloud
        originalName: { type: String, trim: true, maxlength: 255, default: "" },      // Name beim Hochladen
        extension: { type: String, trim: true, lowercase: true, maxlength: 10, default: "" },
        mimeType: { type: String, trim: true, maxlength: 150, default: "application/octet-stream" },
        size: { type: Number, min: 0, default: 0 },

        category: { type: String, required: true, trim: true, maxlength: 40, index: true },
        tags: [{ type: String, trim: true, maxlength: 30 }],

        checksum: { type: String, trim: true, maxlength: 64, default: "" },             // SHA-256
        version: { type: Number, min: 1, default: 1 },

        nextcloud: {
            fileId: { type: String, trim: true, default: null },
            path: { type: String, required: true, trim: true, maxlength: 1000 },
            etag: { type: String, trim: true, default: null }
        },

        reference: {
            type: { type: String, required: true, trim: true, maxlength: 20 },
            id: { type: mongoose.Schema.Types.ObjectId, required: true }
        },

        company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null, index: true },

        // Kundenportal (nur Portal-Kategorien, siehe documentRules):
        //   portalVisible  freigegeben ja/nein
        //   portalAudience "company" = alle Portal-Nutzer der Firma,
        //                  "selected" = nur Kontakte mit einem der Merkmale oder einzeln gewählte
        portalVisible: { type: Boolean, default: false },
        portalAudience: { type: String, enum: ["company", "selected"], default: "company" },
        portalTags: [{ type: String, trim: true, maxlength: 30 }],
        portalContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],

        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
    },
    {
        timestamps: true
    }
);

documentSchema.index({ "reference.type": 1, "reference.id": 1, isDeleted: 1 });
documentSchema.index({ "nextcloud.path": 1, isDeleted: 1 });
documentSchema.index({ company: 1, portalVisible: 1, isDeleted: 1 });

module.exports = mongoose.model("Document", documentSchema);
