require("dotenv").config({ quiet: true });

// ----------------------------------------------------
// Nextcloud einrichten / prüfen
// ----------------------------------------------------
//
// Aufruf:  npm run nextcloud:setup
//
// 1. Verbindung und Anmeldung prüfen, Hauptordner anlegen
// 2. Für jede Firma den Kundenordner mit allen Unterordnern anlegen
//    (vorhandene Ordner bleiben unverändert – beliebig oft ausführbar)

const mongoose = require("mongoose");

const connectDatabase = require("../config/database");
const nextcloud = require("../services/nextcloud.service");
const documentService = require("../services/document.service");

async function main() {

    const status = nextcloud.status();

    if (!status.configured) {

        console.error("❌ Nextcloud ist nicht eingerichtet.");
        console.error("   Bitte NEXTCLOUD_URL, NEXTCLOUD_USERNAME und NEXTCLOUD_PASSWORD in backend/.env eintragen.");

        if (status.invalidUrl) console.error("   NEXTCLOUD_URL muss mit http:// oder https:// beginnen.");

        process.exit(1);

    }

    console.log(`☁️  Prüfe Verbindung zu ${status.url} als "${status.username}" …`);

    const check = await nextcloud.checkConnection();

    if (!check.ok) {
        console.error(`❌ ${check.message}`);
        process.exit(1);
    }

    console.log(`✅ ${check.message}`);

    await connectDatabase();

    console.log("📁 Lege Kundenordner an (vorhandene bleiben unverändert) …");

    const result = await documentService.ensureAllCustomerStructures();

    console.log(`✅ ${result.companies - result.failed.length} von ${result.companies} Firmen fertig.`);

    for (const entry of result.failed) {
        console.error(`❌ ${entry.company}: ${entry.error}`);
    }

    await mongoose.disconnect();

    process.exit(result.failed.length ? 1 : 0);

}

main().catch((err) => {

    console.error("❌", err.message);
    process.exit(1);

});
