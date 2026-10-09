"use strict";

// ----------------------------------------------------
// Nachbau einer Nextcloud für Tests (nur Node, im Speicher)
// ----------------------------------------------------
//
// Unterstützt, was der nextcloud.service braucht:
//   WebDAV   PROPFIND (Depth 0/1), MKCOL, PUT, GET, DELETE, MOVE, COPY
//   Versionen  PROPFIND/GET unter /remote.php/dav/versions/<user>/versions/<fileId>
//   OCS      Freigaben anlegen, auflisten, löschen
//
// Verhält sich bei Fehlern wie Nextcloud: 401 ohne Anmeldung, 404, 405
// (Ordner existiert), 409 (Elternordner fehlt), 412 (If-None-Match / Overwrite: F).
//
//   const fake = await startFakeNextcloud({ username: "crm", password: "geheim" });
//   process.env.NEXTCLOUD_URL = fake.url;
//   fake.failNext(2, 503);     // die nächsten 2 Anfragen scheitern
//   fake.file("CRM/a.txt")     // Inhalt (Buffer) oder undefined
//   await fake.close();

const http = require("http");

function xmlEscape(text) {

    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

}

function encodePath(path) {

    return path.split("/").map(encodeURIComponent).join("/");

}

async function startFakeNextcloud({ username = "crm", password = "geheim" } = {}) {

    // Pfad → { type: "dir" } | { type: "file", data, contentType, fileId, etag, modified, versions: [] }
    const nodes = new Map([["", { type: "dir", fileId: "1", modified: new Date() }]]);
    const shares = new Map();
    const requests = [];

    let nextId = 100;
    let failures = [];
    let delayMs = 0;

    const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    const filesPrefix = `/remote.php/dav/files/${encodeURIComponent(username)}`;
    const versionsPrefix = `/remote.php/dav/versions/${encodeURIComponent(username)}/versions/`;

    function parentOf(path) {

        const parts = path.split("/");
        parts.pop();

        return parts.join("/");

    }

    function propResponse(href, node, path) {

        const isDir = node.type === "dir";

        return `<d:response><d:href>${xmlEscape(href)}</d:href><d:propstat><d:prop>` +
            `<d:resourcetype>${isDir ? "<d:collection/>" : ""}</d:resourcetype>` +
            (isDir ? "" : `<d:getcontentlength>${node.data.length}</d:getcontentlength><d:getcontenttype>${xmlEscape(node.contentType)}</d:getcontenttype>`) +
            `<d:getlastmodified>${node.modified.toUTCString()}</d:getlastmodified>` +
            `<d:getetag>&quot;${node.etag || node.fileId}&quot;</d:getetag>` +
            `<oc:fileid>${node.fileId}</oc:fileid>` +
            `</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>` +
            // wie Nextcloud: fehlende Eigenschaften im 404-propstat
            (isDir ? `<d:propstat><d:prop><d:getcontentlength/><d:getcontenttype/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>` : "") +
            `</d:response>`;

    }

    function multistatus(parts) {

        return `<?xml version="1.0"?>\n<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${parts.join("")}</d:multistatus>`;

    }

    function findByFileId(fileId) {

        for (const [path, node] of nodes) {
            if (node.fileId === String(fileId)) return { path, node };
        }

        return null;

    }

    function readBody(req) {

        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => resolve(Buffer.concat(chunks)));
            req.on("error", reject);
        });

    }

    function send(res, status, body = "", headers = {}) {

        res.writeHead(status, headers);
        res.end(body);

    }

    function davPath(urlPath) {

        if (urlPath !== filesPrefix && !urlPath.startsWith(filesPrefix + "/")) return null;

        return decodeURIComponent(urlPath.slice(filesPrefix.length)).replace(/^\/+|\/+$/g, "");

    }

    function ocs(res, status, data, ok = true, message = "") {

        send(res, ok ? 200 : status, JSON.stringify({ ocs: { meta: { status: ok ? "ok" : "failure", statuscode: ok ? 200 : status, message }, data } }), { "Content-Type": "application/json; charset=utf-8" });

    }

    function shareJson(share) {

        return {
            id: share.id,
            share_type: share.shareType,
            share_with: share.shareWith,
            path: share.path,
            permissions: share.permissions,
            expiration: share.expireDate ? `${share.expireDate} 00:00:00` : null,
            token: share.token,
            url: share.shareType === 3 ? `${baseUrl}/s/${share.token}` : undefined,
            password: share.password ? "***" : undefined
        };

    }

    function transfer(req, res, path, move) {

        const destination = req.headers.destination;

        if (!destination) return send(res, 400);

        const target = davPath(new URL(destination).pathname);

        if (target === null) return send(res, 502);

        const node = nodes.get(path);

        if (!node) return send(res, 404);

        if (!nodes.has(parentOf(target)) || nodes.get(parentOf(target)).type !== "dir") return send(res, 409);

        const existed = nodes.has(target);

        if (existed && req.headers.overwrite === "F") return send(res, 412);

        const moved = [];

        for (const [key, value] of nodes) {

            if (key === path || key.startsWith(path + "/")) {
                moved.push([target + key.slice(path.length), value]);
            }

        }

        if (move) {
            for (const [key] of nodes) {
                if (key === path || key.startsWith(path + "/")) nodes.delete(key);
            }
        }

        for (const [key, value] of moved) {
            nodes.set(key, move ? value : { ...value, fileId: String(nextId++), versions: [] });
        }

        return send(res, existed ? 204 : 201);

    }

    let baseUrl = "";

    const server = http.createServer(async (req, res) => {

        const url = new URL(req.url, "http://localhost");

        requests.push({ method: req.method, path: decodeURIComponent(url.pathname), headers: req.headers });

        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));

        if (failures.length) {
            const status = failures.shift();
            if (status === "reset") return req.socket.destroy();
            return send(res, status);
        }

        if (req.headers.authorization !== auth) return send(res, 401, "", { "WWW-Authenticate": "Basic realm=\"Nextcloud\"" });

        const body = await readBody(req);

        // ---------------- Freigaben (OCS) ----------------
        if (url.pathname.startsWith("/ocs/v2.php/apps/files_sharing/api/v1/shares")) {

            if (req.headers["ocs-apirequest"] !== "true") return send(res, 412);

            const id = url.pathname.split("/shares/")[1];

            if (req.method === "POST" && !id) {

                const form = new URLSearchParams(body.toString());
                const path = (form.get("path") || "").replace(/^\/+/, "");

                if (!nodes.has(path)) return ocs(res, 404, [], false, "Wrong path, file/folder does not exist");

                const share = {
                    id: String(nextId++),
                    shareType: Number(form.get("shareType")),
                    shareWith: form.get("shareWith"),
                    path: "/" + path,
                    permissions: Number(form.get("permissions") || 1),
                    expireDate: form.get("expireDate"),
                    password: form.get("password"),
                    token: Math.random().toString(36).slice(2, 12)
                };

                shares.set(share.id, share);

                return ocs(res, 200, shareJson(share));

            }

            if (req.method === "GET" && !id) {

                const path = url.searchParams.get("path");

                if (path && !nodes.has(path.replace(/^\/+/, ""))) return ocs(res, 404, [], false, "Wrong path");

                return ocs(res, 200, [...shares.values()].filter((s) => !path || s.path === path).map(shareJson));

            }

            if (req.method === "DELETE" && id) {

                if (!shares.delete(id)) return ocs(res, 404, [], false, "Wrong share ID");

                return ocs(res, 200, []);

            }

            return send(res, 405);

        }

        // ---------------- Versionen ----------------
        if (url.pathname.startsWith(versionsPrefix)) {

            const [fileId, versionId] = url.pathname.slice(versionsPrefix.length).split("/").map(decodeURIComponent);
            const found = findByFileId(fileId);

            if (!found || found.node.type !== "file") return send(res, 404);

            const versions = found.node.versions || [];

            if (req.method === "PROPFIND") {

                const base = `${versionsPrefix}${encodeURIComponent(fileId)}`;
                const parts = [`<d:response><d:href>${base}/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`];

                for (const version of versions) {
                    parts.push(propResponse(`${base}/${version.versionId}`, { type: "file", data: version.data, contentType: version.contentType, fileId, modified: version.modified, etag: version.versionId }));
                }

                return send(res, 207, multistatus(parts), { "Content-Type": "application/xml; charset=utf-8" });

            }

            if (req.method === "GET" && versionId) {

                const version = versions.find((v) => v.versionId === versionId);

                if (!version) return send(res, 404);

                return send(res, 200, version.data, { "Content-Type": version.contentType });

            }

            return send(res, 405);

        }

        // ---------------- Dateien (WebDAV) ----------------
        const path = davPath(url.pathname);

        if (path === null) return send(res, 404);

        const node = nodes.get(path);

        switch (req.method) {

            case "PROPFIND": {

                if (!node) return send(res, 404);

                const depth = req.headers.depth === "1" ? 1 : 0;
                const href = (p, n) => `${filesPrefix}/${encodePath(p)}${n.type === "dir" && p ? "/" : ""}`;
                const parts = [propResponse(path ? href(path, node) : `${filesPrefix}/`, node, path)];

                if (depth === 1 && node.type === "dir") {

                    for (const [key, child] of nodes) {
                        if (key && parentOf(key) === path && key !== path) parts.push(propResponse(href(key, child), child, key));
                    }

                }

                return send(res, 207, multistatus(parts), { "Content-Type": "application/xml; charset=utf-8" });

            }

            case "MKCOL": {

                if (node) return send(res, 405);
                if (!nodes.has(parentOf(path)) || nodes.get(parentOf(path)).type !== "dir") return send(res, 409);

                nodes.set(path, { type: "dir", fileId: String(nextId++), modified: new Date() });

                return send(res, 201);

            }

            case "PUT": {

                if (!nodes.has(parentOf(path)) || nodes.get(parentOf(path)).type !== "dir") return send(res, 409);
                if (node && req.headers["if-none-match"] === "*") return send(res, 412);
                if (node && node.type === "dir") return send(res, 405);

                const contentType = req.headers["content-type"] || "application/octet-stream";

                if (node) {

                    // Überschreiben: alte Fassung als Version behalten (wie Nextcloud)
                    node.versions = node.versions || [];
                    node.versions.push({ versionId: String(Math.floor(node.modified.getTime() / 1000) + node.versions.length), data: node.data, contentType: node.contentType, modified: node.modified });
                    node.data = body;
                    node.contentType = contentType;
                    node.modified = new Date(Date.now() + node.versions.length * 1000);
                    node.etag = `e${nextId++}`;

                    return send(res, 204);

                }

                nodes.set(path, { type: "file", data: body, contentType, fileId: String(nextId++), etag: `e${nextId++}`, modified: new Date(), versions: [] });

                return send(res, 201);

            }

            case "GET": {

                if (!node || node.type !== "file") return send(res, 404);

                return send(res, 200, node.data, { "Content-Type": node.contentType, "Content-Length": String(node.data.length), ETag: `"${node.etag}"` });

            }

            case "DELETE": {

                if (!node || !path) return send(res, 404);

                for (const key of [...nodes.keys()]) {
                    if (key === path || key.startsWith(path + "/")) nodes.delete(key);
                }

                return send(res, 204);

            }

            case "MOVE":
                return transfer(req, res, path, true);

            case "COPY":
                return transfer(req, res, path, false);

            default:
                return send(res, 405);

        }

    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    baseUrl = `http://127.0.0.1:${server.address().port}`;

    return {
        url: baseUrl,
        username,
        password,
        requests,
        nodes,
        shares,
        file: (path) => (nodes.get(path) && nodes.get(path).type === "file" ? nodes.get(path).data : undefined),
        isFolder: (path) => Boolean(nodes.get(path) && nodes.get(path).type === "dir"),
        failNext: (count, status = 503) => {
            failures = failures.concat(Array.from({ length: count }, () => status));
        },
        setDelay: (ms) => {
            delayMs = ms;
        },
        reset: () => {
            requests.length = 0;
            failures = [];
            delayMs = 0;
        },
        close: () => new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
        })
    };

}

module.exports = { startFakeNextcloud };
