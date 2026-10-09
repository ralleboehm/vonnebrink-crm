"use strict";

// Regeln für Marketing-Einwilligungen (ohne Datenbank)
//
// Ausführen mit:  node --test test/marketing.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    SOURCES,
    SOURCE_LABELS,
    consentOf,
    staffMayGrant,
    ineligibleReason,
    isEligible,
    staffGrantProblem
} = require("../src/utils/marketingConsent");

const activeCompany = { status: "active" };

function contact(marketing, extra = {}) {
    return { status: "active", isDeleted: false, email: "kunde@firma.example", marketing, ...extra };
}

test("jede Quelle hat eine Beschriftung", () => {

    for (const source of SOURCES) {
        assert.ok(SOURCE_LABELS[source], source);
    }

});

test("consentOf: ohne Angaben ist der Status 'none'", () => {

    assert.deepEqual(consentOf({}), { status: "none", source: null, changedAt: null, history: [] });
    assert.equal(consentOf(null).status, "none");
    assert.equal(consentOf(contact({ status: "granted", source: "portal" })).source, "portal");

});

test("erreichbar mit Einwilligung – Portalzugang ist nicht mehr nötig", () => {

    for (const source of ["portal", "double_opt_in", "crm", "customer"]) {
        assert.equal(isEligible(contact({ status: "granted", source }), activeCompany), true, source);
    }

    assert.equal(ineligibleReason(contact({ status: "none" })), "Keine Einwilligung");
    assert.equal(ineligibleReason(contact(undefined)), "Keine Einwilligung");
    assert.equal(ineligibleReason(contact({ status: "revoked", source: "link" })), "Abgemeldet");
    assert.equal(ineligibleReason(contact({ status: "granted" }, { status: "inactive" })), "Kontakt inaktiv");
    assert.equal(ineligibleReason(contact({ status: "granted" }, { isDeleted: true })), "Kontakt archiviert");
    assert.equal(ineligibleReason(contact({ status: "granted" }, { email: "" })), "Keine E-Mail-Adresse");
    assert.equal(ineligibleReason(contact({ status: "granted" }, { email: "kaputt" })), "Keine E-Mail-Adresse");
    assert.equal(ineligibleReason(null), "Kontakt archiviert");

});

test("Bestandskunden-Ausnahme gilt nur für aktive Kunden", () => {

    const customer = contact({ status: "granted", source: "customer" });

    assert.equal(isEligible(customer, activeCompany), true);
    assert.match(ineligibleReason(customer, { status: "inactive" }), /Kein aktiver Kunde/);
    assert.match(ineligibleReason(customer, { status: "prospect" }), /Kein aktiver Kunde/);
    assert.match(ineligibleReason(customer, null), /Kein aktiver Kunde/);

    // andere Quellen hängen nicht am Firmenstatus
    assert.equal(isEligible(contact({ status: "granted", source: "double_opt_in" }), { status: "prospect" }), true);

});

test("Mitarbeiter dürfen eine Selbst-Abmeldung nicht überschreiben", () => {

    assert.equal(staffMayGrant(contact({ status: "revoked", source: "portal" })), false);
    assert.equal(staffMayGrant(contact({ status: "revoked", source: "link" })), false);
    assert.equal(staffMayGrant(contact({ status: "revoked", source: "crm" })), true);
    assert.equal(staffMayGrant(contact({ status: "none" })), true);
    assert.equal(staffMayGrant(contact({ status: "granted", source: "portal" })), true);
    assert.equal(staffMayGrant({}), true);

});

test("staffGrantProblem: Nachweis, Bestandskunde, Selbst-Abmeldung", () => {

    const fresh = contact({ status: "none" });

    assert.equal(staffGrantProblem(fresh, activeCompany, "crm", "schriftlich am 1.10."), null);
    assert.match(staffGrantProblem(fresh, activeCompany, "crm", " "), /wie die Einwilligung/);
    assert.equal(staffGrantProblem(fresh, activeCompany, "customer", "Vertrag vom 1.1."), null);
    assert.match(staffGrantProblem(fresh, activeCompany, "customer", ""), /Widerspruchsrecht/);
    assert.match(staffGrantProblem(fresh, { status: "prospect" }, "customer", "Vertrag"), /aktive Kunden/);
    assert.match(staffGrantProblem(fresh, activeCompany, "portal", "x"), /Unbekannte Art/);
    assert.match(staffGrantProblem(contact({ status: "revoked", source: "link" }), activeCompany, "crm", "telefonisch"), /selbst abgemeldet/);

});
