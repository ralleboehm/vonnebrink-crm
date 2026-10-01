const express = require("express");

const router = express.Router();

router.use(require("./health.routes"));

module.exports = router;
