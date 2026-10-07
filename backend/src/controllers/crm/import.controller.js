const companyImportService = require("../../services/import/companyImport.service");

// ----------------------------------------------------
// Import & Export
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        res.render("crm/import/index", {

            title: "Import & Export"

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Firmenimport - Uploadformular
// ----------------------------------------------------

exports.companyImportForm = async (req, res, next) => {

    try {

        res.render("crm/import/companies", {

            title: "Firmen importieren"

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Firmenimport - CSV analysieren
// ----------------------------------------------------

exports.companyImport = async (req, res, next) => {

    try {

        if (!req.file) {

            return res.redirect("/crm/import/companies");

        }

        const result = companyImportService.analyze(

            req.file

        );

        res.render("crm/import/preview", {

            title: "Import Vorschau",

            delimiter: result.delimiter,

            headers: result.headers,

            preview: result.preview,

            totalRows: result.totalRows

        });

    } catch (err) {

        next(err);

    }

};