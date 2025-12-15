// fix-reports-db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🛠️  Mise à jour de la structure Rapports...");

db.serialize(() => {
    // 1. Créer la table de liaison Rapport <-> Équipement
    db.run(`CREATE TABLE IF NOT EXISTS report_equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL,
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    )`);

    console.log("✅ Table 'report_equipment' vérifiée.");
});

db.close(() => console.log("Terminé."));