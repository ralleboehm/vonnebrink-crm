const entities = require("../../services/import/entities");
const csvParser = require("../../services/import/csvParser.service");
const mappingService = require("../../services/import/mapping.service");
const engine = require("../../services/import/engine");
const importJob = require("../../services/import/importJob.service");

const exportService = require("../../services/export/export.service");
const { toCsv } = require("../../services/export/csvWriter");

const upload = require("../../config/importUpload");

// ----------------------------------------------------
// Konstanten
// ----------------------------------------------------

const MAX_STORED_ERRORS = 1000;

const MAX_PROBLEMS_SHOWN = 100;

const MAX_SAMPLES_SHOWN = 15;

const ACTION_META = {
    create: { text: "Neu", class: "bg-success" },
    update: { text: "Aktualisieren", class: "bg-primary" },
    skip: { text: "Übersprungen", class: "bg-secondary" },
    error: { text: "Fehler", class: "bg-danger" }
};

// Verhindert, dass derselbe Import durch Doppelklick zweimal läuft
const runningImports = new Set();

// ----------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------

function notFound(res) {

    return res.status(404).render("errors/404", {
        title: "Seite nicht gefunden"
    });

}

function importUrl(entity, step = "") {

    return `/crm/import/${entity.key}${step ? `/${step}` : ""}`;

}

function renderUpload(res, entity, error = null, status = 200) {

    return res.status(status).render("crm/import/upload", {
        title: `${entity.label} importieren`,
        entity,
        maxFileSizeMb: upload.MAX_FILE_SIZE_MB,
        error
    });

}

function parseJobFile(job) {

    return csvParser.parseBuffer(importJob.readFile(job));

}

function sampleValues(parsed) {

    return parsed.headers.map((header, index) => {

        const values = [];

        for (const row of parsed.rows) {

            const value = String(row[index] ?? "").trim();

            if (value && !values.includes(value)) {
                values.push(value.length > 40 ? `${value.slice(0, 40)}…` : value);
            }

            if (values.length === 3) {
                break;
            }

        }

        return values;

    });

}

function uploadErrorMessage(err) {

    if (err.code === "LIMIT_FILE_SIZE") {
        return `Die Datei ist zu groß (maximal ${upload.MAX_FILE_SIZE_MB} MB).`;
    }

    return err.message || "Die Datei konnte nicht hochgeladen werden.";

}

// ----------------------------------------------------
// Entity aus der URL
// ----------------------------------------------------

exports.withEntity = (req, res, next) => {

    const entity = entities[req.params.entity];

    if (!entity) {
        return notFound(res);
    }

    req.importEntity = entity;

    next();

};

exports.withExportDefinition = (req, res, next) => {

    const definition = exportService.definitions[req.params.entity];

    if (!definition) {
        return notFound(res);
    }

    req.exportDefinition = definition;

    next();

};

// ----------------------------------------------------
// Startseite
// ----------------------------------------------------

