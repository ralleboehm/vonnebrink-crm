require("dotenv").config();

const mongoose = require("mongoose");

const User = require("../models/user.model");

async function createAdmin() {

    try {

        await mongoose.connect(process.env.MONGO_URI);

        const existingUser = await User.findOne({
            username: "admin"
        });

        if (existingUser) {

            console.log("Admin-Benutzer existiert bereits.");
            process.exit(0);

        }

        const user = new User({

            username: "admin",

            firstName: "Ralf",

            lastName: "Böhm",

            email: "rbohm@vonnebrink.com",

            password: "Admin123!",

            role: "admin",

            active: true

        });

        await user.save();

        console.log("✅ Admin-Benutzer erfolgreich erstellt.");
        console.log("Benutzername: admin");
        console.log("Passwort: Admin123!");

        process.exit(0);

    } catch (err) {

        console.error(err);

        process.exit(1);

    }

}

createAdmin();