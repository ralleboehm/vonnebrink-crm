"use strict";

// Kampagnen-Inhalt: Platzhalter, Text → HTML, Prüfung (ohne Datenbank)
//
// Ausführen mit:  node --test test/campaign.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    PLACEHOLDERS,
    findPlaceholders,
    unknownPlaceholders,
    textToHtml,
    fillPlaceholders,
    letterSalutation,
    valuesFor,
    sampleValues,
    validate,
    formatOf,
    contentHtml,
    contentText,
    LIMITS
} = require("../src/utils/campaignContent");

const valid = {
    name: "Herbstaktion",
    subject: "Neuigkeiten für {{firma}}",
    content: "{{anrede}},\n\nwir haben etwas Neues für Sie."
};

test("gültige Kampagne", () => {

    assert.equal(validate(valid), null);

});

test("Pflichtfelder mit deutscher Meldung", () => {

    assert.match(validate({ ...valid, name: "  " }), /Namen/);
    assert.match(validate({ ...valid, subject: "" }), /Betreff/);
    assert.match(validate({ ...valid, content: "kurz" }), /mindestens 10 Zeichen/);
    assert.match(validate({ ...valid, name: "x".repeat(151) }), /höchstens 150/);

});

test("bekannte Platzhalter brauchen keine eigene Liste", () => {

    // Genau das ist früher mit "is used but not defined in variables list" gescheitert
    const data = {
        name: "Holzhändler",
        subject: "Hallo {{firstName}} {{lastName}} Für eure {{company}} gibt es tolle Herbstangebote",
        content: "{{firstName}} {{lastName}} Jetzt im Herbst sollte {{company}} unbedingt an so etwas denken"
    };

    assert.equal(validate(data), null);

});

