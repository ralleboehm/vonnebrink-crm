const fs = require("fs");

const csvParserService = require("./csvParser.service");

class CompanyImportService {

    /**
     * CSV-Datei analysieren
     */
    analyze(file) {

        if (!file) {

            throw new Error("Es wurde keine Datei hochgeladen.");

        }

        const result = csvParserService.parse(file.path);

        if (fs.existsSync(file.path)) {

            fs.unlinkSync(file.path);

        }

        return {

            delimiter: result.delimiter,

            headers: result.headers,

            totalRows: result.rows.length,

            preview: result.rows.slice(0, 10)

        };

    }

}

module.exports = new CompanyImportService();