exports.index = async (req, res, next) => {

    try {

        res.render("crm/import/index", {
            title: "Import & Export"
        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Schritt 1: Datei hochladen
// ----------------------------------------------------

exports.uploadForm = async (req, res, next) => {

    try {

        renderUpload(res, req.importEntity);

    } catch (err) {

        next(err);

    }

};

exports.upload = (req, res, next) => {

    const entity = req.importEntity;

    upload.single("csvFile")(req, res, async (uploadError) => {

        try {

            if (uploadError) {
                return renderUpload(res, entity, uploadErrorMessage(uploadError), 400);
            }

            if (!req.file) {
                return renderUpload(res, entity, "Bitte wählen Sie eine Datei aus.", 400);
            }

            // Vorherigen, nicht abgeschlossenen Vorgang aufräumen
            importJob.discardJob(req);
            importJob.cleanupStale();

            const job = {

                entity: entity.key,
                file: req.file.filename,
                originalName: String(req.file.originalname).slice(0, 200)

            };

            let parsed;

            try {

                parsed = parseJobFile(job);

                if (parsed.rows.length === 0) {
                    throw new Error("Die Datei enthält keine Datenzeilen.");
                }

                if (parsed.rows.length > engine.MAX_ROWS) {

                    throw new Error(
                        `Die Datei hat ${parsed.rows.length} Zeilen. ` +
                        `Pro Import sind höchstens ${engine.MAX_ROWS} Zeilen erlaubt. ` +
                        "Bitte teilen Sie die Datei auf."
                    );

                }

            } catch (parseError) {

                importJob.removeFile(job);

                return renderUpload(res, entity, parseError.message, 400);

            }

            req.session.importJob = {

                ...job,

                encoding: parsed.encoding,
                delimiter: parsed.delimiter,
                headers: parsed.headers,
                totalRows: parsed.rows.length,

                mapping: mappingService.guess(parsed.headers, entity),
                duplicates: "skip",
                mappingConfirmed: false

            };

            await importJob.saveSession(req);

            res.redirect(importUrl(entity, "map"));

        } catch (err) {

            next(err);

        }

    });

};

// ----------------------------------------------------
// Schritt 2: Spalten zuordnen
// ----------------------------------------------------

function renderMapping(res, entity, job, parsed, { mapping, duplicates, errors = [] }) {

    return res.render("crm/import/map", {

        title: `${entity.label} importieren`,
        entity,
        job,
        parsed,
        samples: sampleValues(parsed),
        mapping,
        duplicates,
        errors

    });

}

exports.mapForm = async (req, res, next) => {

    try {

        const entity = req.importEntity;

        const job = importJob.getJob(req, entity.key);

        if (!job) {
            return res.redirect(importUrl(entity));
        }

        const parsed = parseJobFile(job);

        renderMapping(res, entity, job, parsed, {
            mapping: job.mapping,
            duplicates: job.duplicates
        });

    } catch (err) {

        next(err);

    }

};

exports.mapSubmit = async (req, res, next) => {

    try {

        const entity = req.importEntity;

        const job = importJob.getJob(req, entity.key);

        if (!job) {
            return res.redirect(importUrl(entity));
        }

        const mapping = mappingService.fromForm(req.body, job.headers, entity);

        const duplicates = req.body.duplicates === "update" ? "update" : "skip";

        const errors = mappingService.validate(mapping, entity);

        if (errors.length > 0) {

            const parsed = parseJobFile(job);

            return res.status(400).render("crm/import/map", {

                title: `${entity.label} importieren`,
                entity,
                job,
                parsed,
                samples: sampleValues(parsed),
                mapping,
                duplicates,
                errors

            });

        }

        req.session.importJob.mapping = mapping;
        req.session.importJob.duplicates = duplicates;
        req.session.importJob.mappingConfirmed = true;

        await importJob.saveSession(req);

        res.redirect(importUrl(entity, "review"));

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Schritt 3: Prüfen (nichts wird gespeichert)
// ----------------------------------------------------

exports.review = async (req, res, next) => {

    try {

        const entity = req.importEntity;

        const job = importJob.getJob(req, entity.key);

        if (!job) {
            return res.redirect(importUrl(entity));
        }

        if (!job.mappingConfirmed) {
            return res.redirect(importUrl(entity, "map"));
        }

        const parsed = parseJobFile(job);

        const plan = await engine.buildPlan({
            entity,
            parsed,
            mapping: job.mapping,
            duplicates: job.duplicates
        });

        const problems = plan.items.filter((item) => item.action === "error");

        const samples = plan.items
            .filter((item) => item.action !== "error")
            .slice(0, MAX_SAMPLES_SHOWN);

        res.render("crm/import/review", {

            title: "Import prüfen",
            entity,
            job,
            counts: plan.counts,
            importable: plan.counts.create + plan.counts.update,
            problems: problems.slice(0, MAX_PROBLEMS_SHOWN),
            problemsHidden: Math.max(0, problems.length - MAX_PROBLEMS_SHOWN),
            samples,
            actionMeta: ACTION_META

        });

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Schritt 4: Import durchführen
// ----------------------------------------------------

exports.commit = async (req, res, next) => {

    const entity = req.importEntity;

    const job = importJob.getJob(req, entity.key);

    if (!job || !job.mappingConfirmed) {
        return res.redirect(importUrl(entity));
    }

    if (runningImports.has(job.file)) {
        return res.redirect(importUrl(entity, "review"));
    }

    runningImports.add(job.file);

    try {

        const parsed = parseJobFile(job);

        // Der Plan wird neu berechnet, damit er zum aktuellen
        // Datenbestand passt (seit der Prüfung kann sich etwas geändert haben).
        const plan = await engine.buildPlan({
            entity,
            parsed,
            mapping: job.mapping,
            duplicates: job.duplicates
        });

        const result = await engine.executePlan({ entity, plan });

        const failed = result.items.filter((item) => item.action === "error");

        req.session.importResult = {

            entity: entity.key,
            fileName: job.originalName,
            duplicates: job.duplicates,
            counts: {
                ...result.counts,
                applied: result.items.filter((item) => item.applied).length
            },
            headers: job.headers,
            errors: failed.slice(0, MAX_STORED_ERRORS).map((item) => ({
                line: item.line,
                label: item.label,
                messages: item.messages,
                cells: item.cells
            })),
            errorsHidden: Math.max(0, failed.length - MAX_STORED_ERRORS)

        };

        console.log(
            `Import ${entity.key} durch ${req.session.user.username}: ` +
            `${result.counts.create} neu, ${result.counts.update} aktualisiert, ` +
            `${result.counts.skip} übersprungen, ${result.counts.error} Fehler ` +
            `(Datei: ${job.originalName})`
        );

        importJob.discardJob(req);

        await importJob.saveSession(req);

        res.redirect(importUrl(entity, "result"));

    } catch (err) {

        next(err);

    } finally {

        runningImports.delete(job.file);

    }

};

// ----------------------------------------------------
// Abbrechen
// ----------------------------------------------------

exports.cancel = async (req, res, next) => {

    try {

        importJob.discardJob(req);

        await importJob.saveSession(req);

        res.redirect("/crm/import");

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Ergebnis
// ----------------------------------------------------

exports.result = async (req, res, next) => {

    try {

        const entity = req.importEntity;

        const result = req.session.importResult;

        if (!result || result.entity !== entity.key) {
            return res.redirect("/crm/import");
        }

        res.render("crm/import/result", {
            title: "Import abgeschlossen",
            entity,
            result
        });

    } catch (err) {

        next(err);

    }

};

// Fehlerhafte Zeilen als CSV, zum Korrigieren und erneut Importieren
exports.errorReport = async (req, res, next) => {

    try {

        const entity = req.importEntity;

        const result = req.session.importResult;

        if (!result || result.entity !== entity.key || result.errors.length === 0) {
            return res.redirect("/crm/import");
        }

        const csv = toCsv(
            [...result.headers, "Fehlermeldung"],
            result.errors.map((error) => [
                ...error.cells,
                error.messages.join(" ")
            ])
        );

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="fehler-${entity.key}.csv"`
        );
        res.setHeader("Cache-Control", "no-store");

        res.send(csv);

    } catch (err) {

        next(err);

    }

};

// ----------------------------------------------------
// Export
// ----------------------------------------------------

exports.exportForm = async (req, res, next) => {

    try {

        res.render("crm/import/export", {
            title: `${req.exportDefinition.label} exportieren`,
            definition: req.exportDefinition
        });

    } catch (err) {

        next(err);

    }

};

exports.exportDownload = async (req, res, next) => {

    try {

        const definition = req.exportDefinition;

        const status = definition.statuses.some((s) => s.value === req.query.status)
            ? req.query.status
            : "";

        const columns = exportService.selectColumns(definition, req.query.columns);

        const records = await definition.fetch({ status });

        const csv = exportService.buildCsv(definition, records, columns);

        console.log(
            `Export ${definition.key} durch ${req.session.user.username}: ` +
            `${records.length} Datensätze`
        );

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${exportService.fileName(definition)}"`
        );
        res.setHeader("Cache-Control", "no-store");

        res.send(csv);

    } catch (err) {

        next(err);

    }

};
