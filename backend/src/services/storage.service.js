const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

    async storeFile({

        ticketId,
        tempFile,
        originalName

    }) {

        const ticketDirectory = this.getTicketDirectory(ticketId);

        const extension = path.extname(originalName);

        const filename =
            crypto.randomUUID() + extension.toLowerCase();

        const destination = path.join(
            ticketDirectory,
            filename
        );

        await fs.promises.rename(
            tempFile,
            destination
        );

        return {

            filename,

            relativePath: path.join(
                "tickets",
                ticketId,
                filename
            )

        };

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