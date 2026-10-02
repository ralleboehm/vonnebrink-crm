const express = require("express");
const path = require("path");

const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const routes = require("./routes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Middleware
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                upgradeInsecureRequests: null,
            },
        },
    })
);
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// View Engine
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// Static Files
app.use(express.static(path.join(__dirname, "public")));

// Formulare
app.use(express.urlencoded({ extended: true }));

//Routen
app.use("/", routes);

//NOT Found

app.use(notFound);

//Global Error Handler

app.use(errorHandler);


module.exports = app;
