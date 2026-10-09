"use strict";

// ----------------------------------------------------
// Flash-Meldungen (einmalige Hinweise nach einer Weiterleitung)
// ----------------------------------------------------
//
//   setFlash(req, "success", "Gespeichert.");
//   res.redirect("/crm/…");
//
//   // in der nächsten Anfrage:
//   const flash = takeFlash(req);   // { type, text } oder null
//
// type: Bootstrap-Farbe (success, info, warning, danger)

const TYPES = ["success", "info", "warning", "danger"];

function setFlash(req, type, text) {

    if (!req.session) return;

    req.session.flash = {
        type: TYPES.includes(type) ? type : "info",
        text: String(text)
    };

}

function takeFlash(req) {

    if (!req.session || !req.session.flash) return null;

    const flash = req.session.flash;

    delete req.session.flash;

    return flash;

}

module.exports = {
    setFlash,
    takeFlash
};
