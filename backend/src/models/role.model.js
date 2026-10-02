const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            maxlength: 50
        },

        description: {
            type: String,
            trim: true,
            maxlength: 255
        },

        permissions: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Permission"
            }
        ],

        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Role", roleSchema);