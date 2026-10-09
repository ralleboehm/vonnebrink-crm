const mongoose = require("mongoose");

// ----------------------------------------------------
// Ordner eines Bezugs in Nextcloud (z. B. Kundenordner)
// ----------------------------------------------------
//
// Merkt sich, wo der Ordner einmal angelegt wurde. Wird eine Firma später
// umbenannt, bleibt der Ordner derselbe – Links und Dokumente stimmen weiter.

const documentFolderSchema = new mongoose.Schema(
    {
        refType: { type: String, required: true, trim: true, maxlength: 20 },
        refId: { type: mongoose.Schema.Types.ObjectId, required: true },
        path: { type: String, required: true, trim: true, maxlength: 1000 },
        checkedAt: { type: Date, default: null }   // Unterordner zuletzt geprüft
    },
    {
        timestamps: true
    }
);

documentFolderSchema.index({ refType: 1, refId: 1 }, { unique: true });

module.exports = mongoose.model("DocumentFolder", documentFolderSchema);
