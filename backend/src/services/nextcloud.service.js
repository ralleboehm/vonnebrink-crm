"use strict";

// ----------------------------------------------------
// Nextcloud-Service – zentraler Zugang zur Dokumentenablage
// ----------------------------------------------------
//
// Alle Module (Dokumente, Tickets, Assets, später Verträge und Portal)
// sprechen Nextcloud nur über diesen Service an.
//
// Pfade sind relativ zum Dateibereich des CRM-Benutzers, ohne führenden
// Schrägstrich: "CRM/Customers/CUS-000001 Musterfirma/Offers/Angebot.pdf".
// rootPath("Customers", …) baut Pfade unterhalb von NEXTCLOUD_ROOT_FOLDER.
//
//   Status         isConfigured(), status(), checkConnection()
//   Ordner         ensureFolder(), exists(), list()
//   Dateien        upload(), download(), stat(), move(), copy(), rename(), remove()
//   Versionen      versions(fileId), downloadVersion(fileId, versionId)
//   Freigaben      createShare(), listShares(), removeShare()
//
// Fehler: NextcloudError mit deutscher Meldung und .status
// (z. B. 404 nicht gefunden, 412 Name schon vergeben, 503 nicht eingerichtet).
// Wiederholen, Zeitlimit und Log: services/nextcloud/client.js

const fs = require("fs");

const { getConfig } = require("../config/nextcloud");
const { request, NextcloudError } = require("./nextcloud/client");
const paths = require("./nextcloud/paths");
const webdav = require("./nextcloud/webdav");

// Bekannte Ordner (spart Anfragen); wird bei Fehlern geleert
const knownFolders = new Set();

// ----------------------------------------------------
// Adressen
// ----------------------------------------------------

function config() {

    return getConfig();

}

function isConfigured() {

    return config().configured;

}

// URL-Pfad des Dateibereichs – auch bei Nextcloud in einem Unterordner
// (https://host/nextcloud → /nextcloud/remote.php/dav/files/crm)
function urlParts(cfg) {

    try {
        const url = new URL(cfg.url);
        return { origin: url.origin, prefix: url.pathname.replace(/\/+$/, "") };
    } catch {
        // Nicht eingerichtet: die Anfrage selbst meldet das verständlich
        return { origin: "", prefix: "" };
    }

}

function filesBase(cfg = config()) {

    return `${urlParts(cfg).prefix}/remote.php/dav/files/${encodeURIComponent(cfg.username)}`;

}

function fileUrl(path, cfg = config()) {

    const encoded = paths.encode(path);

    return `${urlParts(cfg).origin}${filesBase(cfg)}${encoded ? "/" + encoded : ""}`;

}

function versionsUrl(fileId, versionId = null, cfg = config()) {

    const base = `${cfg.url}/remote.php/dav/versions/${encodeURIComponent(cfg.username)}/versions/${encodeURIComponent(String(fileId))}`;

    return versionId ? `${base}/${encodeURIComponent(String(versionId))}` : base;

}

function ocsUrl(suffix, cfg = config()) {

    return `${cfg.url}/ocs/v2.php/apps/files_sharing/api/v1/shares${suffix}`;

}

/**
 * Pfad unterhalb des CRM-Hauptordners
 *
 *   rootPath("Customers", "CUS-000001 Musterfirma") → "CRM/Customers/CUS-000001 Musterfirma"
 */
function rootPath(...segments) {

    return paths.join(config().rootFolder, ...segments);

}

/**
 * Link zum Öffnen in der Nextcloud-Oberfläche (Anmeldung in Nextcloud nötig)
 */
function webLink({ fileId = null, path = null, folder = null } = {}) {

    const cfg = config();

    if (!cfg.url) return null;

    if (fileId) return `${cfg.url}/index.php/f/${encodeURIComponent(String(fileId))}`;

    const dir = folder ? paths.join(folder) : path ? paths.parent(path) : null;

    if (dir) return `${cfg.url}/index.php/apps/files/?dir=${encodeURIComponent("/" + dir)}`;

    return `${cfg.url}/index.php/apps/files/`;

}

/**
 * Zustand für Oberflächen (ohne Passwort)
 */
function status() {

    const cfg = config();

    return {
        configured: cfg.configured,
        invalidUrl: cfg.invalidUrl,
        url: cfg.url,
        username: cfg.username,
        rootFolder: cfg.rootFolder
    };

}

