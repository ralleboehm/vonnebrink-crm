require("dotenv").config({ quiet: true });

// ----------------------------------------------------
// Beispieldaten anlegen
// ----------------------------------------------------
//
// Aufruf:  npm run dev:seed            (nur in eine leere Datenbank)
//          npm run dev:reset           (erst löschen, dann anlegen)
//
// Legt erfundene Kunden mit Ansprechpartnern, Portalzugängen, Geräten und
// Tickets an (Daten: seed/demoData.js). Alles läuft über die Services –
// Kunden-, Kontakt-, Ticket- und Asset-Nummern entstehen also genauso wie
// im echten Betrieb. Es werden keine E-Mails verschickt und keine
// Benachrichtigungen ausgelöst.
//
// Voraussetzung: mindestens ein interner Benutzer (npm run create-admin).
// Er wird Ersteller und Bearbeiter der Beispieltickets.

const { assertDevelopment } = require("./lib/devGuard");
const { PORTAL_PASSWORD, COMPANIES } = require("./seed/demoData");

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

function yearsAgo(years, now) {
    return new Date(now.getTime() - years * YEAR);
}

function addYears(date, years) {
    return new Date(date.getTime() + years * YEAR);
}

/**
 * Beispieldaten anlegen. Erwartet eine bestehende Datenbankverbindung.
 *
 * @param {object} [options]
 * @param {(msg: string) => void} [options.log]
 * @param {boolean} [options.force]  auch wenn bereits Firmen existieren
 * @param {Date} [options.now]
 * @returns {Promise<object>} Zusammenfassung
 */
