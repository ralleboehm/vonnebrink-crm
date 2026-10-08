"use strict";

// Automatischer Action1-Sync im Hintergrund.
//
// Aktiv, wenn ACTION1_SYNC_INTERVAL_MINUTES gesetzt ist (mindestens 15).
// Der erste Lauf startet eine Minute nach dem Serverstart.

const { isConfigured } = require("./client");
const syncService = require("./sync.service");

const MIN_INTERVAL_MINUTES = 15;

let timer = null;

async function tick() {

    if (syncService.isRunning()) {
        return;
    }

    try {

        const result = await syncService.runSync({ trigger: "schedule" });
        const s = result.stats;

        console.log(
            `🔄 Action1-Sync: ${s.endpoints} Geräte, ${s.created} neu, ${s.updated + s.linked} aktualisiert, ` +
            `${s.missing} nicht mehr vorhanden${result.ok ? "" : `, ${result.failures.length} Fehler`}`
        );

    } catch (err) {

        console.error("❌ Action1-Sync fehlgeschlagen:", err.message);

    }

}

function start(env = process.env) {

    const minutes = parseInt(env.ACTION1_SYNC_INTERVAL_MINUTES, 10);

    if (!minutes || minutes <= 0) {
        return false;
    }

    if (!isConfigured(env)) {
        console.warn("⚠️  ACTION1_SYNC_INTERVAL_MINUTES ist gesetzt, aber Action1 ist nicht konfiguriert.");
        return false;
    }

    const interval = Math.max(minutes, MIN_INTERVAL_MINUTES);

    stop();

    setTimeout(tick, 60 * 1000).unref();

    timer = setInterval(tick, interval * 60 * 1000);
    timer.unref();

    console.log(`🔄 Action1-Sync      : alle ${interval} Minuten`);

    return true;

}

function stop() {

    if (timer) {
        clearInterval(timer);
        timer = null;
    }

}

module.exports = { start, stop };