// ----------------------------------------------------
// Lesen
// ----------------------------------------------------

async function propfind(path, depth) {

    const result = await request("PROPFIND", fileUrl(path), {
        headers: { Depth: String(depth), "Content-Type": "application/xml; charset=utf-8" },
        body: webdav.PROPFIND_BODY,
        ok: [404],
        label: path || "/"
    });

    if (result.status === 404) return null;

    return webdav.parseMultistatus(result.text, filesBase());

}

/**
 * Eigenschaften einer Datei oder eines Ordners, null wenn nicht vorhanden
 *
 * @returns {Promise<{path, isFolder, size, contentType, etag, lastModified, fileId}|null>}
 */
async function stat(path) {

    const items = await propfind(path, 0);

    return items && items.length ? items[0] : null;

}

async function exists(path) {

    return Boolean(await stat(path));

}

/**
 * Inhalt eines Ordners (ohne den Ordner selbst), null wenn nicht vorhanden
 */
async function list(path) {

    const items = await propfind(path, 1);

    if (!items) return null;

    const self = paths.join(path);

    return items.filter((item) => item.path !== self);

}

/**
 * Verbindung prüfen: Anmeldung und Hauptordner
 *
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function checkConnection() {

    if (!isConfigured()) {
        return { ok: false, message: "Nextcloud ist nicht eingerichtet." };
    }

    try {

        await propfind("", 0);
        await ensureFolder(rootPath());

        return { ok: true, message: `Verbunden mit ${config().url} als ${config().username}, Hauptordner "${config().rootFolder}".` };

    } catch (err) {

        return { ok: false, message: err.message };

    }

}

// ----------------------------------------------------
// Ordner
// ----------------------------------------------------

async function mkcol(path) {

    const result = await request("MKCOL", fileUrl(path), { ok: [405], label: path });

    // 405: gab es schon (z. B. gleichzeitig angelegt)
    return result.status !== 405;

}

/**
 * Ordner samt übergeordneten Ordnern anlegen, falls sie fehlen.
 * Vorhandene Ordner werden nicht verändert.
 *
 * @returns {Promise<string[]>} neu angelegte Ordner
 */
async function ensureFolder(path) {

    const target = paths.join(path);

    if (!target || knownFolders.has(target)) return [];

    const existing = await stat(target);

    if (existing) {

        if (!existing.isFolder) {
            throw new NextcloudError(`Nextcloud: "${target}" ist eine Datei, kein Ordner.`, { status: 409, code: "NOT_A_FOLDER", path: target });
        }

        knownFolders.add(target);

        return [];

    }

    const created = [];

    for (const folder of paths.ancestors(target)) {

        if (knownFolders.has(folder)) continue;

        const item = await stat(folder);

        if (!item) {
            if (await mkcol(folder)) created.push(folder);
        } else if (!item.isFolder) {
            throw new NextcloudError(`Nextcloud: "${folder}" ist eine Datei, kein Ordner.`, { status: 409, code: "NOT_A_FOLDER", path: folder });
        }

        knownFolders.add(folder);

    }

    return created;

}

/**
 * Mehrere Unterordner in einem Ordner sicherstellen – mit einer einzigen
 * Abfrage, welche es schon gibt.
 *
 * @returns {Promise<string[]>} neu angelegte Ordner
 */
async function ensureSubfolders(path, names) {

    const created = await ensureFolder(path);

    const items = (await list(path)) || [];
    const present = new Set(items.filter((i) => i.isFolder).map((i) => paths.basename(i.path)));

    for (const name of names) {

        const folder = paths.join(path, paths.cleanSegment(name));

        if (present.has(paths.basename(folder))) {
            knownFolders.add(folder);
            continue;
        }

        if (await mkcol(folder)) created.push(folder);

        knownFolders.add(folder);

    }

    return created;

}

// ----------------------------------------------------
// Dateien
// ----------------------------------------------------

/**
 * Datei hochladen.
 *
 * @param {string} path  Zielpfad inkl. Dateiname
 * @param {Buffer|string|{filePath: string}} source  Inhalt, Text oder Datei auf der Platte
 * @param {object} [options]
 * @param {string} [options.contentType]
 * @param {boolean} [options.overwrite=true]  false: 412, wenn es die Datei schon gibt
 * @returns {Promise<object>} Eigenschaften der hochgeladenen Datei (stat)
 */
