const fs = require("fs");

// ----------------------------------------------------
// CSV Parser Service
// ----------------------------------------------------

class CsvParserService {

    // ----------------------------------------------------
    // Datei lesen
    // ----------------------------------------------------

    readFile(filePath) {

        return fs.readFileSync(

            filePath,

            "utf8"

        );

    }

    // ----------------------------------------------------
    // Trennzeichen erkennen
    // ----------------------------------------------------

    detectDelimiter(content) {

        const firstLine = content.split(/\r?\n/)[0];

        const delimiters = [

            ";",
            ",",
            "\t"

        ];

        let detected = ";";

        let highestCount = 0;

        for (const delimiter of delimiters) {

            const count = firstLine.split(delimiter).length;

            if (count > highestCount) {

                highestCount = count;
                detected = delimiter;

            }

        }

        return detected;

    }

}

module.exports = new CsvParserService();