"use strict";

const fs = require("fs");
const path = require("path");

const { uploadDirectory } = require("../../config/importUpload");

// ----------------------------------------------------
// Import-Vorgang in der Session
// ----------------------------------------------------
//
// In der Session steht nur der Name der hochgeladenen Datei, die der
// Server selbst vergeben hat, plus die Zuordnung. Der Pfad kommt nie
// vom Browser.

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function resolveFile(job) {

    if (!job || !job.file) {
        return null;
    }

    const fileName = path.basename(job.file);

    if (!/^import-[0-9a-f-]+\.csv$/.test(fileName)) {
        return null;
    }

    return path.join(uploadDirectory, fileName);

}

function removeFile(job) {

    const filePath = resolveFile(job);

    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

}

/**
 * Liefert den aktuellen Vorgang oder null.
 */
function getJob(req, entityKey) {

    const job = req.session.importJob;

    if (!job || job.entity !== entityKey) {
        return null;
    }

    const filePath = resolveFile(job);

    if (!filePath || !fs.existsSync(filePath)) {
        return null;
    }

    return job;

}

function readFile(job) {

    return fs.readFileSync(resolveFile(job));

}

function discardJob(req) {

    if (req.session.importJob) {

        try {
            removeFile(req.session.importJob);
        } catch (err) {
            console.error("Import-Datei konnte nicht gelöscht werden:", err.message);
        }

        delete req.session.importJob;

    }

}

/**
 * Löscht liegengebliebene Import-Dateien (Vorgang abgebrochen,
 * Browser geschlossen, ...).
 */
function cleanupStale() {

    try {

        for (const name of fs.readdirSync(uploadDirectory)) {

            if (!/^import-[0-9a-f-]+\.csv$/.test(name)) {
                continue;
            }

            const filePath = path.join(uploadDirectory, name);

            if (Date.now() - fs.statSync(filePath).mtimeMs > STALE_AFTER_MS) {
                fs.unlinkSync(filePath);
            }

        }

    } catch (err) {
        console.error("Aufräumen der Import-Dateien fehlgeschlagen:", err.message);
    }

}

function saveSession(req) {

    return new Promise((resolve, reject) => {

        req.session.save((err) => (err ? reject(err) : resolve()));

    });

}

module.exports = {
    getJob,
    readFile,
    discardJob,
    cleanupStale,
    removeFile,
    saveSession
};