async function upload(path, source, { contentType = "application/octet-stream", overwrite = true } = {}) {

    const target = paths.join(path);

    await ensureFolder(paths.parent(target));

    let body;
    let size;

    if (source && typeof source === "object" && typeof source.filePath === "string") {

        size = (await fs.promises.stat(source.filePath)).size;
        body = () => fs.createReadStream(source.filePath);

    } else {

        const buffer = Buffer.isBuffer(source) ? source : Buffer.from(String(source == null ? "" : source));

        size = buffer.length;
        body = buffer;

    }

    const headers = { "Content-Type": contentType, "Content-Length": String(size) };

    if (!overwrite) headers["If-None-Match"] = "*";

    // Größere Dateien brauchen länger als das normale Zeitlimit
    const timeoutMs = config().timeoutMs + Math.ceil(size / (256 * 1024)) * 1000;

    // Ein bedingtes PUT (nicht überschreiben) wäre beim Wiederholen schon "vorhanden"
    await request("PUT", fileUrl(target), { headers, body, timeoutMs, retry: overwrite, label: target });

    const info = await stat(target);

    if (!info) {
        throw new NextcloudError(`Nextcloud: "${target}" nach dem Hochladen nicht gefunden.`, { status: 500, path: target });
    }

    return info;

}

/**
 * Datei herunterladen
 *
 * @returns {Promise<{stream, contentType, size, etag}>}
 */
async function download(path) {

    const target = paths.join(path);
    const result = await request("GET", fileUrl(target), { stream: true, label: target });
    const length = result.headers.get("content-length");

    return {
        stream: result.body,
        contentType: result.headers.get("content-type") || "application/octet-stream",
        size: length && /^\d+$/.test(length) ? Number(length) : null,
        etag: (result.headers.get("etag") || "").replace(/^"|"$/g, "") || null
    };

}

async function transfer(method, from, to, overwrite) {

    const source = paths.join(from);
    const target = paths.join(to);

    await ensureFolder(paths.parent(target));

    // Nicht wiederholen: war die erste Anfrage doch erfolgreich, käme sonst 404/412
    await request(method, fileUrl(source), {
        headers: { Destination: fileUrl(target), Overwrite: overwrite ? "T" : "F" },
        retry: false,
        label: `${source} → ${target}`
    });

    knownFolders.clear();

    return stat(target);

}

/**
 * Verschieben (auch Umbenennen). Ohne overwrite: 412, wenn das Ziel existiert.
 */
async function move(from, to, { overwrite = false } = {}) {

    return transfer("MOVE", from, to, overwrite);

}

async function copy(from, to, { overwrite = false } = {}) {

    return transfer("COPY", from, to, overwrite);

}

/**
 * Im selben Ordner umbenennen
 */
async function rename(path, newName, options = {}) {

    return move(path, paths.join(paths.parent(path), paths.cleanSegment(newName)), options);

}

/**
 * Löschen (landet im Nextcloud-Papierkorb). Fehlt die Datei schon: false.
 */
async function remove(path) {

    const target = paths.join(path);

    if (!target) throw new NextcloudError("Nextcloud: Der Hauptordner kann nicht gelöscht werden.", { status: 400, path: target });

    const result = await request("DELETE", fileUrl(target), { ok: [404], label: target });

    knownFolders.clear();

    return result.status !== 404;

}

// ----------------------------------------------------
// Versionen (Nextcloud legt sie beim Überschreiben automatisch an)
// ----------------------------------------------------

/**
 * Frühere Versionen einer Datei, neueste zuerst
 *
 * @returns {Promise<Array<{versionId, size, contentType, lastModified}>>}
 */
async function versions(fileId) {

    if (!fileId) return [];

    const cfg = config();
    const result = await request("PROPFIND", versionsUrl(fileId, null, cfg), {
        headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
        body: webdav.PROPFIND_BODY,
        ok: [404],
        label: `Versionen ${fileId}`
    });

    if (result.status === 404) return [];

    const base = new URL(versionsUrl(fileId, null, cfg)).pathname;

    return webdav.parseMultistatus(result.text, base)
        .filter((item) => item.path && !item.isFolder)
        .map((item) => ({
            versionId: item.path,
            size: item.size,
            contentType: item.contentType,
            lastModified: item.lastModified
        }))
        .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

}

