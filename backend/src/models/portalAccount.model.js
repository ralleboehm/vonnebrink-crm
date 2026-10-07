const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const portalAccountSchema = new mongoose.Schema(
    {
        contact: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Contact",
            required: true,
            unique: true,
            index: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },

        password: {
            type: String,
            required: true
        },

        active: {
            type: Boolean,
            default: true
        },

        mustChangePassword: {
            type: Boolean,
            default: true
        },

        lastLogin: {
            type: Date,
            default: null
        },

        failedLoginAttempts: {
            type: Number,
            default: 0
        },

        lockedUntil: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// ----------------------------------------------------
// Passwort vor dem Speichern verschlüsseln
// ----------------------------------------------------

portalAccountSchema.pre("save", async function () {

    if (!this.isModified("password")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 12);

});

// ----------------------------------------------------
// Passwort vergleichen
// ----------------------------------------------------

portalAccountSchema.methods.comparePassword = async function (password) {

    return bcrypt.compare(password, this.password);

};

module.exports = mongoose.model("PortalAccount", portalAccountSchema);