"use strict";

// Regeln für Marketing-Einwilligungen (ohne Datenbank)
//
// Ausführen mit:  node --test test/marketing.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    consentOf,
    staffMayGrant,
    ineligibleReason,
    isEligible
} = require("../src/utils/marketingConsent");

const account = { active: true };

function contact(marketing, extra = {}) {
    return { status: "active", isDeleted: false, marketing, ...extra };
}

test("consentOf: ohne Angaben ist der Status 'none'", () => {

    assert.deepEqual(consentOf({}), { status: "none", source: null, changedAt: null, history: [] });
    assert.equal(consentOf(null).status, "none");
    assert.equal(consentOf(contact({ status: "granted", source: "portal" })).source, "portal");

});

test("erreichbar nur mit aktivem Portalzugang und Einwilligung", () => {

    const granted = contact({ status: "granted", source: "portal" });

    assert.equal(isEligible(granted, account), true);
    assert.equal(ineligibleReason(granted, null), "Kein Portalzugang");
    assert.equal(ineligibleReason(granted, { active: false }), "Portalzugang deaktiviert");
    assert.equal(ineligibleReason(contact({ status: "none" }), account), "Keine Einwilligung");
    assert.equal(ineligibleReason(contact(undefined), account), "Keine Einwilligung");
    assert.equal(ineligibleReason(contact({ status: "revoked", source: "crm" }), account), "Abgemeldet");
    assert.equal(ineligibleReason(contact({ status: "granted" }, { status: "inactive" }), account), "Kontakt inaktiv");
    assert.equal(ineligibleReason(contact({ status: "granted" }, { isDeleted: true }), account), "Kontakt archiviert");
    assert.equal(ineligibleReason(null, account), "Kontakt archiviert");

});

test("Mitarbeiter dürfen eine Portal-Abmeldung nicht überschreiben", () => {

    assert.equal(staffMayGrant(contact({ status: "revoked", source: "portal" })), false);
    assert.equal(staffMayGrant(contact({ status: "revoked", source: "crm" })), true);
    assert.equal(staffMayGrant(contact({ status: "none" })), true);
    assert.equal(staffMayGrant(contact({ status: "granted", source: "portal" })), true);
    assert.equal(staffMayGrant({}), true);

});
