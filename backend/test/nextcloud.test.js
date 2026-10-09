"use strict";

// Nextcloud-Service gegen einen Nachbau (test/helpers/fakeNextcloud.js):
// Ordner, Dateien, Versionen, Freigaben, Wiederholen, Zeitlimit, Fehler.
// Braucht kein npm install und keine echte Nextcloud.
//
// Ausführen mit:  node --test test/nextcloud.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { startFakeNextcloud } = require("./helpers/fakeNextcloud");

const ENV_KEYS = ["NEXTCLOUD_URL", "NEXTCLOUD_USERNAME", "NEXTCLOUD_PASSWORD", "NEXTCLOUD_ROOT_FOLDER", "NEXTCLOUD_TIMEOUT", "NEXTCLOUD_RETRIES", "NEXTCLOUD_RETRY_DELAY_MS", "NEXTCLOUD_DEBUG"];

let fake;
let saved;
let nextcloud;

const quiet = { warn: console.warn, error: console.error };

test.before(async () => {

    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

    fake = await startFakeNextcloud({ username: "crm", password: "app-pass" });

    process.env.NEXTCLOUD_URL = fake.url + "/";
    process.env.NEXTCLOUD_USERNAME = "crm";
    process.env.NEXTCLOUD_PASSWORD = "app-pass";
    process.env.NEXTCLOUD_ROOT_FOLDER = "/CRM/";
    process.env.NEXTCLOUD_TIMEOUT = "2000";
    process.env.NEXTCLOUD_RETRIES = "2";
    process.env.NEXTCLOUD_RETRY_DELAY_MS = "1";
    delete process.env.NEXTCLOUD_DEBUG;

    console.warn = () => {};
    console.error = () => {};

    nextcloud = require("../src/services/nextcloud.service");

});

test.after(async () => {

    console.warn = quiet.warn;
    console.error = quiet.error;

    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }

    await fake.close();

});

test.beforeEach(() => {

    fake.reset();
    nextcloud._resetCache();

});

test("Konfiguration: Adresse ohne /, Hauptordner bereinigt, Passwort nicht im Status", () => {

    const { getConfig } = require("../src/config/nextcloud");
    const config = getConfig();

    assert.equal(config.url, fake.url);
    assert.equal(config.rootFolder, "CRM");
    assert.equal(config.configured, true);

    const status = nextcloud.status();
    assert.equal(status.configured, true);
    assert.equal(JSON.stringify(status).includes("app-pass"), false);

    assert.equal(nextcloud.rootPath("Customers", "CUS-1 A"), "CRM/Customers/CUS-1 A");
    assert.throws(() => nextcloud.rootPath("..", "x"), /Ungültiger Pfad/);

});

test("Pfade: Namen bereinigen, Endung erhalten, nummerieren", () => {

    const { paths } = nextcloud;

    assert.equal(paths.cleanSegment('CUS-000001 Müller / Söhne: "IT"'), "CUS-000001 Müller - Söhne- -IT-");
    assert.equal(paths.cleanSegment("  ..geheim.. "), "geheim");
    assert.equal(paths.cleanSegment(""), "_");
    assert.equal(paths.cleanFileName("Angebot 2026.PDF"), "Angebot 2026.pdf");
    assert.equal(paths.cleanFileName("../../etc/passwd"), "-..-etc-passwd");
    assert.equal(paths.cleanFileName(""), "Dokument");
    assert.equal(paths.numbered("Plan.pdf", 2), "Plan (2).pdf");
    assert.equal(paths.numbered("README", 3), "README (3)");
    assert.deepEqual(paths.ancestors("a/b/c"), ["a", "a/b", "a/b/c"]);
    assert.equal(paths.encode("CRM/Kunde A&B/x#1.pdf"), "CRM/Kunde%20A%26B/x%231.pdf");
    assert.equal(paths.cleanFileName("x".repeat(300) + ".docx").length, paths.MAX_SEGMENT);

});

test("Verbindung prüfen legt den Hauptordner an", async () => {

    const result = await nextcloud.checkConnection();

    assert.equal(result.ok, true, result.message);
    assert.ok(fake.isFolder("CRM"));

});