async function seed(options = {}) {

    const log = options.log || console.log;
    const now = options.now || new Date();

    // Services erst hier laden (nach dotenv / Verbindungsaufbau)
    const companyService = require("../services/company.service");
    const contactService = require("../services/contact.service");
    const portalAccountService = require("../services/portalAccount.service");
    const ticketService = require("../services/ticket.service");
    const ticketMessageService = require("../services/ticketMessage.service");
    const assetService = require("../services/asset.service");
    const userService = require("../services/user.service");
    const marketingService = require("../services/marketing.service");

    const existing = await companyService.findAll();

    if (existing.length && !options.force) {
        throw new Error(`Die Datenbank enthält bereits ${existing.length} Firma/Firmen. Erst "npm run dev:reset" ausführen (oder --force).`);
    }

    const users = await userService.findAll();
    const staff = users.find((user) => user.role === "admin") || users[0];

    if (!staff) {
        throw new Error("Kein aktiver interner Benutzer gefunden. Bitte zuerst \"npm run create-admin\" ausführen.");
    }

    const summary = { companies: 0, contacts: 0, portalAccounts: [], assets: 0, tickets: 0, messages: 0, marketing: { granted: 0, revoked: 0 } };

    for (const data of COMPANIES) {

        const company = await companyService.create({
            companyName: data.companyName,
            status: data.status,
            phone: data.phone,
            email: data.email,
            website: data.website,
            address: data.address,
            tags: data.tags || []
        });

        summary.companies++;
        log(`✔ ${company.customerNumber}  ${company.companyName}`);

        // ------------------------------------------------
        // Ansprechpartner & Portalzugänge
        // ------------------------------------------------

        const contacts = {};
        const portalAccounts = {};

        for (const person of data.contacts) {

            const contact = await contactService.create({
                company: company._id,
                salutation: person.salutation,
                firstName: person.firstName,
                lastName: person.lastName,
                position: person.position,
                email: person.email,
                phone: person.phone,
                mobile: person.mobile
            });

            contacts[person.key] = contact;
            summary.contacts++;

            if (person.portal) {

                const { portalAccount } = await portalAccountService.createForContact(contact._id);

                // Bekanntes Passwort, kein Passwortwechsel beim ersten Login
                await portalAccountService.changePassword(portalAccount._id, PORTAL_PASSWORD);

                portalAccounts[person.key] = portalAccount;
                summary.portalAccounts.push(contact.email);

                // Marketing-Einwilligung, wie vom Kontakt selbst im Portal gesetzt
                if (person.marketing) {
                    await marketingService.setConsent(contact._id, person.marketing === "granted", {
                        source: "portal",
                        by: `${contact.firstName} ${contact.lastName}`,
                        note: "Beispieldaten"
                    });
                    summary.marketing[person.marketing]++;
                }

            }

        }

        // ------------------------------------------------
        // Geräte
        // ------------------------------------------------

        for (const item of data.assets) {

            const purchaseDate = item.purchaseYearsAgo !== undefined ? yearsAgo(item.purchaseYearsAgo, now) : null;

            const assetData = {
                company: String(company._id),
                contact: item.contact ? String(contacts[item.contact]._id) : null,
                name: item.name,
                type: item.type,
                status: item.status || "active",
                manufacturer: item.manufacturer || null,
                model: item.model || null,
                serialNumber: item.serialNumber || null,
                operatingSystem: item.operatingSystem || null,
                cpu: item.cpu || null,
                ram: item.ram || null,
                disk: item.disk || null,
                ipAddress: item.ipAddress || null,
                purchaseDate,
                warrantyUntil: purchaseDate && item.warrantyYears ? addYears(purchaseDate, item.warrantyYears) : null,
                notes: "Beispieldaten"
            };

            const problem = await assetService.validate(assetData);

            if (problem) {
                throw new Error(`Asset ${item.name}: ${problem}`);
            }

            await assetService.create(assetData);
            summary.assets++;

        }

        // ------------------------------------------------
        // Tickets & Nachrichten
        // ------------------------------------------------

        const anyPortalAccount = Object.values(portalAccounts)[0] || null;

        for (const item of data.tickets) {

            const contact = contacts[item.contact] || null;

            const ticket = await ticketService.create({
                company: company._id,
                contact: contact ? contact._id : null,
                subject: item.subject,
                description: item.description,
                category: item.category,
                priority: item.priority,
                createdBy: staff._id
            });

            if (item.status && item.status !== "open") {
                await ticketService.updateStatus(ticket._id, item.status);
            }

            if (item.assigned) {
                await ticketService.assign(ticket._id, staff._id);
            }

            // Alter des Tickets für Dashboard und Listen (ohne Mongoose-Zeitstempel)
            const createdAt = new Date(now.getTime() - (item.daysAgo || 0) * DAY - 2 * 60 * 60 * 1000);

            await ticket.constructor.collection.updateOne(
                { _id: ticket._id },
                { $set: { createdAt, updatedAt: createdAt } }
            );

            summary.tickets++;

            for (const [index, message] of (item.messages || []).entries()) {

                const author = message.from === "customer"
                    ? (portalAccounts[item.contact] || anyPortalAccount || staff)._id
                    : staff._id;

                const created = await ticketMessageService.create({
                    ticket: ticket._id,
                    author,
                    message: message.text,
                    isInternal: Boolean(message.internal)
                });

                const messageTime = new Date(createdAt.getTime() + (index + 1) * 45 * 60 * 1000);

                await created.constructor.collection.updateOne(
                    { _id: created._id },
                    { $set: { createdAt: messageTime, updatedAt: messageTime } }
                );

                summary.messages++;

            }

        }

    }

    summary.staff = `${staff.firstName} ${staff.lastName}`;
    summary.portalPassword = PORTAL_PASSWORD;

    return summary;

}

async function main() {

    assertDevelopment("seed-demo-data");

    const mongoose = require("mongoose");
    const connectDatabase = require("../config/database");

    await connectDatabase();

    console.log("");
    console.log("Lege Beispieldaten an …");
    console.log("");

    try {

        const summary = await seed({ force: process.argv.includes("--force") });

        console.log("");
        console.log("==========================================");
        console.log(" Beispieldaten angelegt");
        console.log("==========================================");
        console.log("");
        console.log(`✔ Firmen:        ${summary.companies}`);
        console.log(`✔ Kontakte:      ${summary.contacts}`);
        console.log(`✔ Assets:        ${summary.assets}`);
        console.log(`✔ Tickets:       ${summary.tickets} (mit ${summary.messages} Nachrichten, Bearbeiter: ${summary.staff})`);
        console.log(`✔ Marketing:     ${summary.marketing.granted} eingewilligt, ${summary.marketing.revoked} abgemeldet`);
        console.log("");
        console.log("Kundenportal-Zugänge (Passwort für alle):");
        console.log(`   ${summary.portalPassword}`);
        for (const email of summary.portalAccounts) {
            console.log(`   • ${email}`);
        }
        console.log("");

    } catch (err) {

        console.error("");
        console.error(`❌ ${err.message}`);
        console.error("");
        process.exitCode = 1;

    } finally {

        await mongoose.disconnect();

    }

}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { seed };
