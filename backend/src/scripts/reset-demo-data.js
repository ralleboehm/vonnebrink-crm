require("dotenv").config();

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mongoose = require("mongoose");

const connectDatabase = require("../config/database");

const Company = require("../models/company.model");
const Contact = require("../models/contact.model");
const PortalAccount = require("../models/portalAccount.model");
const Ticket = require("../models/ticket.model");
const TicketMessage = require("../models/ticketMessage.model");
const Attachment = require("../models/attachment.model");
const Counter = require("../models/counter.model");
const Asset = require("../models/asset.model");
const Campaign = require("../models/campaign.model");
const Activity = require("../models/activity.model");
const Notification = require("../models/notification.model");
const SyncRun = require("../models/syncRun.model");

const storageService = require("../services/storage.service");

// ----------------------------------------------------
// Einstellungen
// ----------------------------------------------------

const STORAGE_PATH = storageService.basePath;

// ----------------------------------------------------
// Sicherheitsprüfung
// ----------------------------------------------------

if (process.env.NODE_ENV === "production") {

    console.error("");
    console.error("==========================================");
    console.error(" RESET ABGEBROCHEN");
    console.error("==========================================");
    console.error("");
    console.error("Dieses Script darf nicht");
    console.error("gegen eine Produktivdatenbank");
    console.error("ausgeführt werden.");
    console.error("");

    process.exit(1);

}

// ----------------------------------------------------
// Sicherheitsabfrage
// ----------------------------------------------------

function confirmReset() {

    return new Promise((resolve) => {

        const rl = readline.createInterface({

            input: process.stdin,
            output: process.stdout

        });

        console.log("");
        console.log("==========================================");
        console.log(" Vonnebrink CRM Development Reset");
        console.log("==========================================");
        console.log("");
        console.log("Es werden gelöscht:");
        console.log("");
        console.log(" • Firmen");
        console.log(" • Kontakte");
        console.log(" • Portalzugänge");
        console.log(" • Tickets");
        console.log(" • Ticketnachrichten");
        console.log(" • Anhänge");
        console.log(" • Aktivitäten");
        console.log(" • Assets");
        console.log(" • Benachrichtigungen");
        console.log(" • Action1-Syncprotokolle");
        console.log(" • Counter");
        console.log(" • Storage");
        console.log("");
        console.log("Interne Benutzer bleiben erhalten.");
        console.log("");

        rl.question(

            "Zum Fortfahren YES eingeben: ",

            (answer) => {

                rl.close();

                resolve(answer === "YES");

            }

        );

    });

}
// ----------------------------------------------------
// Storage bereinigen
// ----------------------------------------------------

function deleteDirectoryContents(directory) {

    if (!fs.existsSync(directory)) {

        return;

    }

    const entries = fs.readdirSync(

        directory,

        {
            withFileTypes: true
        }

    );

    for (const entry of entries) {

        const fullPath = path.join(

            directory,
            entry.name

        );

        if (entry.isDirectory()) {

            deleteDirectoryContents(fullPath);

            fs.rmSync(

                fullPath,

                {
                    recursive: true,
                    force: true
                }

            );

        } else {

            fs.unlinkSync(fullPath);

        }

    }

}

function resetStorage() {

    console.log("");
    console.log("Bereinige Storage...");

    deleteDirectoryContents(STORAGE_PATH);

    storageService.ensureDirectory(STORAGE_PATH);

    storageService.ensureDirectory(

        path.join(
            STORAGE_PATH,
            "temp"
        )

    );

    storageService.ensureDirectory(

        path.join(
            STORAGE_PATH,
            "tickets"
        )

    );

    console.log("✔ Storage bereinigt");

}

// ----------------------------------------------------
// Geschäftsdaten löschen
// ----------------------------------------------------

