require("dotenv").config();

// Alle Log-Zeilen mit Datum und Uhrzeit (auch in logs/crm.log)
require("./core/logging/timestamps").install();

const app = require("./app");
const connectDatabase = require("./config/database");
const integrations = require("./integrations");

const PORT = process.env.PORT || 3000;

async function startServer() {

    try {

        await connectDatabase();

        app.listen(PORT, () => {

            console.log("");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("📦 Vonnebrink CRM Backend");
            console.log(`🌍 Environment : ${process.env.NODE_ENV || "development"}`);
            console.log(`🚀 Server      : http://localhost:${PORT}`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            integrations.startAll();
            console.log("✅ Ready");
            console.log("");

        });

    } catch (err) {

        console.error("❌ Server failed to start");
        console.error(err);
        process.exit(1);

    }

}

startServer();