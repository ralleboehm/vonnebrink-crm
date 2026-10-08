"use strict";

// ----------------------------------------------------
// Action1-Endpoint -> Asset-Felder
// ----------------------------------------------------
//
// Action1 liefert mit fields=* u. a.: id, name, OS, platform, address,
// external_address, status, last_seen, user, comment, agent_version,
// serial, manufacturer, MAC, CPU_name, CPU_size, RAM, disk,
// last_boot_time, missing_critical_updates, missing_other_updates.
//
// Nicht jede Action1-Version liefert alle Felder, und die Schreibweise
// kann abweichen. Deshalb wird jedes Feld über mehrere mögliche Namen
// gesucht, und fehlende Werte bleiben einfach leer.

// Platzhalter, die Hersteller statt einer echten Seriennummer eintragen
const SERIAL_PLACEHOLDERS = new Set([
    "0",
    "none",
    "n/a",
    "na",
    "default string",
    "to be filled by o.e.m.",
    "to be filled by oem",
    "system serial number",
    "chassis serial number",
    "not specified",
    "not applicable",
    "invalid",
    "unknown",
    "0123456789",
    "123456789"
]);

function pick(source, keys) {

    if (!source || typeof source !== "object") return undefined;

    for (const key of keys) {

        if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
            return source[key];
        }

    }

    // Groß-/Kleinschreibung ignorieren ("os" statt "OS")
    const lowerMap = new Map(Object.keys(source).map((k) => [k.toLowerCase(), k]));

    for (const key of keys) {

        const real = lowerMap.get(key.toLowerCase());

        if (real && source[real] !== undefined && source[real] !== null && source[real] !== "") {
            return source[real];
        }

    }

    return undefined;

}

/**
 * Text bereinigen; Arrays/Objekte werden zu einer lesbaren Liste
 */
function text(value, max = 255) {

    if (value === undefined || value === null) return null;

    let result;

    if (Array.isArray(value)) {
        result = value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
    } else if (typeof value === "object") {
        result = JSON.stringify(value);
    } else {
        result = String(value);
    }

    result = result.replace(/\s+/g, " ").trim();

    if (!result) return null;

    return result.length > max ? result.slice(0, max) : result;

}

function cleanSerial(value) {

    const serial = text(value, 100);

    if (!serial) return null;

    if (SERIAL_PLACEHOLDERS.has(serial.toLowerCase())) return null;

    if (/^0+$/.test(serial)) return null;

    return serial;

}

/**
 * Datum aus Action1 lesen. Unterstützt ISO-Zeitstempel, Unix-Sekunden/-ms
 * und das Action1-Format "2024-05-08_14-25-31" (UTC).
 */
function parseDate(value) {

    if (value === undefined || value === null || value === "") return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number" || /^\d{9,13}$/.test(String(value))) {

        const n = Number(value);
        const date = new Date(n < 1e12 ? n * 1000 : n);

        return Number.isNaN(date.getTime()) ? null : date;

    }

    const raw = String(value).trim();

    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[_ T](\d{2})[-:](\d{2})(?:[-:](\d{2}))?$/);

    if (match) {

        const [, y, mo, d, h, mi, s] = match;
        const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)));

        return Number.isNaN(date.getTime()) ? null : date;

    }

    const date = new Date(raw);

    return Number.isNaN(date.getTime()) ? null : date;

}

function parseCount(value) {

    if (value === undefined || value === null || value === "") return null;

    if (typeof value === "number") return Number.isFinite(value) ? value : null;

    if (Array.isArray(value)) return value.length;

    const n = parseInt(String(value), 10);

    return Number.isFinite(n) ? n : null;

}

function parseBool(value) {

    if (value === undefined || value === null || value === "") return null;

    if (typeof value === "boolean") return value;

    const v = String(value).trim().toLowerCase();

    if (["yes", "true", "1", "required", "ja"].includes(v)) return true;
    if (["no", "false", "0", "not required", "nein"].includes(v)) return false;

    return null;

}

