const mongoose = require("mongoose");

async function connectDatabase() {
    // MONGODB_URI is the documented name; MONGO_URI is still accepted
    // so existing .env files keep working.
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!uri) {
        console.error("❌ MongoDB connection failed");
        console.error("Neither MONGODB_URI nor MONGO_URI is set. Check your .env file.");

        process.exit(1);
    }

    try {
        await mongoose.connect(uri);

        console.log("✅ MongoDB connected");
    } catch (error) {
        console.error("❌ MongoDB connection failed");
        console.error(error.message);

        process.exit(1);
    }
}

module.exports = connectDatabase;
