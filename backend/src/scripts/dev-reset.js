require("dotenv").config();

// ----------------------------------------------------
// Entwicklungsumgebung zurücksetzen
// ----------------------------------------------------
//
// Aufruf:  npm run dev:reset
//
// Ablauf: Geschäftsdaten löschen (reset-demo-data) und danach Beispieldaten
// anlegen (seed-demo-data). Interne Benutzer bleiben erhalten.

const { spawnSync } = require("child_process");
const path = require("path");

const { assertDevelopment } = require("./lib/devGuard");

assertDevelopment("dev-reset");

function run(script, args = []) {

    const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: "inherit" });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }

}

run("reset-demo-data.js");
run("seed-demo-data.js");
