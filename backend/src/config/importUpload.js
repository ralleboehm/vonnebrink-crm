const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const multer = require("multer");

// ----------------------------------------------------
// Upload-Verzeichnis
// ----------------------------------------------------

const uploadDirectory = path.join(
    process.cwd(),
    "storage",
    "imports"
);

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
}

// ----------------------------------------------------
// Multer Storage
// ----------------------------------------------------

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, uploadDirectory);
    },

    // Zufälliger Name: keine Kollisionen, kein Dateiname vom Benutzer
    filename: (req, file, cb) => {
        cb(null, `import-${crypto.randomUUID()}.csv`);
    }

});

// ----------------------------------------------------
// Nur CSV erlauben
// ----------------------------------------------------

const fileFilter = (req, file, cb) => {

    const extension = path.extname(file.originalname).toLowerCase();

    if (extension === ".csv" || extension === ".txt") {
        return cb(null, true);
    }

    cb(new Error("Nur CSV-Dateien (.csv oder .txt) sind erlaubt."));

};

const MAX_FILE_SIZE_MB = 25;

const upload = multer({

    storage,

    fileFilter,

    limits: {
        fileSize: MAX_FILE_SIZE_MB * 1024 * 1024
    }

});

module.exports = upload;
module.exports.uploadDirectory = uploadDirectory;
module.exports.MAX_FILE_SIZE_MB = MAX_FILE_SIZE_MB;
