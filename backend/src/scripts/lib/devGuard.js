"use strict";

// ----------------------------------------------------
// Schutz für Entwicklungs-Skripte
// ----------------------------------------------------
//
// Skripte, die Daten löschen oder Beispieldaten anlegen, dürfen nie
// gegen den Produktivbetrieb laufen.
//
//   const { assertDevelopment, confirm } = require("./lib/devGuard");
//   assertDevelopment("seed-demo-data");
//   if (!(await confirm("Wirklich?"))) process.exit(0);

const readline = require("readline");

function assertDevelopment(scriptName) {

    if (process.env.NODE_ENV === "production") {

        console.error("");
        console.error(`❌ ${scriptName} ABGEBROCHEN: NODE_ENV=production.`);
        console.error("   Dieses Skript darf nicht gegen eine Produktivdatenbank laufen.");
        console.error("");

        process.exit(1);

    }

}

/**
 * Ja/Nein-Abfrage. Mit --yes beim Aufruf entfällt die Frage.
 */
function confirm(question) {

    if (process.argv.includes("--yes")) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        rl.question(`${question} (ja/nein) `, (answer) => {
            rl.close();
            resolve(["ja", "j", "yes", "y"].includes(String(answer).trim().toLowerCase()));
        });

    });

}

module.exports = { assertDevelopment, confirm };