test("Ordner: verschachtelt anlegen, vorhandene nicht erneut", async () => {

    const created = await nextcloud.ensureFolder("CRM/Customers/CUS-000001 Muster & Co");

    assert.deepEqual(created.filter((p) => p.startsWith("CRM/Customers")), ["CRM/Customers", "CRM/Customers/CUS-000001 Muster & Co"]);
    assert.ok(fake.isFolder("CRM/Customers/CUS-000001 Muster & Co"));

    nextcloud._resetCache();
    fake.reset();

    assert.deepEqual(await nextcloud.ensureFolder("CRM/Customers/CUS-000001 Muster & Co"), []);
    assert.equal(fake.requests.filter((r) => r.method === "MKCOL").length, 0, "kein MKCOL für vorhandene Ordner");

    const sub = await nextcloud.ensureSubfolders("CRM/Customers/CUS-000001 Muster & Co", ["Offers", "Invoices"]);
    assert.equal(sub.length, 2);

    fake.reset();
    assert.deepEqual(await nextcloud.ensureSubfolders("CRM/Customers/CUS-000001 Muster & Co", ["Offers", "Invoices", "Photos"]), ["CRM/Customers/CUS-000001 Muster & Co/Photos"]);
    assert.equal(fake.requests.filter((r) => r.method === "MKCOL").length, 1, "nur der fehlende Ordner");

    const items = await nextcloud.list("CRM/Customers/CUS-000001 Muster & Co");
    assert.deepEqual(items.map((i) => i.path).sort(), ["Invoices", "Offers", "Photos"].map((n) => `CRM/Customers/CUS-000001 Muster & Co/${n}`));
    assert.ok(items.every((i) => i.isFolder));

    assert.equal(await nextcloud.list("CRM/gibt-es-nicht"), null);

});

test("Dateien: hochladen, Eigenschaften, herunterladen, Datei von der Platte", async () => {

    const info = await nextcloud.upload("CRM/Test/Angebot (1).pdf", Buffer.from("%PDF-1.4 Inhalt"), { contentType: "application/pdf" });

    assert.equal(info.path, "CRM/Test/Angebot (1).pdf");
    assert.equal(info.isFolder, false);
    assert.equal(info.size, 15);
    assert.equal(info.contentType, "application/pdf");
    assert.ok(info.fileId);
    assert.ok(info.etag);
    assert.ok(info.lastModified instanceof Date);

    const download = await nextcloud.download("CRM/Test/Angebot (1).pdf");
    const chunks = [];
    for await (const chunk of download.stream) chunks.push(chunk);

    assert.equal(Buffer.concat(chunks).toString(), "%PDF-1.4 Inhalt");
    assert.equal(download.contentType, "application/pdf");
    assert.equal(download.size, 15);

    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nc-")), "groß.bin");
    fs.writeFileSync(tmp, Buffer.alloc(200000, 7));

    const big = await nextcloud.upload("CRM/Test/groß.bin", { filePath: tmp });
    assert.equal(big.size, 200000);
    assert.equal(fake.file("CRM/Test/groß.bin").length, 200000);

    assert.equal(await nextcloud.exists("CRM/Test/groß.bin"), true);
    assert.equal(await nextcloud.stat("CRM/Test/fehlt.txt"), null);

    await assert.rejects(nextcloud.download("CRM/Test/fehlt.txt"), (err) => err.status === 404 && /nicht gefunden/.test(err.message));

});

test("Hochladen ohne Überschreiben: 412, mit Überschreiben: neue Version", async () => {

    await nextcloud.upload("CRM/V/Plan.txt", "Version 1");

    await assert.rejects(nextcloud.upload("CRM/V/Plan.txt", "x", { overwrite: false }), (err) => err.status === 412 && /bereits/.test(err.message));

    const second = await nextcloud.upload("CRM/V/Plan.txt", "Version 2");

    assert.equal(fake.file("CRM/V/Plan.txt").toString(), "Version 2");

    const versions = await nextcloud.versions(second.fileId);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].size, 9);

    const old = await nextcloud.downloadVersion(second.fileId, versions[0].versionId);
    const chunks = [];
    for await (const chunk of old.stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), "Version 1");

    assert.deepEqual(await nextcloud.versions("999999"), []);
    assert.deepEqual(await nextcloud.versions(null), []);

});

test("Verschieben, Kopieren, Umbenennen, Löschen", async () => {

    await nextcloud.upload("CRM/M/a.txt", "A");
    await nextcloud.upload("CRM/M/b.txt", "B");

    const moved = await nextcloud.move("CRM/M/a.txt", "CRM/Neu/Unterordner/a.txt");
    assert.equal(moved.path, "CRM/Neu/Unterordner/a.txt");
    assert.equal(fake.file("CRM/M/a.txt"), undefined);
    assert.equal(fake.file("CRM/Neu/Unterordner/a.txt").toString(), "A");

    await assert.rejects(nextcloud.move("CRM/M/b.txt", "CRM/Neu/Unterordner/a.txt"), (err) => err.status === 412);

    const copied = await nextcloud.copy("CRM/M/b.txt", "CRM/Kopie/b.txt");
    assert.equal(copied.path, "CRM/Kopie/b.txt");
    assert.ok(fake.file("CRM/M/b.txt"));

    const renamed = await nextcloud.rename("CRM/Kopie/b.txt", "Bericht: Q3.txt");
    assert.equal(renamed.path, "CRM/Kopie/Bericht- Q3.txt");

    assert.equal(await nextcloud.remove("CRM/Kopie/Bericht- Q3.txt"), true);
    assert.equal(await nextcloud.remove("CRM/Kopie/Bericht- Q3.txt"), false, "schon weg ist kein Fehler");
    await assert.rejects(nextcloud.remove(""), /Hauptordner/);

});

