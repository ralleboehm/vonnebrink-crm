"use strict";

/**
 * Action1-Abdeckung aus einem Sync-Protokoll: Geräte gesamt, davon einer
 * Firma zugeordnet. Nur Läufe, die alle Organisationen zählen konnten,
 * haben eine Gesamtzahl (stats.action1Total); sonst null.
 */
function coverageFrom(run) {

    if (!run || !run.stats || typeof run.stats.action1Total !== "number") {
        return null;
    }

    const total = run.stats.action1Total;
    const assigned = Math.min(run.stats.endpoints || 0, total);

    return {
        total,
        assigned,
        unassigned: total - assigned,
        percent: total ? Math.round((assigned / total) * 100) : 100,
        at: run.startedAt,
        unmappedOrgs: (run.organizations || [])
            .filter((org) => !org.mapped && org.endpoints > 0)
            .sort((a, b) => b.endpoints - a.endpoints)
    };

}

module.exports = { coverageFrom };
