// update-workflow-db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🛠️  Mise à jour pour le Workflow de Validation...");

db.serialize(() => {
    // 1. Ajout des colonnes de validation
    const cols = [
        "ALTER TABLE reports ADD COLUMN validator_id INTEGER",
        "ALTER TABLE reports ADD COLUMN validated_at TEXT",
        "ALTER TABLE reports ADD COLUMN rejection_reason TEXT",
        "ALTER TABLE reports ADD COLUMN archived_at TEXT"
    ];

    cols.forEach(sql => {
        db.run(sql, (err) => {
            if (err && !err.message.includes("duplicate column")) {
                console.error("Erreur:", err.message);
            }
        });
    });
    
    // 2. On s'assure que tous les anciens rapports ont un statut 'draft' par défaut s'ils sont vides
    db.run("UPDATE reports SET status = 'draft' WHERE status IS NULL OR status = ''");

    console.log("✅ Base de données prête pour la validation et l'archivage.");
});

db.close();