test("unbekannte Platzhalter werden gemeldet", () => {

    const message = validate({ ...valid, content: "Hallo {{vornahme}}, {{#if firma}}x{{/if}}" });

    assert.match(message, /\{\{vornahme\}\}/);
    assert.match(message, /\{\{#if firma\}\}/);
    assert.match(message, /Möglich sind \{\{anrede\}\}/);

    assert.deepEqual(unknownPlaceholders("{{ vorname }} {{firma}} {{foo}}"), ["foo"]);
    assert.deepEqual(findPlaceholders("{{a}} {{b}} {{a}}"), ["a", "b"]);

});

test("Briefanrede in der Sie-Form", () => {

    assert.equal(letterSalutation({ salutation: "mr", firstName: "Hans", lastName: "Müller" }), "Sehr geehrter Herr Müller");
    assert.equal(letterSalutation({ salutation: "mrs", firstName: "Eva", lastName: "Kraus" }), "Sehr geehrte Frau Kraus");
    assert.equal(letterSalutation({ salutation: "diverse", firstName: "Alex", lastName: "Berg" }), "Guten Tag Alex Berg");
    assert.equal(letterSalutation({}), "Guten Tag");

});

test("Text wird zu sicherem HTML mit Absätzen und Links", () => {

    const html = textToHtml("Zeile 1\nZeile 2\n\n<b>fett?</b> & mehr: https://vonnebrink.com/angebot.\n\n\n");

    assert.equal((html.match(/<p /g) || []).length, 2);
    assert.match(html, /Zeile 1<br>\nZeile 2/);
    assert.match(html, /&lt;b&gt;fett\?&lt;\/b&gt; &amp; mehr/);
    assert.match(html, /<a href="https:\/\/vonnebrink\.com\/angebot" [^>]*>https:\/\/vonnebrink\.com\/angebot<\/a>\./);
    assert.doesNotMatch(html, /<b>/);

    assert.equal(textToHtml("   "), "");

    // Links neben Anführungszeichen und Klammern
    const quoted = textToHtml("Siehe \"https://x.de\", <https://z.de> und „https://y.de/a?b=1&c=2“.");

    assert.match(quoted, /&quot;<a href="https:\/\/x\.de" [^>]*>https:\/\/x\.de<\/a>&quot;,/);
    assert.match(quoted, /&lt;<a href="https:\/\/z\.de" [^>]*>https:\/\/z\.de<\/a>&gt;/);
    assert.match(quoted, /„<a href="https:\/\/y\.de\/a\?b=1&amp;c=2" [^>]*>[^<]+<\/a>“\./);

});

test("Platzhalter ersetzen, Werte im HTML maskiert", () => {

    const values = valuesFor(
        { salutation: "mr", firstName: "Hans", lastName: "Müller", email: "hans@holz.example", position: "Chef" },
        { companyName: "Holz & <Söhne>" }
    );

    assert.equal(fillPlaceholders("{{anrede}}, {{ firma }}", values), "Sehr geehrter Herr Müller, Holz & <Söhne>");
    assert.equal(fillPlaceholders("{{company}} {{firstName}}", values, { html: true }), "Holz &amp; &lt;Söhne&gt; Hans");
    assert.equal(fillPlaceholders("{{unbekannt}}x", values), "x");

});

test("Beispielwerte für jeden Platzhalter", () => {

    const sample = sampleValues();

    for (const placeholder of PLACEHOLDERS) {
        assert.ok(sample[placeholder.key], placeholder.key);
    }

});

// ----------------------------------------------------
// HTML aus dem Editor
// ----------------------------------------------------

const html = (content) => ({ name: "Herbst", subject: "Hallo {{vorname}}", format: "html", content });

test("Format: html aus dem Editor, ältere Kampagnen ohne Angabe sind Text", () => {

    assert.equal(formatOf({ format: "html" }), "html");
    assert.equal(formatOf({}), "text");
    assert.equal(formatOf({ format: "quatsch" }), "text");

    assert.match(contentHtml({ content: "Zeile\n\nAbsatz" }), /<p style="margin:0 0 14px;">Absatz<\/p>/);
    assert.match(contentHtml({ format: "html", content: "<p onclick=\"x\">Hallo</p><script>1</script>" }), /^<p style="margin:0;">Hallo<\/p>$/);

    assert.equal(contentText({ format: "html", content: "<p>{{anrede}},</p><p>Hallo&nbsp;Welt</p>" }), "{{anrede}},\nHallo Welt");

});

test("HTML: Länge zählt nur den Text, nicht das Markup", () => {

    assert.match(validate(html("<p><strong><em>kurz</em></strong></p>")), /mindestens 10 Zeichen/);
    assert.equal(validate(html("<p>{{anrede}},</p><p>ein ganz normaler Text.</p>")), null);

});

test("HTML: unbekannte und teilweise formatierte Platzhalter", () => {

    assert.match(validate(html("<p>Hallo {{vornahme}}, wie geht es?</p>")), /Unbekannter Platzhalter: \{\{vornahme\}\}/);

    const split = validate(html("<p>Hallo {{an<strong>rede</strong>}}, wie geht es Ihnen?</p>"));
    assert.match(split, /teilweise formatiert: \{\{anrede\}\}/);

    // ganz fett ist in Ordnung
    assert.equal(validate(html("<p><strong>{{anrede}}</strong>, wie geht es Ihnen?</p>")), null);

});

test("HTML: Grenzen für eingebettete Bilder", () => {

    const image = (bytes) => `<img src="data:image/png;base64,${"A".repeat(Math.ceil(bytes / 3) * 4)}">`;
    const text = "<p>Ein Text mit genug Zeichen.</p>";

    assert.equal(validate(html(text + image(100 * 1024))), null);
    assert.match(validate(html(text + image(LIMITS.imageBytes + 10))), /Ein Bild ist zu groß/);
    assert.match(validate(html(text + image(1.4 * 1024 * 1024).repeat(3))), /zusammen zu groß/);
    assert.match(validate(html(text + image(100).repeat(LIMITS.images + 1))), /Höchstens 20 Bilder/);

});
