"use strict";

// ----------------------------------------------------
// Erinnerungen an Kündigungsfristen und Vertragsende
// ----------------------------------------------------
//
// Läuft im Hintergrund (start() in server.js): zwei Minuten nach dem Start,
// danach alle 6 Stunden. Für jeden signierten/aktiven Vertrag wird geprüft,
// ob eine Stufe (Standard 60, 30, 7 Tage vor der Frist) erreicht ist; dann
// löst der Dienst das Ereignis contract.noticeDue aus (Glocke + Mail an
// Admins und Vertrieb, siehe notification/handlers/contract.handlers.js).
//
// Jede Frist und Stufe wird genau einmal gemeldet (Contract.reminders) –
// auch wenn der Server mehrfach startet oder zwei Läufe gleichzeitig kommen.
//
// .env:  CONTRACT_REMINDER_DAYS=60,30,7   ("aus" = keine Erinnerungen)

const Contract = require("../models/contract.model");
const rules = require("../utils/contractRules");
const events = require("../core/events");

const FIRST_RUN_MS = 2 * 60 * 1000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer = null;
let running = false;

/**
 * Einmal alle Verträge prüfen
 *
 * @returns {Promise<{checked: number, sent: Array<{contract, key}>}>}
 */
async function run(now = new Date(), env = process.env) {

    const stages = rules.reminderDays(env.CONTRACT_REMINDER_DAYS);
    const result = { checked: 0, sent: [] };

    if (!stages.length || running) return result;

    running = true;

    try {

        const contracts = await Contract.find({ isDeleted: false, status: { $in: ["signed", "active"] } })
            .populate("company", "companyName customerNumber")
            .lean();

        for (const contract of contracts) {

            result.checked++;

            const reminder = rules.reminderFor(contract, now, stages);

            if (!reminder) continue;

            // Erst vormerken, dann melden: so wird nie doppelt gemeldet
            const marked = await Contract.updateOne(
                { _id: contract._id, "reminders.key": { $ne: reminder.key } },
                { $push: { reminders: { key: reminder.key, sentAt: now } } }
            );

            if (!marked.modifiedCount) continue;

            await events.emit(events.EVENTS.CONTRACT_NOTICE_DUE, { contract, reminder });

            result.sent.push({ contract: contract.contractNumber, key: reminder.key });

        }

    } finally {

        running = false;

    }

    return result;

}

async function tick() {

    try {

        const result = await run();

        if (result.sent.length) {
            console.log(`⏰ Vertragserinnerungen: ${result.sent.length} verschickt (${result.sent.map((s) => s.contract).join(", ")})`);
        }

    } catch (err) {

        console.error("❌ Vertragserinnerungen fehlgeschlagen:", err.message);

    }

}

function start(env = process.env) {

    if (!rules.reminderDays(env.CONTRACT_REMINDER_DAYS).length) {
        console.log("⏰ Vertragserinnerungen: aus (CONTRACT_REMINDER_DAYS)");
        return false;
    }

    stop();

    setTimeout(tick, FIRST_RUN_MS).unref();

    timer = setInterval(tick, INTERVAL_MS);
    timer.unref();

    return true;

}

function stop() {

    if (timer) clearInterval(timer);

    timer = null;

}

module.exports = { run, start, stop };
