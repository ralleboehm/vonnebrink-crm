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
    validate
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
