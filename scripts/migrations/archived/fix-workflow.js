// fix-workflow.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🚑 Réparation de la structure Workflow...");

db.serialize(() => {
    // On ajoute les colonnes une par une. Si elles existent déjà, l'erreur sera ignorée.
    const columns = [
        "ALTER TABLE reports ADD COLUMN validator_id INTEGER",
        "ALTER TABLE reports ADD COLUMN validated_at TEXT",
        "ALTER TABLE reports ADD COLUMN rejection_reason TEXT",
        "ALTER TABLE reports ADD COLUMN archived_at TEXT",
        // On s'assure que status existe (normalement oui, mais on vérifie)
        "ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'draft'" 
    ];

    columns.forEach(sql => {
        db.run(sql, (err) => {
            if (err && !err.message.includes("duplicate column")) {
                console.log("Info colonnes : " + err.message);
            }
        });
    });

    // On s'assure que tout le monde a un statut valide
    db.run("UPDATE reports SET status = 'draft' WHERE status IS NULL OR status = ''");
    
    console.log("✅ Base de données vérifiée et réparée.");
});

db.close();