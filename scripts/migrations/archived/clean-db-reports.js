// clean-db-reports.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🧹  Nettoyage et Réparation de la structure Rapports...");

db.serialize(() => {
    // 1. Activer les clés étrangères pour être sûr
    db.run("PRAGMA foreign_keys = ON");

    // 2. Supprimer les tables liées aux rapports (Ordre important !)
    const tables = [
        "report_equipment",
        "report_materials",
        "report_stk_tests",
        "report_technicians",
        "reports" // On supprime la table mère en dernier
    ];

    tables.forEach(t => {
        db.run(`DROP TABLE IF EXISTS ${t}`);
        console.log(`🗑️  Table '${t}' supprimée.`);
    });

    // 3. Recréer la table Mère (REPORTS) avec la bonne structure validée
    console.log("✨  Création table 'reports'...");
    db.run(`CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_number TEXT,
        client_id INTEGER,
        work_type TEXT,
        status TEXT DEFAULT 'draft',
        cabinet_name TEXT,
        address TEXT,
        postal_code TEXT,
        city TEXT,
        interlocutor TEXT,
        installation TEXT,
        remarks TEXT,
        travel_costs REAL,
        travel_included INTEGER,
        travel_location TEXT,
        technician_signature_date TEXT,
        work_accomplished TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        validator_id INTEGER,
        validated_at TEXT,
        rejection_reason TEXT,
        archived_at TEXT
    )`);

    // 4. Recréer les tables Enfants avec les bonnes Clés Étrangères
    console.log("✨  Création tables enfants...");

    db.run(`CREATE TABLE report_technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        technician_id INTEGER,
        technician_name TEXT,
        work_date TEXT,
        hours_normal REAL,
        hours_extra REAL,
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE report_stk_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        test_name TEXT,
        price REAL,
        included INTEGER,
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE report_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        material_id INTEGER,
        material_name TEXT,
        product_code TEXT,
        quantity REAL,
        unit_price REAL,
        discount REAL DEFAULT 0,
        total_price REAL,
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE report_equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL,
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);
});

db.close(() => {
    console.log("✅ Base de données réparée ! Vous pouvez relancer le serveur.");
});