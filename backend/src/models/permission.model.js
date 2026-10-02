const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            maxlength: 100
        },

        description: {
            type: String,
            trim: true,
            maxlength: 255
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

module.exports = mongoose.model("Permission", permissionSchema);