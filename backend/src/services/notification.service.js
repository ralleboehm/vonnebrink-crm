"use strict";

// ----------------------------------------------------
// Notification Service
// ----------------------------------------------------
//
// Zentrale Stelle für Benachrichtigungen im CRM:
//
//   - Interne Benachrichtigungen (Glocke): create, notifyUser, notifyUsers,
//     markAsRead, markAllAsRead, getUnread, countUnread, getRecent, getPage
//
//   - Ereignisse: dispatch(event, payload) ruft den Handler aus dem
//     Ereignis-Register auf (services/notification/events.js). Der Handler
//     legt Benachrichtigungen an und verschickt E-Mails.
//
//   - Kurzmethoden für Controller, z. B. ticketCreated(ticket)
//
// Ein Fehler beim Benachrichtigen darf nie die eigentliche Aktion (z. B.
// das Anlegen eines Tickets) scheitern lassen. dispatch() fängt deshalb
// alle Fehler ab und schreibt sie ins Log. E-Mails werden im Hintergrund
// verschickt, damit ein langsamer Mailserver keine Seite blockiert.

const mongoose = require("mongoose");

const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const events = require("./notification/events");

const { EVENTS } = events;

const DEFAULT_RECENT_LIMIT = 8;
const MAX_LIMIT = 100;

// Rollen, die bei neuen Tickets usw. benachrichtigt werden
const SUPPORT_ROLES = ["admin", "technician"];

// ----------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------

function clampLimit(value, fallback) {

    const n = parseInt(value, 10);

    if (!Number.isFinite(n) || n < 1) return fallback;

    return Math.min(n, MAX_LIMIT);

}

/**
 * Nur interne Links ("/crm/…") zulassen, keine fremden Adressen
 * oder "javascript:"-Links.
 */
function safeLink(link) {

    if (typeof link !== "string") return null;

    const value = link.trim();

    if (!value.startsWith("/") || value.startsWith("//")) return null;

    return value.slice(0, 500);

}

function idOf(value) {

    if (!value) return null;

    const id = value._id || value.id || value;

    return mongoose.isValidObjectId(id) ? String(id) : null;

}

/**
 * Eingaben für eine Benachrichtigung bereinigen
 */
function buildNotification(userId, data = {}) {

    const title = typeof data.title === "string" ? data.title.trim() : "";

    if (!title) {
        throw new Error("Eine Benachrichtigung braucht einen Titel.");
    }

    return {
        user: userId,
        title: title.slice(0, 200),
        message: typeof data.message === "string" ? data.message.trim().slice(0, 1000) : "",
        type: Notification.TYPES.includes(data.type) ? data.type : "info",
        icon: typeof data.icon === "string" && /^bi-[a-z0-9-]+$/.test(data.icon) ? data.icon : "bi-bell",
        link: safeLink(data.link),
        event: typeof data.event === "string" ? data.event.slice(0, 100) : null
    };

}

// ----------------------------------------------------
// Interne Benachrichtigungen
// ----------------------------------------------------

/**
 * Eine Benachrichtigung anlegen.
 *
 * @param {object} data  { user, title, message, type, icon, link, event }
 */
async function create(data) {

    const userId = idOf(data && data.user);

    if (!userId) {
        throw new Error("Eine Benachrichtigung braucht einen gültigen Benutzer.");
    }

    return Notification.create(buildNotification(userId, data));

}

/**
 * Einen Benutzer benachrichtigen
 */
async function notifyUser(user, data) {

    return create({ ...data, user });

}

/**
 * Mehrere Benutzer mit derselben Benachrichtigung versorgen.
 * Doppelte und ungültige IDs werden ignoriert.
 *
 * @returns {Promise<number>} Anzahl angelegter Benachrichtigungen
 */
async function notifyUsers(users, data) {

    const ids = [...new Set((users || []).map(idOf).filter(Boolean))];

    if (!ids.length) return 0;

    const docs = ids.map((id) => buildNotification(id, data));

    const created = await Notification.insertMany(docs);

    return created.length;

}

/**
 * Eine Benachrichtigung als gelesen markieren. Nur der Empfänger selbst
 * kann seine Benachrichtigungen ändern.
 *
 * @returns {Promise<object|null>} die Benachrichtigung oder null
 */
async function markAsRead(notificationId, userId) {

    if (!idOf(notificationId) || !idOf(userId)) return null;

    return Notification.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { $set: { isRead: true, readAt: new Date() } },
        { new: true }
    );

}

/**
 * Alle Benachrichtigungen eines Benutzers als gelesen markieren
 *
 * @returns {Promise<number>} Anzahl geänderter Benachrichtigungen
 */
