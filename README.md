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
- CSV import (Companies & Contacts)
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