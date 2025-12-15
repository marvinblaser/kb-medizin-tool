// reset-tables.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("⚠️  SUPPRESSION et RECRÉATION des tables de liaison...");

db.serialize(() => {
    
    // 1. On supprime les anciennes tables (pour être sûr de repartir à zéro)
    db.run("DROP TABLE IF EXISTS report_equipment");
    db.run("DROP TABLE IF EXISTS report_technicians");
    db.run("DROP TABLE IF EXISTS report_materials");
    db.run("DROP TABLE IF EXISTS report_stk_tests");

    console.log("🗑️  Anciennes tables supprimées.");

    // 2. On les recrée avec les BONNES colonnes

    // Équipements (Celle qui plantait)
    db.run(`CREATE TABLE report_equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL, -- C'est cette colonne qui manquait
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);

    // Techniciens
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

    // Matériels
    db.run(`CREATE TABLE report_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        material_id INTEGER,
        material_name TEXT,
        product_code TEXT,
        quantity REAL,
        unit_price REAL,
        total_price REAL,
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);

    // Tests STK
    db.run(`CREATE TABLE report_stk_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        test_name TEXT,
        price REAL,
        included INTEGER,
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);

    console.log("✅  Tables recréées avec succès.");
});

db.close();