async function markAllAsRead(userId) {

    if (!idOf(userId)) return 0;

    const result = await Notification.updateMany(
        { user: userId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
    );

    return result.modifiedCount || 0;

}

/**
 * Ungelesene Benachrichtigungen, neueste zuerst
 */
async function getUnread(userId, limit = DEFAULT_RECENT_LIMIT) {

    if (!idOf(userId)) return [];

    return Notification.find({ user: userId, isRead: false })
        .sort({ createdAt: -1 })
        .limit(clampLimit(limit, DEFAULT_RECENT_LIMIT))
        .lean();

}

async function countUnread(userId) {

    if (!idOf(userId)) return 0;

    return Notification.countDocuments({ user: userId, isRead: false });

}

/**
 * Neueste Benachrichtigungen (gelesen und ungelesen)
 */
async function getRecent(userId, limit = DEFAULT_RECENT_LIMIT) {

    if (!idOf(userId)) return [];

    return Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(clampLimit(limit, DEFAULT_RECENT_LIMIT))
        .lean();

}

/**
 * Seitenweise Liste für die Übersichtsseite
 *
 * @param {string} userId
 * @param {{page?: number, perPage?: number, unreadOnly?: boolean}} options
 */
async function getPage(userId, options = {}) {

    const perPage = clampLimit(options.perPage, 25);
    const page = Math.max(parseInt(options.page, 10) || 1, 1);

    if (!idOf(userId)) {
        return { items: [], total: 0, page: 1, pages: 1, perPage };
    }

    const query = { user: userId };

    if (options.unreadOnly) query.isRead = false;

    const [items, total] = await Promise.all([
        Notification.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage)
            .lean(),
        Notification.countDocuments(query)
    ]);

    return {
        items,
        total,
        page,
        pages: Math.max(Math.ceil(total / perPage), 1),
        perPage
    };

}

/**
 * Aktive Support-Mitarbeiter (Admins und Techniker)
 */
async function getSupportStaff() {

    return User.find(
        { active: true, role: { $in: SUPPORT_ROLES } },
        "firstName lastName email role"
    ).lean();

}

// ----------------------------------------------------
// Ereignisse
// ----------------------------------------------------

let handlersLoaded = false;

function loadHandlers() {

    if (!handlersLoaded) {
        require("./notification/handlers");
        handlersLoaded = true;
    }

}

/**
 * Werkzeuge für die Handler. E-Mail-Funktionen werden erst beim Aufruf
 * geladen, damit dieser Service auch ohne Mail-Konfiguration startet.
 */
function buildContext(overrides = {}) {

    return {

        EVENTS,

        notifyUser,
        notifyUsers,
        getSupportStaff,

        // Ticket mit Firma, Kontakt und Bearbeiter laden
        loadTicket(id) {
            return require("./ticket.service").getById(id);
        },

        // E-Mail mit Vorlage im Hintergrund verschicken (wartet nicht auf den Mailserver)
        queueTemplateEmail(template, to, data) {
            return require("./email.service").queueTemplate(template, to, data);
        },

        appUrl(path = "") {
            return require("./email.service").appUrl(path);
        },

        log(...args) {
            console.log("🔔", ...args);
        },

        ...overrides

    };

}

/**
 * Ein Ereignis auslösen.
 *
 * Fehler werden abgefangen und protokolliert; die aufrufende Aktion läuft
 * in jedem Fall weiter.
 *
 * @param {string} event     z. B. EVENTS.TICKET_CREATED
 * @param {object} payload   Daten zum Ereignis (z. B. { ticket })
 * @param {object} [ctx]     Werkzeuge ersetzen (Tests)
 * @returns {Promise<{ok: boolean, event: string, result?: object, error?: string}>}
 */
async function dispatch(event, payload = {}, ctx = null) {

    try {

        loadHandlers();

        const handler = events.getHandler(event);

        if (!handler) {
            console.warn(`🔔 Kein Handler für Ereignis "${event}" – nichts zu tun.`);
            return { ok: true, event, result: null };
        }

        const result = await handler(payload, ctx || buildContext());

        return { ok: true, event, result: result || null };

    } catch (err) {

        console.error(`❌ Benachrichtigung "${event}" fehlgeschlagen:`, err.message);

        return { ok: false, event, error: err.message };

    }

}

// ----------------------------------------------------
// Kurzmethoden für Controller
// ----------------------------------------------------

/**
 * Neues Ticket: interne Benachrichtigung, E-Mail an das Support-Team,
 * Eingangsbestätigung an den Kunden.
 *
 * @param {object} ticket  Ticket-Dokument (ID genügt; wird vollständig nachgeladen)
 * @param {object} [options]
 * @param {string} [options.createdByUserId]  CRM-Benutzer, der das Ticket angelegt hat
 *                                            (bekommt keine Benachrichtigung über sein eigenes Ticket)
 * @param {"crm"|"portal"} [options.source]
 */
async function ticketCreated(ticket, options = {}) {

    return dispatch(EVENTS.TICKET_CREATED, {
        ticket,
        createdByUserId: options.createdByUserId || null,
        source: options.source || "crm"
    });

}

module.exports = {

    EVENTS,
    SUPPORT_ROLES,

    create,
    notifyUser,
    notifyUsers,
    markAsRead,
    markAllAsRead,
    getUnread,
    countUnread,
    getRecent,
    getPage,
    getSupportStaff,

    dispatch,
    buildContext,

    ticketCreated,

    // für Tests
    _buildNotification: buildNotification,
    _safeLink: safeLink

};
