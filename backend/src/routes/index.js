const express = require("express");
const router = express.Router();

router.use("/", require("./dashboard.routes"));
router.use("/companies", require("./company.routes"));
router.use("/health", require("./health.routes"));

module.exports = router;