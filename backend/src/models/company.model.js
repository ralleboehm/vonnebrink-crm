const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100
        },

        customerNumber: {
            type: Number,
            unique: true
        },

        status: {
            type: String,
            enum: ["prospect", "active", "inactive"],
            default: "prospect"
        },

        address: {
            street: {
                type: String,
                trim: true,
                maxlength: 100
            },

            houseNumber: {
                type: String,
                trim: true,
                maxlength: 20
            },

            postalCode: {
                type: String,
                trim: true,
                maxlength: 10
            },

            city: {
                type: String,
                trim: true,
                maxlength: 100
            },

            country: {
                type: String,
                trim: true,
                default: "Deutschland",
                maxlength: 100
            }
        },

        phone: {
            type: String,
            trim: true,
            maxlength: 30
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 100
        },

        website: {
            type: String,
            trim: true,
            maxlength: 255
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 5000
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

module.exports = mongoose.model("Company", companySchema);