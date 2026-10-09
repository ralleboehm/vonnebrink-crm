"use strict";

// ----------------------------------------------------
// Beispieldaten für Entwicklung und Vorführung
// ----------------------------------------------------
//
// Alle Firmen und Personen sind erfunden. E-Mail-Adressen und Webseiten
// nutzen die reservierte Endung ".example" (RFC 2606) – an diese Adressen
// kann nie eine echte E-Mail zugestellt werden, auch wenn SMTP aktiv ist.
//
// Tickets: "daysAgo" = Alter in Tagen; "messages" mit from "customer"
// (Portal-Antwort) oder "staff" (internal: true = interne Notiz).

const PORTAL_PASSWORD = "Demo-Portal-2026!";

const COMPANIES = [

    {
        key: "baeckerei",
        companyName: "Bäckerei Sonnenschein GmbH",
        tags: ["Lebensmittelhandwerk", "Einzelhandel", "Lampertheim", "Newsletter"],
        status: "active",
        phone: "06206 555-100",
        email: "info@baeckerei-sonnenschein.example",
        website: "https://baeckerei-sonnenschein.example",
        address: { street: "Kaiserstraße", houseNumber: "12", postalCode: "68623", city: "Lampertheim", country: "Deutschland" },

        contacts: [
            { key: "becker", salutation: "mr", firstName: "Markus", lastName: "Becker", position: "Geschäftsführer", email: "m.becker@baeckerei-sonnenschein.example", phone: "06206 555-101", mobile: "0170 5550101", portal: true, marketing: "granted" },
            { key: "hartmann", salutation: "mrs", firstName: "Julia", lastName: "Hartmann", position: "Büro & Buchhaltung", email: "j.hartmann@baeckerei-sonnenschein.example", phone: "06206 555-102" }
        ],

        assets: [
            { name: "KASSE-FILIALE-01", type: "workstation", manufacturer: "Wincor Nixdorf", model: "BEETLE /M-III", serialNumber: "WN4711-0815", operatingSystem: "Windows 10 IoT Enterprise", contact: "hartmann", purchaseYearsAgo: 4, warrantyYears: 3 },
            { name: "BUERO-PC01", type: "workstation", manufacturer: "Dell", model: "OptiPlex 7010", serialNumber: "DL7010-A1B2C3", operatingSystem: "Windows 11 Pro", cpu: "Intel Core i5-13500", ram: "16 GB", disk: "512 GB NVMe", contact: "hartmann", purchaseYearsAgo: 1, warrantyYears: 3 },
            { name: "NB-BECKER", type: "laptop", manufacturer: "Lenovo", model: "ThinkPad T14 Gen 3", serialNumber: "PF3XK9Z2", operatingSystem: "Windows 11 Pro", contact: "becker", purchaseYearsAgo: 3.2, warrantyYears: 3 },
            { name: "DRUCKER-BUERO", type: "printer", manufacturer: "Brother", model: "MFC-L8900CDW", serialNumber: "E78123B9N", ipAddress: "192.168.10.50", purchaseYearsAgo: 2, warrantyYears: 2 }
        ],

        tickets: [
            {
                subject: "Kassensystem startet nicht mehr",
                description: "Seit heute früh bleibt die Kasse in der Filiale beim Start hängen. Wir kassieren gerade per Hand.",
                category: "hardware", priority: "urgent", status: "in_progress", assigned: true, daysAgo: 0, contact: "becker",
                messages: [
                    { from: "staff", text: "Ich schaue mir das per Fernwartung an und melde mich in 15 Minuten." },
                    { from: "staff", text: "Festplatte meldet SMART-Fehler. Ersatzgerät vorbereiten.", internal: true }
                ]
            },
            {
                subject: "Neuer Mitarbeiter ab 1. des Monats",
                description: "Bitte für Frau Neumann ein E-Mail-Postfach und einen Zugang zum Büro-PC einrichten.",
                category: "support", priority: "normal", status: "open", daysAgo: 2, contact: "hartmann"
            }
        ]
    },

    {
        key: "kanzlei",
        companyName: "Steuerkanzlei Weber & Partner",
        tags: ["Steuerberatung", "DATEV", "Newsletter"],
        status: "active",
        phone: "06251 555-200",
        email: "kanzlei@weber-partner.example",
        website: "https://weber-partner.example",
        address: { street: "Hauptstraße", houseNumber: "45", postalCode: "64625", city: "Bensheim", country: "Deutschland" },

        contacts: [
            { key: "weber", salutation: "mrs", firstName: "Sabine", lastName: "Weber", position: "Steuerberaterin, Partnerin", email: "s.weber@weber-partner.example", phone: "06251 555-201", portal: true, marketing: "revoked" },
            { key: "klein", salutation: "mr", firstName: "Thomas", lastName: "Klein", position: "IT-Ansprechpartner", email: "t.klein@weber-partner.example", phone: "06251 555-209" }
        ],

        assets: [
            { name: "SRV-DC01", type: "server", manufacturer: "HPE", model: "ProLiant DL360 Gen10", serialNumber: "CZJ0123ABC", operatingSystem: "Windows Server 2022 Standard", cpu: "Intel Xeon Silver 4210R", ram: "64 GB", disk: "4 × 960 GB SSD RAID 10", ipAddress: "10.0.0.10", purchaseYearsAgo: 3, warrantyYears: 5 },
            { name: "SRV-DATEV", type: "virtual_machine", manufacturer: "VMware, Inc.", model: "VMware Virtual Platform", operatingSystem: "Windows Server 2022 Standard", ipAddress: "10.0.0.20" },
            { name: "PC-WEBER", type: "workstation", manufacturer: "Fujitsu", model: "ESPRIMO P7012", serialNumber: "FJ-P7012-0001", operatingSystem: "Windows 11 Pro", contact: "weber", purchaseYearsAgo: 1.5, warrantyYears: 3 },
            { name: "PC-EMPFANG", type: "workstation", manufacturer: "Fujitsu", model: "ESPRIMO P7012", serialNumber: "FJ-P7012-0002", operatingSystem: "Windows 11 Pro", purchaseYearsAgo: 1.5, warrantyYears: 3 },
            { name: "FW-KANZLEI", type: "network", manufacturer: "Sophos", model: "XGS 2100", serialNumber: "X21000ABCD", ipAddress: "10.0.0.1", purchaseYearsAgo: 2.8, warrantyYears: 3 }
        ],

        tickets: [
            {
                subject: "DATEV-Update am Wochenende einspielen",
                description: "Bitte das DATEV-Servicerelease außerhalb der Bürozeiten installieren.",
                category: "software", priority: "normal", status: "waiting", assigned: true, daysAgo: 5, contact: "klein",
                messages: [
                    { from: "staff", text: "Termin Samstag 9 Uhr vorgeschlagen – passt das?" },
                    { from: "customer", text: "Ja, Samstag passt. Danke!" }
                ]
            },
            {
                subject: "Phishing-Mail erhalten",
                description: "Eine Mitarbeiterin hat eine verdächtige Mail mit Rechnungsanhang bekommen, aber nicht geöffnet.",
                category: "security", priority: "high", status: "resolved", assigned: true, daysAgo: 9, contact: "weber",
                messages: [
                    { from: "staff", text: "Mail geprüft und gelöscht, Absender gesperrt. Kein Befall festgestellt." }
                ]
            },
            {
                subject: "Zweiter Monitor für Empfang",
                description: "Am Empfang wird ein zweiter Bildschirm benötigt.",
                category: "hardware", priority: "low", status: "closed", assigned: true, daysAgo: 20, contact: "klein"
            }
        ]
    },

    {
        key: "autohaus",
        companyName: "Autohaus Krämer KG",
        tags: ["Kfz / Autohaus", "Worms"],
        status: "active",
        phone: "06241 555-300",
        email: "service@autohaus-kraemer.example",
        website: "https://autohaus-kraemer.example",
        address: { street: "Alzeyer Straße", houseNumber: "88", postalCode: "67549", city: "Worms", country: "Deutschland" },

        contacts: [
            { key: "kraemer", salutation: "mr", firstName: "Peter", lastName: "Krämer", position: "Inhaber", email: "p.kraemer@autohaus-kraemer.example", phone: "06241 555-301" },
            { key: "schulz", salutation: "mrs", firstName: "Lena", lastName: "Schulz", position: "Serviceannahme", email: "l.schulz@autohaus-kraemer.example", phone: "06241 555-310" }
        ],

        assets: [
            { name: "WS-SERVICE-01", type: "workstation", manufacturer: "HP", model: "EliteDesk 800 G9", serialNumber: "CZC2345XYZ", operatingSystem: "Windows 11 Pro", contact: "schulz", purchaseYearsAgo: 0.8, warrantyYears: 3 },
            { name: "NB-KRAEMER", type: "laptop", manufacturer: "HP", model: "EliteBook 840 G9", serialNumber: "5CG2345ABC", operatingSystem: "Windows 11 Pro", contact: "kraemer", purchaseYearsAgo: 2.9, warrantyYears: 3 },
            { name: "TABLET-WERKSTATT", type: "mobile", manufacturer: "Samsung", model: "Galaxy Tab Active4 Pro", operatingSystem: "Android 14", purchaseYearsAgo: 1, warrantyYears: 2 }
        ],

        tickets: [
            {
                subject: "WLAN in der Werkstatt bricht ab",
                description: "Das Werkstatt-Tablet verliert hinten in Halle 2 ständig die Verbindung.",
                category: "network", priority: "high", status: "open", daysAgo: 1, contact: "schulz"
            }
        ]
    },

    {
        key: "praxis",
        companyName: "Praxis Dr. Lindner",
        tags: ["Arztpraxis", "Gesundheitswesen", "Newsletter"],
        status: "active",
        phone: "06204 555-400",
        email: "praxis@dr-lindner.example",
        address: { street: "Rathausstraße", houseNumber: "3", postalCode: "68519", city: "Viernheim", country: "Deutschland" },

        contacts: [
            { key: "lindner", salutation: "mrs", firstName: "Anna", lastName: "Lindner", position: "Ärztin, Inhaberin", email: "a.lindner@dr-lindner.example", phone: "06204 555-401", marketing: "customer" },
            { key: "meyer", salutation: "mr", firstName: "Jonas", lastName: "Meyer", position: "Praxismanager", email: "j.meyer@dr-lindner.example", phone: "06204 555-402", portal: true, marketing: "granted" }
        ],

        assets: [
            { name: "EMPFANG-PC", type: "workstation", manufacturer: "Lenovo", model: "ThinkCentre M70q", serialNumber: "MJ0ABC12", operatingSystem: "Windows 11 Pro", contact: "meyer", purchaseYearsAgo: 2, warrantyYears: 3 },
            { name: "BEHANDLUNG-1", type: "workstation", manufacturer: "Lenovo", model: "ThinkCentre M70q", serialNumber: "MJ0ABC13", operatingSystem: "Windows 11 Pro", purchaseYearsAgo: 2, warrantyYears: 3 },
            { name: "BEHANDLUNG-2", type: "workstation", manufacturer: "Lenovo", model: "ThinkCentre M70q", serialNumber: "MJ0ABC14", operatingSystem: "Windows 11 Pro", status: "repair", purchaseYearsAgo: 2, warrantyYears: 3 },
            { name: "ROUTER-PRAXIS", type: "network", manufacturer: "AVM", model: "FRITZ!Box 7590 AX", ipAddress: "192.168.178.1", purchaseYearsAgo: 1.2, warrantyYears: 5 }
        ],

        tickets: [
            {
                subject: "Kartenlesegerät wird nicht erkannt",
                description: "Am Empfang wird das eGK-Lesegerät seit dem letzten Windows-Update nicht mehr erkannt.",
                category: "hardware", priority: "high", status: "in_progress", assigned: true, daysAgo: 1, contact: "meyer",
                messages: [
                    { from: "customer", text: "Ein Neustart hat leider nicht geholfen." },
                    { from: "staff", text: "Treiber vom Hersteller wird neu installiert, bitte das Gerät angeschlossen lassen." }
                ]
            },
            {
                subject: "Datensicherung prüfen",
                description: "Bitte die monatliche Prüfung der Datensicherung durchführen und dokumentieren.",
                category: "server", priority: "normal", status: "open", assigned: true, daysAgo: 3, contact: "lindner"
            }
        ]
    },

    {
        key: "holzbau",
        companyName: "Holzbau Müller GmbH",
        tags: ["Handwerk", "Bau", "Bürstadt"],
        status: "prospect",
        phone: "06206 555-500",
        email: "info@holzbau-mueller.example",
        address: { street: "Industriestraße", houseNumber: "7", postalCode: "68642", city: "Bürstadt", country: "Deutschland" },

        contacts: [
            { key: "mueller", salutation: "mr", firstName: "Stefan", lastName: "Müller", position: "Geschäftsführer", email: "s.mueller@holzbau-mueller.example", phone: "06206 555-501" }
        ],

        assets: [],
        tickets: []
    },

    {
        key: "cafe",
        companyName: "Café Rheinblick",
        tags: ["Gastronomie", "Lampertheim"],
        status: "inactive",
        phone: "06206 555-600",
        email: "hallo@cafe-rheinblick.example",
        address: { street: "Am Rhein", houseNumber: "1", postalCode: "68623", city: "Lampertheim", country: "Deutschland" },

        contacts: [
            { key: "yilmaz", salutation: "mrs", firstName: "Elif", lastName: "Yilmaz", position: "Inhaberin", email: "e.yilmaz@cafe-rheinblick.example" }
        ],

        assets: [
            { name: "KASSE-CAFE", type: "workstation", manufacturer: "Sunmi", model: "T2s", operatingSystem: "Android 11", status: "retired", purchaseYearsAgo: 5, warrantyYears: 2 }
        ],

        tickets: []
    }

];

module.exports = { PORTAL_PASSWORD, COMPANIES };
