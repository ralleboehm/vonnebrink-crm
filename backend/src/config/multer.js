const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const storage = multer.diskStorage({

    destination(req, file, cb) {

        cb(null, path.join(process.cwd(), "storage", "temp"));

    },

    filename(req, file, cb) {

        const extension = path.extname(file.originalname);

        const filename =
            crypto.randomUUID() + extension.toLowerCase();

        cb(null, filename);

    }

});

const upload = multer({

    storage,

    // Dateinamen mit Umlauten richtig lesen (Standard wäre latin1)
    defParamCharset: "utf8",

limits: {

    fileSize:
        (parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 100)
        * 1024
        * 1024

}
});

module.exports = upload;