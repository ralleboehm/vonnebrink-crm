Vonnebrink CRM

Status: Alpha
Architektur: MVC
Framework: Express 5
View Engine: Pug
Datenbank: MongoDB
ODM: Mongoose

--------------------------------------------------
Ordnerstruktur
--------------------------------------------------

config/
controllers/
middleware/
models/
routes/
services/
views/
scripts/
utils/

--------------------------------------------------
Authentifizierung
--------------------------------------------------

CRM:
    middleware/auth/crmAuth.middleware.js

Portal:
    middleware/auth/portalAuth.middleware.js

--------------------------------------------------
Business Layer
--------------------------------------------------

Controller
    ↓

Service
    ↓

Model
    ↓

MongoDB

Controller enthalten keine Businesslogik.

--------------------------------------------------
Nummernkreise
--------------------------------------------------

CUS
CON
TIC

Counter-Service:
services/counter.service.js

--------------------------------------------------
Rollen
--------------------------------------------------

admin
technician
user
portal

--------------------------------------------------
Projektregeln
--------------------------------------------------

✔ Businesslogik nur im Service
✔ Controller möglichst schlank
✔ Views ausschließlich Pug
✔ Bootstrap 5
✔ Keine React-Komponenten
✔ Neue Features immer:
    Route
    Controller
    Service
    View

--------------------------------------------------
Geplante Module
--------------------------------------------------

☐ Import / Export
☐ Notifications
☐ Action1
☐ Nextcloud
☐ Microsoft 365
☐ Google Workspace
☐ Assets
☐ Activity Log
☐ Vertragsverwaltung
☐ Lizenzverwaltung
☐ Abrechnung