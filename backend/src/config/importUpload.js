const fs = require("fs");
const path = require("path");

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

    fs.mkdirSync(uploadDirectory, {

        recursive: true

    });

}

// ----------------------------------------------------
// Multer Storage
// ----------------------------------------------------

const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        cb(null, uploadDirectory);

    },

    filename: (req, file, cb) => {

        const timestamp = Date.now();

        const extension = path.extname(file.originalname);

        cb(

            null,

            `import-${timestamp}${extension}`

        );

    }

});

// ----------------------------------------------------
// Nur CSV erlauben
// ----------------------------------------------------

const fileFilter = (req, file, cb) => {

    const extension = path.extname(

        file.originalname

    ).toLowerCase();

    if (

        extension === ".csv" ||

        extension === ".txt"

    ) {

        return cb(null, true);

    }

    cb(

        new Error(

            "Nur CSV-Dateien sind erlaubt."

        )

    );

};

// ----------------------------------------------------
// Export
// ----------------------------------------------------

module.exports = multer({

    storage,

    fileFilter,

    limits: {

        fileSize: 25 * 1024 * 1024

    }

});