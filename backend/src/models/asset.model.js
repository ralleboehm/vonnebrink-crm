const mongoose = require("mongoose");

// ----------------------------------------------------
// Asset (Gerät eines Kunden)
// ----------------------------------------------------
//
// Ein Asset kann von Hand angelegt werden (source "manual") oder aus
// Action1 stammen (source "action1"). Bei Action1-Assets überschreibt
// der Sync nur die technischen Felder (Name, OS, Hardware, Netzwerk,
// Action1-Status). Typ, Status, Ansprechpartner, Kaufdatum, Garantie,
// Inventarnummer und Notizen werden im CRM gepflegt und vom Sync nie
// angefasst.

const ASSET_TYPES = [
    "workstation",
    "laptop",
    "server",
    "virtual_machine",
    "network",
    "printer",
    "mobile",
    "other"
];

const ASSET_STATUSES = [
    "active",
    "in_stock",
    "repair",
    "retired"
];

const ASSET_SOURCES = [
    "manual",
    "action1"
];

const shortText = (max) => ({
    type: String,
    trim: true,
    maxlength: max,
    default: null
});

const action1Schema = new mongoose.Schema(
    {
        endpointId: shortText(100),
        organizationId: shortText(100),

        // Rohwert aus Action1, z. B. "Connected" / "Disconnected"
        status: shortText(50),
        online: { type: Boolean, default: null },

        lastSeen: { type: Date, default: null },
        lastBootTime: { type: Date, default: null },

        agentVersion: shortText(50),
        platform: shortText(100),

        missingCriticalUpdates: { type: Number, default: null },
        missingOtherUpdates: { type: Number, default: null },
        rebootRequired: { type: Boolean, default: null },

        comment: shortText(1000),

        // Gerät war beim letzten Sync nicht mehr in Action1 vorhanden
        missing: { type: Boolean, default: false },

        lastSyncedAt: { type: Date, default: null }
    },
    {
        _id: false
    }
);

const assetSchema = new mongoose.Schema(
    {
        assetNumber: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            trim: true
        },

        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
            index: true
        },

        // Hauptnutzer des Geräts (optional)
        contact: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Contact",
            default: null
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },

        type: {
            type: String,
            enum: ASSET_TYPES,
            default: "workstation"
        },

        status: {
            type: String,
            enum: ASSET_STATUSES,
            default: "active"
        },

        source: {
            type: String,
            enum: ASSET_SOURCES,
            default: "manual"
        },

        // Hardware
        manufacturer: shortText(100),
        model: shortText(100),
        serialNumber: shortText(100),
        assetTag: shortText(100),

        cpu: shortText(255),
        ram: shortText(100),
        disk: shortText(255),

        // System & Netzwerk
        operatingSystem: shortText(255),
        ipAddress: shortText(255),
        externalIp: shortText(100),
        macAddress: shortText(255),
        lastUser: shortText(255),

        // Lebenszyklus
        purchaseDate: { type: Date, default: null },
        warrantyUntil: { type: Date, default: null },

        notes: {
            type: String,
            trim: true,
            maxlength: 10000,
            default: null
        },

        action1: {
            type: action1Schema,
            default: null
        },

        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

// Ein Action1-Endpoint gehört zu genau einem Asset
assetSchema.index(
    { "action1.endpointId": 1 },
    {
        unique: true,
        partialFilterExpression: { "action1.endpointId": { $type: "string" } }
    }
);

assetSchema.index({ company: 1, isDeleted: 1, name: 1 });

const Asset = mongoose.model("Asset", assetSchema);

Asset.TYPES = ASSET_TYPES;
Asset.STATUSES = ASSET_STATUSES;
Asset.SOURCES = ASSET_SOURCES;

module.exports = Asset;