/**
 * "Connected" -> true, "Disconnected" -> false, sonst null
 */
function parseOnline(status) {

    if (status === undefined || status === null) return null;

    const v = String(status).trim().toLowerCase();

    if (["connected", "online"].includes(v)) return true;
    if (["disconnected", "offline"].includes(v)) return false;

    return null;

}

/**
 * Gerätetyp schätzen (nur beim ersten Anlegen; danach pflegen Sie den Typ im CRM)
 */
function guessType({ operatingSystem, manufacturer, model, platform }) {

    const os = `${operatingSystem || ""} ${platform || ""}`.toLowerCase();
    const hw = `${manufacturer || ""} ${model || ""}`.toLowerCase();

    if (/server/.test(os)) return "server";

    if (/vmware|virtualbox|innotek|qemu|kvm|xen|parallels|virtual machine|hyper-v/.test(hw)) {
        return "virtual_machine";
    }

    if (/android|ios|ipad|iphone/.test(os)) return "mobile";

    if (/notebook|laptop|book|thinkpad|latitude|elitebook|probook|zenbook|vivobook|surface laptop|surface pro|travelmate|inspiron 1[45]|xps 1[3-7]/.test(hw)) {
        return "laptop";
    }

    return "workstation";

}

/**
 * Technische Felder, die bei jedem Sync aus Action1 übernommen werden
 */
function mapEndpoint(endpoint, organizationId, syncedAt = new Date()) {

    const status = text(pick(endpoint, ["status", "online_status"]), 50);

    const fields = {

        name: text(pick(endpoint, ["name", "device_name", "hostname"]), 255),

        manufacturer: text(pick(endpoint, ["manufacturer", "vendor"]), 100),
        model: text(pick(endpoint, ["model", "product", "product_name", "computer_model"]), 100),
        serialNumber: cleanSerial(pick(endpoint, ["serial", "serial_number", "serialNumber"])),

        cpu: text([pick(endpoint, ["CPU_name", "cpu_name", "CPU"]), pick(endpoint, ["CPU_size", "cpu_size"])].filter(Boolean).join(" · "), 255),
        ram: text(pick(endpoint, ["RAM", "ram", "memory"]), 100),
        disk: text(pick(endpoint, ["disk", "disks", "storage"]), 255),

        operatingSystem: text(pick(endpoint, ["OS", "os", "operating_system"]), 255),
        ipAddress: text(pick(endpoint, ["address", "ip_address", "ip", "internal_address"]), 255),
        externalIp: text(pick(endpoint, ["external_address", "external_ip"]), 100),
        macAddress: text(pick(endpoint, ["MAC", "mac", "mac_address"]), 255),
        lastUser: text(pick(endpoint, ["user", "last_user", "logged_user"]), 255),

        action1: {
            endpointId: text(endpoint && endpoint.id, 100),
            organizationId: text(organizationId, 100),
            status,
            online: parseOnline(status),
            lastSeen: parseDate(pick(endpoint, ["last_seen", "lastSeen"])),
            lastBootTime: parseDate(pick(endpoint, ["last_boot_time", "last_boot"])),
            agentVersion: text(pick(endpoint, ["agent_version", "agentVersion"]), 50),
            platform: text(pick(endpoint, ["platform"]), 100),
            missingCriticalUpdates: parseCount(pick(endpoint, ["missing_critical_updates"])),
            missingOtherUpdates: parseCount(pick(endpoint, ["missing_other_updates"])),
            rebootRequired: parseBool(pick(endpoint, ["reboot_required", "pending_reboot", "reboot_pending"])),
            comment: text(pick(endpoint, ["comment"]), 1000),
            missing: false,
            lastSyncedAt: syncedAt
        }

    };

    if (!fields.name) {
        fields.name = fields.action1.endpointId || "Unbenanntes Gerät";
    }

    return fields;

}

module.exports = {
    pick,
    text,
    cleanSerial,
    parseDate,
    parseCount,
    parseBool,
    parseOnline,
    guessType,
    mapEndpoint
};
