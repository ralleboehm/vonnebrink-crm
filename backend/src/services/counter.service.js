const Counter = require("../models/counter.model");

exports.next = async (name, prefix) => {

    const counter = await Counter.findOneAndUpdate(

        { name },

        {
            $inc: {
                sequence: 1
            }
        },

        {
            new: true,
            upsert: true
        }

    );

    return `${prefix}-${String(counter.sequence).padStart(6, "0")}`;

};