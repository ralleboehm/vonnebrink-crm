"use strict";

// ----------------------------------------------------
// Action1 API-Client (API 3.0)
// ----------------------------------------------------
//
// - Anmeldung per OAuth2 Client Credentials (API-Schlüssel aus Action1:
//   Configuration -> API Credentials). Das Token wird bis kurz vor Ablauf
//   wiederverwendet; bei 401 wird einmal neu angemeldet.
// - Action1 empfiehlt weniger als 30 Anfragen pro Minute. Der Client hält
//   deshalb einen Mindestabstand zwischen zwei Anfragen ein.
// - Listen werden seitenweise über from/limit geladen.
//
// Für Tests lassen sich fetch, Uhr und Wartefunktion von außen übergeben.

const DEFAULT_BASE_URL = "https://app.action1.com/api/3.0";
const DEFAULT_MIN_INTERVAL_MS = 2100;   // ~28 Anfragen pro Minute
const DEFAULT_TIMEOUT_MS = 30000;
const PAGE_SIZE = 50;
const MAX_PAGES = 200;
const TOKEN_SAFETY_MS = 60 * 1000;

class Action1Error extends Error {

    constructor(message, status = null) {
        super(message);
        this.name = "Action1Error";
        this.status = status;
    }

}

function normalizeBaseUrl(value) {

    const url = String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");

    // Wer nur "https://app.eu.action1.com" einträgt, bekommt den API-Pfad dazu
    return /\/api\/\d/.test(url) ? url : `${url}/api/3.0`;

}

/**
 * Konfiguration aus Umgebungsvariablen
 */
function configFromEnv(env = process.env) {

    return {
        baseUrl: normalizeBaseUrl(env.ACTION1_BASE_URL),
        clientId: (env.ACTION1_CLIENT_ID || "").trim(),
        clientSecret: (env.ACTION1_CLIENT_SECRET || "").trim()
    };

}

function isConfigured(env = process.env) {

    const config = configFromEnv(env);

    return Boolean(config.clientId && config.clientSecret);

}

function createClient(options = {}) {

    const config = {
        ...configFromEnv(),
        ...options
    };

    config.baseUrl = normalizeBaseUrl(config.baseUrl);

    const fetchImpl = options.fetch || globalThis.fetch;
    const now = options.now || (() => Date.now());
    const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!config.clientId || !config.clientSecret) {
        throw new Action1Error("Action1 ist nicht konfiguriert (ACTION1_CLIENT_ID / ACTION1_CLIENT_SECRET fehlen).");
    }

    let token = null;
    let tokenExpiresAt = 0;
    let lastRequestAt = -Infinity;

    async function throttle() {

        const wait = lastRequestAt + minIntervalMs - now();

        if (wait > 0) {
            await sleep(wait);
        }

        lastRequestAt = now();

    }

    async function send(url, init) {

        await throttle();

        const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout
            ? AbortSignal.timeout(timeoutMs)
            : undefined;

        try {

            return await fetchImpl(url, { ...init, signal });

        } catch (err) {

            const reason = err && err.name === "TimeoutError"
                ? "Zeitüberschreitung"
                : (err && err.message) || "Netzwerkfehler";

            throw new Action1Error(`Action1 nicht erreichbar: ${reason}`);

        }

    }

    async function readError(response) {

        let detail = "";

        try {

            const text = await response.text();

            try {
                const json = JSON.parse(text);
                detail = json.user_message || json.message || json.error_description || json.error || "";
            } catch {
                detail = text.slice(0, 200);
            }

        } catch {
            // ignorieren
        }

        return detail ? ` – ${detail}` : "";

    }

    async function authenticate() {

        const body = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret
        });

        const response = await send(`${config.baseUrl}/oauth2/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json"
            },
            body: body.toString()
        });

        if (!response.ok) {

            const hint = response.status === 400 || response.status === 401
                ? " (API-Schlüssel oder ACTION1_BASE_URL prüfen)"
                : "";

            throw new Action1Error(
                `Anmeldung bei Action1 fehlgeschlagen: HTTP ${response.status}${await readError(response)}${hint}`,
                response.status
            );

        }

        const data = await response.json();

        if (!data || !data.access_token) {
            throw new Action1Error("Anmeldung bei Action1 fehlgeschlagen: kein Token erhalten.");
        }

        const lifetimeMs = (Number(data.expires_in) || 3600) * 1000;

        token = data.access_token;
        tokenExpiresAt = now() + Math.max(lifetimeMs - TOKEN_SAFETY_MS, 0);

        return token;

    }

    async function getToken() {

        if (token && now() < tokenExpiresAt) {
            return token;
        }

        return authenticate();

    }

    /**
     * GET auf einen API-Pfad, z. B. "/organizations"
     */
    async function get(path, query = {}) {

        const url = new URL(`${config.baseUrl}${path}`);

        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        }

        for (let attempt = 0; attempt < 2; attempt++) {

            const response = await send(url.toString(), {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${await getToken()}`,
                    Accept: "application/json"
                }
            });

            if (response.status === 401 && attempt === 0) {
                token = null;
                continue;
            }

            if (response.status === 429) {
                throw new Action1Error("Action1 meldet zu viele Anfragen (HTTP 429). Bitte später erneut versuchen.", 429);
            }

            if (!response.ok) {
                throw new Action1Error(
                    `Action1-Anfrage ${path} fehlgeschlagen: HTTP ${response.status}${await readError(response)}`,
                    response.status
                );
            }

            return response.json();

        }

        throw new Action1Error("Action1 hat die Anmeldung abgelehnt (HTTP 401).", 401);

    }

    /**
     * Alle Einträge einer Liste (ResultPage) laden
     */
    async function getAll(path, query = {}) {

        const items = [];

        for (let page = 0; page < MAX_PAGES; page++) {

            const data = await get(path, { ...query, from: items.length, limit: PAGE_SIZE });

            const pageItems = Array.isArray(data && data.items) ? data.items : [];

            items.push(...pageItems);

            const total = Number(data && data.total_items);

            if (pageItems.length === 0) break;
            if (Number.isFinite(total) && items.length >= total) break;
            if (!Number.isFinite(total) && !(data && data.next_page)) break;

        }

        return items;

    }

    return {

        baseUrl: config.baseUrl,

        listOrganizations() {
            return getAll("/organizations");
        },

        /**
         * Verwaltete Endpoints einer Organisation inkl. Hardware- und
         * Patch-Details (fields=*)
         */
        listEndpoints(organizationId) {
            return getAll(`/endpoints/managed/${encodeURIComponent(organizationId)}`, { fields: "*" });
        }

    };

}

// Gemeinsamer Client für die ganze Anwendung: ein Token, ein Takt für
// alle Anfragen (Seitenaufrufe und Sync teilen sich das Anfragelimit).
let shared = null;
let sharedKey = null;

function getSharedClient(env = process.env) {

    const config = configFromEnv(env);
    const key = `${config.baseUrl}|${config.clientId}|${config.clientSecret}`;

    if (!shared || sharedKey !== key) {
        shared = createClient(config);
        sharedKey = key;
    }

    return shared;

}

module.exports = {
    Action1Error,
    getSharedClient,
    DEFAULT_BASE_URL,
    PAGE_SIZE,
    normalizeBaseUrl,
    configFromEnv,
    isConfigured,
    createClient
};
