# Vonnebrink CRM

A self-hosted CRM, Helpdesk and Customer Portal designed for Managed Service Providers (MSPs) and IT service companies.

---

## Features

### CRM

- Customer Management
- Contact Management
- Ticket Management
- User & Role Management
- Dashboard
- Activity Logging
- CSV Import & Export (Companies & Contacts)

### Customer Portal

- Secure customer login
- View own tickets
- Create new tickets
- Reply to tickets
- Manage profile
- Change password

---

## Technology Stack

### Backend

- Node.js
- Express
- MongoDB
- Mongoose

### Frontend

- Pug
- Bootstrap 5
- Bootstrap Icons

### Security

- bcrypt
- express-session
- Helmet
- express-rate-limit

---

## Current Status

### ✅ Phase 1 completed

Implemented features:

- Authentication
- CRM Dashboard
- Company Management
- Contact Management
- Ticket System
- Customer Portal
- Profile Management
- Password Management

---

## Planned Features

- Internal ticket notes
- File attachments
- Action1 integration
- Nextcloud integration
- Microsoft 365 integration
- Google Workspace integration
- Reporting
- Asset Management

---

## Installation

```bash
git clone https://github.com/<your-github-account>/vonnebrink-crm.git

cd vonnebrink-crm/backend

npm install

npm run dev
```

---

## Tests

The import/export logic has tests that need no database and no extra packages:

```bash
cd backend
node --test test/import.test.js test/import.flow.test.js
```

---

## Environment

Create a `.env` file.

Example:

```env
PORT=3000

MONGODB_URI=mongodb://localhost:27017/vonnebrink-crm

SESSION_SECRET=change_this_to_a_secure_random_secret
```

---

## Health Endpoint

```
GET /api/v1/health
```

---

## License

MIT License

---

## Author

**Vonnebrink IT Operations**

https://vonnebrink.com
## Globale Suche

Das Suchfeld in der Navigation durchsucht Firmen, Kontakte und Tickets gleichzeitig
(Taste `/` springt ins Feld, Pfeiltasten wählen einen Vorschlag, Enter öffnet die
Ergebnisseite unter `/crm/search`).

- Mehrere Wörter müssen alle vorkommen („müller heilbronn").
- „mueller" findet „Müller" und umgekehrt.
- Eine exakte Nummer (`CUS-000012`, `CON-…`, `TIC-…`) öffnet direkt den Datensatz.
- Gelöschte Datensätze werden nie angezeigt.
- Tests: `node --test test/search.test.js`