test("Freigaben: öffentlich mit Ablaufdatum, intern, auflisten, entfernen", async () => {

    await nextcloud.upload("CRM/S/Handbuch.pdf", "PDF");

    const link = await nextcloud.createShare("CRM/S/Handbuch.pdf", { expireDate: new Date("2026-12-31T12:00:00Z"), password: "Geheim-123" });

    assert.equal(link.type, "public");
    assert.match(link.url, /\/s\//);
    assert.equal(link.expiration.toISOString().slice(0, 10), "2026-12-31");
    assert.equal(link.hasPassword, true);

    const internal = await nextcloud.createShare("CRM/S/Handbuch.pdf", { type: "user", shareWith: "ralf" });
    assert.equal(internal.type, "user");
    assert.equal(internal.shareWith, "ralf");

    await assert.rejects(nextcloud.createShare("CRM/S/Handbuch.pdf", { type: "user" }), /Benutzer oder Gruppe/);
    await assert.rejects(nextcloud.createShare("CRM/S/fehlt.pdf"), /Freigabe fehlgeschlagen/);

    const list = await nextcloud.listShares("CRM/S/Handbuch.pdf");
    assert.equal(list.length, 2);

    assert.equal(await nextcloud.removeShare(link.id), true);
    assert.equal(await nextcloud.removeShare(link.id), false);
    assert.equal((await nextcloud.listShares("CRM/S/Handbuch.pdf")).length, 1);

    const shareRequest = fake.requests.find((r) => r.method === "POST");
    assert.equal(shareRequest.headers["ocs-apirequest"], "true");

});

test("Wiederholen bei 503 und Verbindungsabbruch, nicht bei 401", async () => {

    fake.failNext(2, 503);
    assert.ok(await nextcloud.ensureFolder("CRM/Retry"), "zweimal 503, dritter Versuch klappt");

    nextcloud._resetCache();
    fake.reset();
    fake.failNext(1, "reset");
    assert.equal(await nextcloud.exists("CRM/Retry"), true, "nach Verbindungsabbruch");

    fake.reset();
    fake.failNext(3, 503);
    await assert.rejects(nextcloud.stat("CRM/Retry"), (err) => err.status === 503 && /Serverfehler/.test(err.message));
    assert.equal(fake.requests.length, 3, "1 + 2 Wiederholungen");

    fake.reset();
    process.env.NEXTCLOUD_PASSWORD = "falsch";

    try {
        await assert.rejects(nextcloud.stat("CRM"), (err) => err.status === 401 && /App-Passwort/.test(err.message));
        assert.equal(fake.requests.length, 1, "401 wird nicht wiederholt");
        assert.equal((await nextcloud.checkConnection()).ok, false);
    } finally {
        process.env.NEXTCLOUD_PASSWORD = "app-pass";
    }

});

test("Zeitüberschreitung", async () => {

    process.env.NEXTCLOUD_TIMEOUT = "1000";
    process.env.NEXTCLOUD_RETRIES = "0";
    fake.setDelay(1500);

    try {
        await assert.rejects(nextcloud.stat("CRM"), (err) => err.code === "TIMEOUT" && /Zeitüberschreitung/.test(err.message));
    } finally {
        fake.setDelay(0);
        process.env.NEXTCLOUD_TIMEOUT = "2000";
        process.env.NEXTCLOUD_RETRIES = "2";
    }

});

test("Nicht eingerichtet: verständlicher Fehler, kein Netzwerk", async () => {

    process.env.NEXTCLOUD_URL = "";

    try {
        assert.equal(nextcloud.isConfigured(), false);
        await assert.rejects(nextcloud.stat("CRM"), (err) => err.code === "NOT_CONFIGURED" && err.status === 503);
        assert.equal((await nextcloud.checkConnection()).ok, false);
        assert.equal(fake.requests.length, 0);
    } finally {
        process.env.NEXTCLOUD_URL = fake.url;
    }

});

test("WebDAV-Antwort mit fremden Präfixen und Sonderzeichen", () => {

    const { parseMultistatus } = require("../src/services/nextcloud/webdav");

    const xml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:"><D:response><D:href>/remote.php/dav/files/crm/CRM/A%20%26%20B/x%C3%A4.pdf</D:href>
<D:propstat><D:prop><D:getcontentlength>42</D:getcontentlength><D:getcontenttype>application/pdf</D:getcontenttype>
<x:fileid xmlns:x="http://owncloud.org/ns">77</x:fileid><D:getetag>&quot;abc&quot;</D:getetag><D:resourcetype/></D:prop>
<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`;

    const [item] = parseMultistatus(xml, "/remote.php/dav/files/crm");

    assert.equal(item.path, "CRM/A & B/xä.pdf");
    assert.equal(item.size, 42);
    assert.equal(item.fileId, "77");
    assert.equal(item.etag, "abc");
    assert.equal(item.isFolder, false);

});
