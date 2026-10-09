"use strict";

// ----------------------------------------------------
// HTTP-Anfragen an Nextcloud: Anmeldung, Zeitlimit, Wiederholen, Log
// ----------------------------------------------------
//
// Wird nur vom nextcloud.service verwendet. Fehler kommen immer als
// NextcloudError mit deutscher Meldung und HTTP-Status zurück.
//
// Wiederholt werden nur vorübergehende Fehler: Netzwerk, Zeitüberschreitung,
// 429, 502, 503, 504 – mit wachsender Pause (500 ms, 1 s, 2 s …).
// Ein Upload wird dafür aus seiner Quelle neu gelesen (body als Funktion).

const { Readable } = require("stream");

const { getConfig } = require("../../config/nextcloud");

const RETRY_STATUS = new Set([429, 502, 503, 504]);

class NextcloudError extends Error {

    constructor(message, { status = 0, code = "NEXTCLOUD_ERROR", method = "", path = "", cause } = {}) {

        super(message);

        this.name = "NextcloudError";
        this.status = status;
        this.code = code;
        this.method = method;
        this.path = path;

        if (cause) this.cause = cause;

    }

}

function messageFor(status, method) {

    switch (status) {
        case 401:
        case 403:
            return "Nextcloud: Anmeldung abgelehnt – bitte NEXTCLOUD_USERNAME und NEXTCLOUD_PASSWORD (App-Passwort) prüfen.";
        case 404:
            return "Nextcloud: Datei oder Ordner nicht gefunden.";
        case 405:
            return method === "MKCOL" ? "Nextcloud: Ordner existiert bereits." : "Nextcloud: Aktion nicht erlaubt.";
        case 409:
            return "Nextcloud: Übergeordneter Ordner fehlt.";
        case 412:
            return "Nextcloud: Eine Datei mit diesem Namen gibt es dort bereits.";
        case 413:
            return "Nextcloud: Datei ist zu groß.";
        case 423:
            return "Nextcloud: Datei ist gerade gesperrt (wird bearbeitet).";
        case 507:
            return "Nextcloud: Speicherplatz ist voll.";
        default:
            return status >= 500
                ? `Nextcloud: Serverfehler (${status}).`
                : `Nextcloud: Anfrage fehlgeschlagen (${status}).`;
    }

}

function sleep(ms) {

    return new Promise((resolve) => setTimeout(resolve, ms));

}

function authHeader(config) {

    return "Basic " + Buffer.from(`${config.username}:${config.password}`).toString("base64");

}

function log(config, level, text) {

    if (level === "debug" && !config.debug) return;

    const line = `☁️  Nextcloud: ${text}`;

    if (level === "warn") console.warn(line);
    else if (level === "error") console.error(line);
    else console.log(line);

}

/**
 * Eine Anfrage an Nextcloud.
 *
 * @param {string} method
 * @param {string} url              vollständige Adresse
 * @param {object} [options]
 * @param {object} [options.headers]
 * @param {any|Function} [options.body]  Inhalt oder Funktion, die ihn (neu) liefert
 * @param {number[]} [options.ok]   zusätzlich erlaubte Status (z. B. [404])
 * @param {boolean} [options.retry] wiederholen erlaubt (Standard: true)
 * @param {number} [options.timeoutMs]
 * @param {boolean} [options.stream] Antwort nicht lesen (Download)
 * @param {string} [options.label]  Text für Log/Fehler (z. B. Pfad)
 * @returns {Promise<{status, headers, text?, json?, body?}>}
 */
async function request(method, url, options = {}) {

    const config = getConfig();

    if (!config.configured) {
        throw new NextcloudError("Nextcloud ist nicht eingerichtet (NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_PASSWORD).", { code: "NOT_CONFIGURED", status: 503 });
    }

    const label = options.label || url.replace(config.url, "");
    const attempts = options.retry === false ? 1 : config.retries + 1;
    const allowed = new Set(options.ok || []);

    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {

        if (attempt > 1) {

            const wait = config.retryDelayMs * 2 ** (attempt - 2);

            log(config, "warn", `${method} ${label} – Versuch ${attempt} von ${attempts} in ${wait} ms (${lastError.message})`);

            await sleep(wait);

        }

        const controller = new AbortController();
        const timeoutMs = options.timeoutMs || config.timeoutMs;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const body = typeof options.body === "function" ? options.body() : options.body;
        const isStream = body && typeof body.pipe === "function";

        const started = Date.now();

        let response;

        try {

            response = await fetch(url, {
                method,
                headers: { Authorization: authHeader(config), ...(options.headers || {}) },
                body: isStream ? Readable.toWeb(body) : body,
                duplex: body ? "half" : undefined,
                signal: controller.signal,
                redirect: "manual"
            });

        } catch (err) {

            clearTimeout(timer);

            if (isStream) body.destroy();

            const timedOut = controller.signal.aborted;

            lastError = new NextcloudError(
                timedOut
                    ? `Nextcloud antwortet nicht (Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)} s).`
                    : `Nextcloud ist nicht erreichbar (${err.cause && err.cause.code ? err.cause.code : err.message}).`,
                { status: 503, code: timedOut ? "TIMEOUT" : "NETWORK", method, path: label, cause: err }
            );

            continue;

        }

        // Download: Zeitlimit nur bis zur Antwort, nicht für die ganze Datei
        if (options.stream) clearTimeout(timer);

        log(config, "debug", `${method} ${label} → ${response.status} (${Date.now() - started} ms)`);

        const success = (response.status >= 200 && response.status < 300) || allowed.has(response.status);

        if (success) {

            if (options.stream) {
                return {
                    status: response.status,
                    headers: response.headers,
                    body: response.body ? Readable.fromWeb(response.body) : Readable.from([])
                };
            }

            try {

                const text = await response.text();
                const result = { status: response.status, headers: response.headers, text };

                if ((response.headers.get("content-type") || "").includes("json") && text) {
                    try {
                        result.json = JSON.parse(text);
                    } catch {
                        // keine gültige JSON-Antwort – Text genügt
                    }
                }

                return result;

            } finally {

                clearTimeout(timer);

            }

        }

        clearTimeout(timer);

        // Antwort verwerfen, damit die Verbindung frei wird
        try {
            await response.arrayBuffer();
        } catch {
            // egal
        }

        lastError = new NextcloudError(messageFor(response.status, method), { status: response.status, code: `HTTP_${response.status}`, method, path: label });

        if (!RETRY_STATUS.has(response.status)) break;

    }

    // Erwartbare Antworten (404, 412 …) entscheidet der Aufrufer – nur Störungen ins Fehlerlog
    const disturbance = !lastError.status || lastError.status >= 500 || lastError.status === 401 || lastError.status === 403;

    log(config, disturbance ? "error" : "debug", `${method} ${label} fehlgeschlagen: ${lastError.message}`);

    throw lastError;

}

module.exports = {
    NextcloudError,
    request,
    messageFor
};
