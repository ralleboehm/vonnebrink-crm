"use strict";

// HTML aus dem Kampagnen-Editor bereinigen (ohne Datenbank, ohne Pakete)
//
// Ausführen mit:  node --test test/htmlSanitizer.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitize, toPlainText, inlineImageStats, extractInlineImages } = require("../src/utils/htmlSanitizer");

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("Editor-HTML bleibt erhalten, bekommt Inline-Styles", () => {

    const html = sanitize(
        "<h2>Herbst</h2><p class=\"ql-align-center\">Hallo <strong>fett</strong> <em>kursiv</em> <u>u</u> <s>s</s></p>"
        + "<ul><li>eins</li></ul><ol><li>zwei</li></ol><blockquote>Zitat</blockquote><p><br></p>"
    );

    assert.match(html, /<h2 style="[^"]*font-size:20px[^"]*">Herbst<\/h2>/);
    assert.match(html, /<p style="margin:0; text-align:center;">Hallo <strong>fett<\/strong> <em>kursiv<\/em> <u>u<\/u> <s>s<\/s><\/p>/);
    assert.match(html, /<ul style="[^"]*"><li style="margin:0;">eins<\/li><\/ul>/);
    assert.match(html, /<ol style="[^"]*"><li style="margin:0;">zwei<\/li><\/ol>/);
    assert.match(html, /<blockquote style="[^"]*border-left[^"]*">Zitat<\/blockquote>/);
    assert.match(html, /<p style="margin:0;"><br><\/p>$/);

});

