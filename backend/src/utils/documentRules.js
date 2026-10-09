"use strict";

// ----------------------------------------------------
// Dokumente: Kategorien, Bezüge, Ordner, Rechte (ohne Datenbank)
// ----------------------------------------------------
//
// Ablage in Nextcloud (unterhalb von NEXTCLOUD_ROOT_FOLDER):
//
//   Customers/
//     CUS-000001 Musterfirma/
//       Contracts/ Offers/ Invoices/ Manuals/ Licenses/ Reports/
//       Photos/ Projects/ Downloads/ Other/
//
// Ticket-Anhänge und Asset-Dateien bleiben bewusst lokal (storage/).
//
// Die Kategorie eines Dokuments bestimmt den Unterordner. Neue Kategorien
// lassen sich mit registerCategory() ergänzen (z. B. aus einem Modul).

const { cleanSegment } = require("../services/nextcloud/paths");

const CUSTOMERS_FOLDER = "Customers";

// Unterordner jedes Kunden – Reihenfolge = Anzeige
const CUSTOMER_FOLDERS = [
    "Contracts",
    "Offers",
    "Invoices",
    "Manuals",
    "Licenses",
    "Reports",
    "Photos",
    "Projects",
    "Downloads",
    "Other"
];

// key → { label, folder, icon }
const CATEGORIES = {
    contract: { label: "Vertrag", folder: "Contracts", icon: "bi-file-earmark-text" },
    offer: { label: "Angebot", folder: "Offers", icon: "bi-file-earmark-ruled" },
    invoice: { label: "Rechnung", folder: "Invoices", icon: "bi-receipt" },
    license: { label: "Lizenz", folder: "Licenses", icon: "bi-key" },
    manual: { label: "Handbuch", folder: "Manuals", icon: "bi-book" },
    report: { label: "Bericht", folder: "Reports", icon: "bi-clipboard-data" },
    project: { label: "Projektunterlage", folder: "Projects", icon: "bi-kanban" },
    download: { label: "Download für Kunden", folder: "Downloads", icon: "bi-cloud-download" },
    screenshot: { label: "Screenshot", folder: "Photos", icon: "bi-display" },
    photo: { label: "Foto", folder: "Photos", icon: "bi-camera" },
    backup: { label: "Backup", folder: "Other", icon: "bi-archive" },
    configuration: { label: "Konfiguration", folder: "Other", icon: "bi-gear" },
    other: { label: "Sonstiges", folder: "Other", icon: "bi-file-earmark" }
};

// Worauf sich ein Dokument bezieht. Vertrag/Angebot/Rechnung sind für
// kommende Module vorbereitet.
const REFERENCE_TYPES = {
    company: { label: "Firma" },
    contact: { label: "Kontakt" },
    ticket: { label: "Ticket" },
    asset: { label: "Asset" },
    contract: { label: "Vertrag" },
    offer: { label: "Angebot" },
    invoice: { label: "Rechnung" }
};

// Kategorien, die Kunden später im Portal sehen können – aber nur Dokumente,
// die im CRM ausdrücklich freigegeben sind (Document.portalVisible)
const PORTAL_CATEGORIES = ["contract", "offer", "invoice", "manual", "download", "project"];

function isPortalCategory(category) {

    return PORTAL_CATEGORIES.includes(category);

}

// Welche Kategorien eine Rolle sehen und hochladen darf (fehlt = alle).
// Admin und Techniker: alle. Vertrieb: Verträge und Angebote.
const ROLE_CATEGORIES = {
    sales: ["contract", "offer"],
    accounting: ["contract", "offer", "invoice"]
};

const TAG_MAX = 10;
const TAG_LENGTH = 30;

/**
 * Neue Kategorie ergänzen (z. B. aus einem späteren Modul)
 */
function registerCategory(key, { label, folder = "Other", icon = "bi-file-earmark" }) {

    if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) throw new Error(`Ungültiger Kategorie-Schlüssel "${key}".`);
    if (CATEGORIES[key]) throw new Error(`Kategorie "${key}" gibt es bereits.`);
    if (!label) throw new Error(`Kategorie "${key}" braucht eine Bezeichnung.`);

    CATEGORIES[key] = { label, folder: cleanSegment(folder), icon };

    if (!CUSTOMER_FOLDERS.includes(CATEGORIES[key].folder)) CUSTOMER_FOLDERS.push(CATEGORIES[key].folder);

    return CATEGORIES[key];

}

function isCategory(key) {

    return Object.prototype.hasOwnProperty.call(CATEGORIES, key);

}