async function resetBusinessData() {

    console.log("");
    console.log("Lösche Geschäftsdaten...");
    console.log("");

    // Daten, die auf Tickets, Firmen oder Benutzer verweisen, zuerst
    const activities =
        await Activity.deleteMany({});

    console.log(
        `✔ Aktivitäten: ${activities.deletedCount}`
    );

    const assets =
        await Asset.deleteMany({});

    console.log(
        `✔ Assets: ${assets.deletedCount}`
    );

    // Kampagnen verweisen auf Kontakte
    const campaigns =
        await Campaign.deleteMany({});

    console.log(
        `✔ Kampagnen: ${campaigns.deletedCount}`
    );

    const notifications =
        await Notification.deleteMany({});

    console.log(
        `✔ Benachrichtigungen: ${notifications.deletedCount}`
    );

    const syncRuns =
        await SyncRun.deleteMany({});

    console.log(
        `✔ Action1-Syncprotokolle: ${syncRuns.deletedCount}`
    );

    const attachments =
        await Attachment.deleteMany({});

    console.log(
        `✔ Anhänge: ${attachments.deletedCount}`
    );

    const messages =
        await TicketMessage.deleteMany({});

    console.log(
        `✔ Ticketnachrichten: ${messages.deletedCount}`
    );

    const tickets =
        await Ticket.deleteMany({});

    console.log(
        `✔ Tickets: ${tickets.deletedCount}`
    );

    const portalAccounts =
        await PortalAccount.deleteMany({});

    console.log(
        `✔ Portalzugänge: ${portalAccounts.deletedCount}`
    );

    const contacts =
        await Contact.deleteMany({});

    console.log(
        `✔ Kontakte: ${contacts.deletedCount}`
    );

    const companies =
        await Company.deleteMany({});

    console.log(
        `✔ Firmen: ${companies.deletedCount}`
    );

}
// ----------------------------------------------------
// Counter zurücksetzen
// ----------------------------------------------------

async function resetCounters() {

    console.log("");
    console.log("Setze Counter zurück...");
    console.log("");

    const counters = [

        "company",
        "contact",
        "ticket",
        "asset"

    ];

    for (const name of counters) {

        const result = await Counter.findOneAndUpdate(

            {
                name
            },

            {
                $set: {
                    sequence: 0
                }
            },

            {
                returnDocument: "after"
            }

        );

        if (result) {

            console.log(
                `✔ ${name}`
            );

        } else {

            console.log(
                `⚠ Counter "${name}" existiert nicht`
            );

        }

    }

}

// ----------------------------------------------------
// Datenbank trennen
// ----------------------------------------------------

async function disconnectDatabase() {

    await mongoose.disconnect();

    console.log("");
    console.log("✔ MongoDB getrennt");

}
// ----------------------------------------------------
// Hauptprogramm
// ----------------------------------------------------

async function main() {

    try {

        const confirmed = await confirmReset();

        if (!confirmed) {

            console.log("");
            console.log("Reset wurde abgebrochen.");
            console.log("");

            process.exit(0);

        }

        console.log("");

        await connectDatabase();

        await resetBusinessData();

        await resetCounters();

        resetStorage();

        await disconnectDatabase();

        console.log("");
        console.log("==========================================");
        console.log(" Reset erfolgreich abgeschlossen");
        console.log("==========================================");
        console.log("");
        console.log("✔ Interne Benutzer wurden beibehalten.");
        console.log("✔ Geschäftsdaten wurden gelöscht.");
        console.log("✔ Counter wurden zurückgesetzt.");
        console.log("✔ Storage wurde bereinigt.");
        console.log("");
        console.log("Die Entwicklungsdatenbank ist jetzt leer.");
        console.log("");

        process.exit(0);

    } catch (err) {

        console.error("");
        console.error("==========================================");
        console.error(" FEHLER");
        console.error("==========================================");
        console.error("");

        console.error(err);

        try {

            await mongoose.disconnect();

        } catch (disconnectError) {

            // Ignorieren

        }

        process.exit(1);

    }

}

main();