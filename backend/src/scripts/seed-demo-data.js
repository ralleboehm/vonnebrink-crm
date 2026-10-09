require("dotenv").config();

// ----------------------------------------------------
// Beispieldaten anlegen (vorbereitet)
// ----------------------------------------------------
//
// Aufruf:  npm run dev:seed
//
// Geplanter Aufbau – je Bereich eine Funktion, die Beispieldaten über die
// Services anlegt (nie direkt über Models, damit Nummern, Validierung und
// Ereignisse genauso laufen wie im echten Betrieb):
//
//   seedCompanies()   Firmen mit Adressen
//   seedContacts()    Ansprechpartner + Portalzugänge
//   seedTickets()     Tickets in allen Status
//   seedAssets()      Geräte je Firma
//   (später: Sales, Angebote, Rechnungen, Verträge)
//
// Noch nicht umgesetzt – das Skript prüft nur die Umgebung.

const { assertDevelopment } = require("./lib/devGuard");

assertDevelopment("seed-demo-data");

const SEEDERS = [
    // { name: "Firmen", run: seedCompanies },
];

async function main() {

    if (!SEEDERS.length) {
        console.log("ℹ️  seed-demo-data ist vorbereitet, aber noch ohne Beispieldaten.");
        return;
    }

    const connectDatabase = require("../config/database");
    const mongoose = require("mongoose");

    await connectDatabase();

    for (const seeder of SEEDERS) {
        console.log(`→ ${seeder.name}`);
        await seeder.run();
    }

    await mongoose.disconnect();

}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
