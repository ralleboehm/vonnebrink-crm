const fs = require("fs");
const path = require("path");

class StorageService {

    constructor() {

        this.basePath = path.join(process.cwd(), "storage");

        this.ensureDirectory(this.basePath);
        this.ensureDirectory(path.join(this.basePath, "temp"));
        this.ensureDirectory(path.join(this.basePath, "tickets"));

    }

    ensureDirectory(directory) {

        if (!fs.existsSync(directory)) {

            fs.mkdirSync(directory, {
                recursive: true
            });

        }

    }

    getTicketDirectory(ticketNumber) {

        const directory = path.join(
            this.basePath,
            "tickets",
            ticketNumber
        );

        this.ensureDirectory(directory);

        return directory;

    }

    deleteFile(relativePath) {

        const filePath = path.join(
            this.basePath,
            relativePath
        );

        if (fs.existsSync(filePath)) {

            fs.unlinkSync(filePath);

        }

    }

}

module.exports = new StorageService();