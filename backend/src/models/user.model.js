const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 50
        },

        firstName: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100
        },

        lastName: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100
        },

        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            maxlength: 255
        },

        password: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: [
                "admin",
                "technician",
                "sales",
                "portal"
            ],
            default: "technician"
        },

        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            default: null
        },

        contact: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Contact",
            default: null
        },

        active: {
            type: Boolean,
            default: true
        },

        lastLogin: {
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

userSchema.pre("save", async function () {

    if (!this.isModified("password")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 12);

});

// ----------------------------------------------------
// Passwort vergleichen
// ----------------------------------------------------

userSchema.methods.comparePassword = async function (password) {

    return bcrypt.compare(password, this.password);

};

module.exports = mongoose.model("User", userSchema);