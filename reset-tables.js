// reset-tables.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db'); // Vérifie bien ce chemin
const db = new sqlite3.Database(dbPath);

console.log("⚠️  SUPPRESSION et RECRÉATION des tables de liaison...");

db.serialize(() => {
    
    // 1. Activer les Foreign Keys pour être sûr que le DROP fonctionne proprement
    db.run("PRAGMA foreign_keys = OFF;");

    // 2. Supprimer les anciennes tables
    db.run("DROP TABLE IF EXISTS report_equipment");
    db.run("DROP TABLE IF EXISTS report_technicians");
    db.run("DROP TABLE IF EXISTS report_materials");
    db.run("DROP TABLE IF EXISTS report_stk_tests");

    console.log("🗑️  Anciennes tables supprimées.");

    // 3. Recréer avec les BONNES colonnes

    // Équipements (CORRIGÉ : Ajout de equipment_info)
    db.run(`CREATE TABLE report_equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL, 
        equipment_info TEXT,  -- Cette colonne manquait !
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);
    // Note: On ne met PAS de Foreign Key sur equipment_id pour éviter les conflits 
    // entre client_equipment et equipment_catalog.

    // Techniciens
    db.run(`CREATE TABLE report_technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        technician_id INTEGER,
        technician_name TEXT,
        work_date TEXT,
        hours_normal REAL,
        hours_extra REAL,
        included BOOLEAN DEFAULT 0, -- J'ajoute 'included' car ton code l'utilise parfois
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
        discount REAL DEFAULT 0, -- Ajout de discount utilisé dans le code
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

    console.log("✅  Tables recréées avec succès (Structure corrigée).");
});

db.close();