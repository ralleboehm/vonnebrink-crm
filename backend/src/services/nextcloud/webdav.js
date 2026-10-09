"use strict";

// ----------------------------------------------------
// WebDAV-Antworten von Nextcloud lesen (ohne XML-Bibliothek)
// ----------------------------------------------------
//
// PROPFIND liefert eine "multistatus"-Antwort. Wir brauchen daraus je
// Eintrag nur wenige Werte. Die Namensraum-Kürzel (d:, D:, oc:, nc:)
// können je nach Server abweichen und werden deshalb ignoriert.

// Eigenschaften, die wir bei PROPFIND anfordern
const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:resourcetype/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:getlastmodified/>
    <d:getetag/>
    <oc:fileid/>
    <oc:size/>
  </d:prop>
</d:propfind>`;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function decodeEntities(text) {

    return String(text)
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name]);

}

function element(xml, name) {

    const match = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "i").exec(xml);

    return match ? decodeEntities(match[1].trim()) : null;

}

function safeDecodeUri(value) {

    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }

}

/**
 * Multistatus-Antwort in Einträge zerlegen
 *
 * @param {string} xml
 * @param {string} basePath  URL-Pfad des Dateibereichs, z. B. "/remote.php/dav/files/crm"
 * @returns {Array<{path, href, isFolder, size, contentType, etag, lastModified, fileId}>}
 */
function parseMultistatus(xml, basePath = "") {

    const items = [];
    const responses = String(xml || "").match(/<(?:[\w-]+:)?response\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?response>/gi) || [];

    const base = safeDecodeUri(basePath).replace(/\/+$/, "");

    for (const block of responses) {

        const href = element(block, "href");

        if (!href) continue;

        // Nur Eigenschaften aus dem erfolgreichen propstat (200) lesen
        const propstats = block.match(/<(?:[\w-]+:)?propstat\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?propstat>/gi) || [block];
        const ok = propstats.find((p) => /HTTP\/[\d.]+\s+200/i.test(element(p, "status") || "")) || propstats[0];

        let path = safeDecodeUri(href.replace(/^https?:\/\/[^/]+/i, ""));

        if (base && path.startsWith(base)) path = path.slice(base.length);

        path = path.replace(/^\/+|\/+$/g, "");

        const isFolder = /<(?:[\w-]+:)?collection\b/i.test(ok);
        const sizeText = element(ok, "getcontentlength") || element(ok, "size");
        const modified = element(ok, "getlastmodified");

        items.push({
            href,
            path,
            isFolder,
            size: sizeText && /^\d+$/.test(sizeText) ? Number(sizeText) : null,
            contentType: element(ok, "getcontenttype") || null,
            etag: (element(ok, "getetag") || "").replace(/^"|"$/g, "") || null,
            lastModified: modified ? new Date(modified) : null,
            fileId: element(ok, "fileid") || null
        });

    }

    return items;

}

/**
 * OCS-Antwort (format=json) auswerten
 *
 * @returns {{ok: boolean, statusCode: number, message: string, data: any}}
 */
function parseOcs(json) {

    const ocs = json && json.ocs ? json.ocs : {};
    const meta = ocs.meta || {};
    const statusCode = Number(meta.statuscode) || 0;

    return {
        ok: meta.status === "ok" || statusCode === 100 || statusCode === 200,
        statusCode,
        message: meta.message || "",
        data: ocs.data
    };

}

module.exports = {
    PROPFIND_BODY,
    decodeEntities,
    parseMultistatus,
    parseOcs
};
