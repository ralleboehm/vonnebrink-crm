const express = require("express");

const router = express.Router();

router.use("/", require("./dashboard.routes"));

router.use("/", require("./auth.routes"));

router.use("/companies", require("./company.routes"));

router.use("/contacts", require("./contact.routes"));

router.use("/users", require("./user.routes"));

router.use("/tickets", require("./ticket.routes"));

module.exports = router;