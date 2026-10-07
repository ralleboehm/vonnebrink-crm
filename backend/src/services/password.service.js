const crypto = require("crypto");

// ----------------------------------------------------
// Temporäres Passwort
// ----------------------------------------------------

exports.generateTemporaryPassword = (length = 16) => {

    return crypto
        .randomBytes(32)
        .toString("base64")
        .replace(/[+/=]/g, "")
        .substring(0, length);

};

// ----------------------------------------------------
// Sicheren Token erzeugen
// ----------------------------------------------------

exports.generateToken = (length = 64) => {

    return crypto
        .randomBytes(length)
        .toString("hex");

};

// ----------------------------------------------------
// API Key erzeugen
// ----------------------------------------------------

exports.generateApiKey = () => {

    return crypto.randomUUID();

};