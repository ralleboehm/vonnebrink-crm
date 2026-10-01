const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const routes = require("./routes");
const notFound = require("./middleware/notFound");
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Health Check
app.use("/api/v1", routes);

//NOT Found

app.use(notFound);



module.exports = app;