test("Gefährliches fällt weg", () => {

    const html = sanitize(
        "<p onclick=\"x()\">a<script>alert(1)</script>b<style>p{color:red}</style>c</p>"
        + "<iframe src=\"https://evil\"></iframe><img src=\"x\" onerror=\"alert(1)\">"
        + "<a href=\"javascript:alert(1)\">j</a><a href=\" java\tscript:x\">k</a>"
        + "<svg><script>1</script></svg><form><input></form>"
    );

    assert.equal(html, "<p style=\"margin:0;\">abc</p>jk");

    assert.doesNotMatch(sanitize("<scr<script>ipt>alert(1)</script>"), /<script/i);
    assert.doesNotMatch(sanitize("<p style=\"background:url(javascript:x)\">x</p>"), /url\(/);
    assert.doesNotMatch(sanitize("<span style=\"color:expression(alert(1))\">x</span>"), /expression/);

});

test("Links: nur http, https und mailto; Attribute werden maskiert", () => {

    assert.equal(
        sanitize("<a href=\"https://x.de/?a=1&amp;b=&quot;2\" target=\"_blank\">x</a>"),
        "<a href=\"https://x.de/?a=1&amp;b=&quot;2\" style=\"color:#0d6efd;\">x</a>"
    );

    assert.match(sanitize("<a href=\"mailto:info@vonnebrink.com\">Mail</a>"), /href="mailto:info@vonnebrink\.com"/);
    assert.equal(sanitize("<a href=\"/relativ\">r</a>"), "r");

});

test("nackte Adressen werden anklickbar, aber nicht in Links", () => {

    assert.equal(
        sanitize("<p>Siehe https://vonnebrink.com/a?x=1&amp;y=2. Danke</p>"),
        "<p style=\"margin:0;\">Siehe <a href=\"https://vonnebrink.com/a?x=1&amp;y=2\" style=\"color:#0d6efd;\">https://vonnebrink.com/a?x=1&amp;y=2</a>. Danke</p>"
    );

    assert.equal(
        sanitize("<a href=\"https://a.de\">https://a.de</a>"),
        "<a href=\"https://a.de\" style=\"color:#0d6efd;\">https://a.de</a>"
    );

});

test("Bilder: eingebettet oder https, sonst weg", () => {

    const html = sanitize(`<p><img src="data:image/png;base64,${PNG}" alt="Logo" width="300"></p>`);

    assert.match(html, new RegExp(`<img src="data:image/png;base64,${PNG.replace(/[+/=]/g, "\\$&")}" alt="Logo" width="300" style="[^"]*max-width:100%`));

    assert.match(sanitize("<img src=\"https://vonnebrink.com/logo.png\">"), /src="https:\/\/vonnebrink\.com\/logo\.png"/);
    assert.equal(sanitize("<img src=\"http://unsicher.de/x.png\">"), "");
    assert.equal(sanitize("<img src=\"data:image/svg+xml;base64,PHN2Zz4=\">"), "");
    assert.equal(sanitize("<img src=\"data:text/html;base64,PHA+\">"), "");

});

test("Text: Zeichen maskiert, Entitäten gültig, geschützte Leerzeichen normal", () => {

    assert.equal(
        sanitize("<p>1 < 2 & 3 > 0 &auml; &#228; a&nbsp;b</p>"),
        "<p style=\"margin:0;\">1 &lt; 2 &amp; 3 &gt; 0 &auml; &#228; a b</p>"
    );

});

test("Tags werden ersetzt, geschlossen und verschachtelt repariert", () => {

    assert.equal(sanitize("<b>b</b><i>i</i><div>d</div>"), "<strong>b</strong><em>i</em><p style=\"margin:0;\">d</p>");
    assert.match(sanitize("<h5>klein</h5>"), /^<h3 /);
    assert.equal(sanitize("<em><strong>x</em></strong>"), "<em><strong>x</strong></em>");
    assert.equal(sanitize("<p>offen"), "<p style=\"margin:0;\">offen</p>");
    assert.equal(sanitize("</p>zu viel</strong>"), "zu viel");
    assert.equal(sanitize("<!-- Kommentar --><p>x</p>"), "<p style=\"margin:0;\">x</p>");
    assert.equal(sanitize("<p>a</p><p></p><p>b</p>"), "<p style=\"margin:0;\">a</p><p style=\"margin:0;\"><br></p><p style=\"margin:0;\">b</p>", "Leerzeile bleibt");

});

test("Farbe aus dem Editor bleibt, andere Styles nicht", () => {

    assert.equal(
        sanitize("<span style=\"color: rgb(230, 0, 0); position: fixed\">rot</span>"),
        "<span style=\"color:rgb(230, 0, 0);\">rot</span>"
    );

});

test("zweimal bereinigen ändert nichts", () => {

    const once = sanitize(
        `<h1 class="ql-align-right">T</h1><p>Hallo {{anrede}}, https://a.de</p><span style="color:#e60000">r</span>`
        + `<img src="data:image/png;base64,${PNG}"><ol><li>x</li></ol>`
    );

    assert.equal(sanitize(once), once);

});

test("Platzhalter und reiner Text", () => {

    assert.equal(
        toPlainText(sanitize("<p>{{anrede}},</p><p>Hallo&nbsp;<strong>Welt</strong> &amp; Co</p><ul><li>a</li><li>b</li></ul>")),
        "{{anrede}},\nHallo Welt & Co\na\nb"
    );

});

test("eingebettete Bilder werden für den Versand zu Anhängen mit Content-ID", () => {

    const html = sanitize(`<img src="data:image/png;base64,${PNG}"><p>x</p><img src="data:image/png;base64,${PNG}"><img src="data:image/jpeg;base64,/9j/4AA=">`);

    const stats = inlineImageStats(html);

    assert.equal(stats.count, 3);
    assert.equal(stats.largest, Math.floor(PNG.length * 3 / 4));
    assert.equal(stats.bytes, stats.largest * 2 + 6);

    const { html: mail, attachments } = extractInlineImages(html);

    assert.equal((mail.match(/src="cid:bild1@kampagne"/g) || []).length, 2, "gleiches Bild nur einmal anhängen");
    assert.match(mail, /src="cid:bild2@kampagne"/);
    assert.doesNotMatch(mail, /data:image/);

    assert.equal(attachments.length, 2);
    assert.equal(attachments[0].contentType, "image/png");
    assert.equal(attachments[0].filename, "bild1.png");
    assert.equal(attachments[1].contentType, "image/jpeg");
    assert.equal(attachments[1].filename, "bild2.jpg");
    assert.ok(Buffer.isBuffer(attachments[0].content));
    assert.equal(attachments[0].content.subarray(1, 4).toString(), "PNG");

});

test("kaputtes HTML bremst nicht (lineare Laufzeit)", () => {

    for (const piece of ["<a ", "<!x", "<p class=\"", "<", "<!--"]) {

        const started = Date.now();

        sanitize(piece.repeat(200000));

        assert.ok(Date.now() - started < 2000, `${JSON.stringify(piece)}: ${Date.now() - started} ms`);

    }

    const started = Date.now();
    sanitize(`<p>x</p><img src="data:image/png;base64,${"A".repeat(5 * 1024 * 1024)}">`);
    assert.ok(Date.now() - started < 2000, "großes Bild");

});
