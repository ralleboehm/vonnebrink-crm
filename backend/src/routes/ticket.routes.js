const express = require("express");

const router = express.Router();

const ticketController = require("../controllers/ticket.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireInternal } = require("../middleware/internal.middleware");

router.get("/", requireAuth, ticketController.index);

router.get("/new", requireAuth, ticketController.create);

router.post("/", requireAuth, ticketController.store);

router.get("/:id", requireAuth, ticketController.show);

router.post(
    "/:id/messages",
    requireAuth,
    ticketController.addMessage
);

router.get("/:id/edit", requireAuth, ticketController.edit);

router.post("/:id/update", requireAuth, ticketController.update);

router.post(
    "/:id/assign",
    requireAuth,
    requireInternal,
    ticketController.assign
);

router.post("/:id/delete", requireAuth, ticketController.destroy);

module.exports = router;