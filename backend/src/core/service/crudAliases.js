"use strict";

// ----------------------------------------------------
// Einheitliche CRUD-Namen für Services
// ----------------------------------------------------
//
// Konvention für alle Services (bestehende und neue):
//
//   findAll(filters)   Liste
//   findById(id)       ein Datensatz oder null
//   create(data)       anlegen
//   update(id, data)   ändern
//   delete(id)         löschen (fachlich: Soft Delete über isDeleted,
//                      wo das Model es vorsieht)
//
// Ältere Services heißen noch getAll / getById / softDelete. Damit nichts
// bricht, bekommen sie die neuen Namen zusätzlich als Alias. Neuer Code
// verwendet nur noch die neuen Namen; die alten können später entfallen.

const ALIASES = [
    ["findAll", "getAll"],
    ["findById", "getById"],
    ["delete", "softDelete"]
];

/**
 * Ergänzt fehlende CRUD-Namen. Vorhandene Methoden werden nie überschrieben.
 *
 * @param {object} service  Service-Objekt (exports oder Klasseninstanz)
 * @returns {object} dasselbe Objekt
 */
function applyCrudAliases(service) {

    for (const [name, legacy] of ALIASES) {

        if (typeof service[name] !== "function" && typeof service[legacy] === "function") {
            service[name] = service[legacy];
        }

    }

    return service;

}

module.exports = { applyCrudAliases, ALIASES };