async function downloadVersion(fileId, versionId) {

    const result = await request("GET", versionsUrl(fileId, versionId), { stream: true, label: `Version ${fileId}/${versionId}` });

    return {
        stream: result.body,
        contentType: result.headers.get("content-type") || "application/octet-stream"
    };

}

// ----------------------------------------------------
// Freigaben (OCS-API)
// ----------------------------------------------------

const SHARE_TYPES = { user: 0, group: 1, public: 3 };

function ocsHeaders() {

    return { "OCS-APIRequest": "true", Accept: "application/json" };

}

function ocsResult(result) {

    const parsed = webdav.parseOcs(result.json);

    if (!parsed.ok) {
        throw new NextcloudError(`Nextcloud: Freigabe fehlgeschlagen${parsed.message ? ` (${parsed.message})` : ""}.`, { status: parsed.statusCode || result.status, code: "OCS" });
    }

    return parsed.data;

}

function toShare(data) {

    return {
        id: String(data.id),
        type: Object.keys(SHARE_TYPES).find((key) => SHARE_TYPES[key] === Number(data.share_type)) || String(data.share_type),
        shareWith: data.share_with || null,
        url: data.url || null,
        token: data.token || null,
        // Nextcloud liefert nur das Datum ("2026-12-31 00:00:00") – als Tag in UTC
        expiration: data.expiration ? new Date(String(data.expiration).slice(0, 10) + "T00:00:00Z") : null,
        permissions: Number(data.permissions) || 1,
        hasPassword: Boolean(data.password)
    };

}

function formatDate(date) {

    const d = date instanceof Date ? date : new Date(date);

    if (Number.isNaN(d.getTime())) return null;

    return d.toISOString().slice(0, 10);

}

/**
 * Freigabe anlegen
 *
 * @param {string} path
 * @param {object} options
 * @param {"public"|"user"|"group"} [options.type="public"]
 * @param {string} [options.shareWith]   Benutzer/Gruppe (intern)
 * @param {Date|string} [options.expireDate]  zeitlich begrenzt
 * @param {string} [options.password]    für öffentliche Links
 * @param {number} [options.permissions=1]  1 = nur lesen
 */
async function createShare(path, { type = "public", shareWith = null, expireDate = null, password = null, permissions = 1 } = {}) {

    if (!(type in SHARE_TYPES)) {
        throw new NextcloudError("Nextcloud: Unbekannte Freigabeart.", { status: 400, code: "SHARE_TYPE" });
    }

    if (type !== "public" && !shareWith) {
        throw new NextcloudError("Nextcloud: Für interne Freigaben bitte Benutzer oder Gruppe angeben.", { status: 400, code: "SHARE_WITH" });
    }

    const form = new URLSearchParams();

    form.set("path", "/" + paths.join(path));
    form.set("shareType", String(SHARE_TYPES[type]));
    form.set("permissions", String(permissions));

    if (shareWith) form.set("shareWith", shareWith);
    if (password) form.set("password", password);

    if (expireDate) {
        const date = formatDate(expireDate);
        if (date) form.set("expireDate", date);
    }

    const result = await request("POST", ocsUrl("?format=json"), {
        headers: { ...ocsHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        ok: [400, 403, 404],
        retry: false,
        label: `Freigabe ${path}`
    });

    return toShare(ocsResult(result));

}

async function listShares(path) {

    const result = await request("GET", ocsUrl(`?format=json&path=${encodeURIComponent("/" + paths.join(path))}`), {
        headers: ocsHeaders(),
        ok: [404],
        label: `Freigaben ${path}`
    });

    if (result.status === 404) return [];

    const data = ocsResult(result);

    return (Array.isArray(data) ? data : []).map(toShare);

}

async function removeShare(shareId) {

    const result = await request("DELETE", ocsUrl(`/${encodeURIComponent(String(shareId))}?format=json`), {
        headers: ocsHeaders(),
        ok: [404],
        label: `Freigabe ${shareId}`
    });

    return result.status !== 404;

}

/**
 * Nur für Tests: Ordner-Zwischenspeicher leeren
 */
function _resetCache() {

    knownFolders.clear();

}

module.exports = {
    NextcloudError,
    paths,

    isConfigured,
    status,
    rootPath,
    webLink,
    checkConnection,

    stat,
    exists,
    list,
    ensureFolder,
    ensureSubfolders,

    upload,
    download,
    move,
    copy,
    rename,
    remove,

    versions,
    downloadVersion,

    createShare,
    listShares,
    removeShare,

    _resetCache
};