function isReferenceType(type) {

    return Object.prototype.hasOwnProperty.call(REFERENCE_TYPES, type);

}

/**
 * Ordnername eines Kunden: "CUS-000001 Musterfirma"
 */
function customerFolderName(company) {

    const number = company && company.customerNumber ? company.customerNumber : "";
    const name = company && company.companyName ? company.companyName : "";

    return cleanSegment(`${number} ${name}`, "Ohne Namen");

}

/**
 * Kategorien, die der Benutzer sehen/hochladen darf
 *
 * @returns {string[]} Schlüssel in Anzeige-Reihenfolge
 */
function allowedCategories(user) {

    const role = user && typeof user === "object" ? user.role : user;
    const all = Object.keys(CATEGORIES);

    if (role === "admin") return all;

    const limited = ROLE_CATEGORIES[role];

    return limited ? all.filter((key) => limited.includes(key)) : all;

}

function mayUseCategory(user, category) {

    return allowedCategories(user).includes(category);

}

/**
 * Schlagworte aus "VPN, Firewall; vpn" → ["VPN", "Firewall"]
 */
function parseTags(input) {

    const list = Array.isArray(input) ? input : String(input || "").split(/[,;]/);
    const seen = new Set();
    const tags = [];

    for (const raw of list) {

        const tag = String(raw || "").replace(/\s+/g, " ").trim().slice(0, TAG_LENGTH);
        const key = tag.toLowerCase();

        if (!tag || seen.has(key)) continue;

        seen.add(key);
        tags.push(tag);

        if (tags.length >= TAG_MAX) break;

    }

    return tags;

}

// Dateien, die der Browser sicher selbst anzeigen kann (Vorschau).
// Kein SVG/HTML: könnten Skripte enthalten.
const INLINE_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "text/plain"
]);

function isPreviewable(mimeType) {

    return INLINE_TYPES.has(String(mimeType || "").split(";")[0].trim().toLowerCase());

}

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);

function isOfficeFile(extension) {

    return OFFICE_EXTENSIONS.has(String(extension || "").toLowerCase());

}

const ICONS = {
    pdf: "bi-file-earmark-pdf",
    doc: "bi-file-earmark-word", docx: "bi-file-earmark-word", odt: "bi-file-earmark-word",
    xls: "bi-file-earmark-excel", xlsx: "bi-file-earmark-excel", ods: "bi-file-earmark-excel", csv: "bi-file-earmark-spreadsheet",
    ppt: "bi-file-earmark-ppt", pptx: "bi-file-earmark-ppt", odp: "bi-file-earmark-ppt",
    png: "bi-file-earmark-image", jpg: "bi-file-earmark-image", jpeg: "bi-file-earmark-image", gif: "bi-file-earmark-image", webp: "bi-file-earmark-image",
    zip: "bi-file-earmark-zip", "7z": "bi-file-earmark-zip", rar: "bi-file-earmark-zip",
    txt: "bi-file-earmark-text", log: "bi-file-earmark-text", conf: "bi-file-earmark-code", cfg: "bi-file-earmark-code", xml: "bi-file-earmark-code", json: "bi-file-earmark-code"
};

function fileIcon(extension) {

    return ICONS[String(extension || "").toLowerCase()] || "bi-file-earmark";

}

/**
 * 1536 → "1,5 KB"
 */
function formatSize(bytes) {

    if (bytes === null || bytes === undefined || bytes === "") return "—";

    const value = Number(bytes);

    if (!Number.isFinite(value) || value < 0) return "—";
    if (value < 1024) return `${value} B`;

    const units = ["KB", "MB", "GB", "TB"];
    let size = value / 1024;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }

    return `${size.toLocaleString("de-DE", { maximumFractionDigits: size < 10 ? 1 : 0 })} ${units[unit]}`;

}

/**
 * Content-Disposition mit Umlauten (RFC 6266/5987)
 */
function contentDisposition(fileName, inline = false) {

    const name = String(fileName || "Dokument").replace(/[\r\n"]/g, "");
    const ascii = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[\\%]/g, "_") || "Dokument";

    return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;

}

module.exports = {
    CUSTOMERS_FOLDER,
    CUSTOMER_FOLDERS,
    CATEGORIES,
    REFERENCE_TYPES,
    ROLE_CATEGORIES,
    PORTAL_CATEGORIES,
    isPortalCategory,
    registerCategory,
    isCategory,
    isReferenceType,
    customerFolderName,
    allowedCategories,
    mayUseCategory,
    parseTags,
    isPreviewable,
    isOfficeFile,
    fileIcon,
    formatSize,
    contentDisposition
};
