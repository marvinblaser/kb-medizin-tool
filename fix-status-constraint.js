// fix-status-constraint.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🛠️  Correction de la contrainte 'CHECK constraint' sur le statut...");

db.serialize(() => {
    // 1. Désactiver temporairement les clés étrangères pour éviter les conflits
    db.run("PRAGMA foreign_keys=OFF");

    // 2. Renommer la table actuelle en 'reports_old' (Sauvegarde)
    console.log("📦 Renommage de l'ancienne table...");
    db.run("ALTER TABLE reports RENAME TO reports_old");

    // 3. Créer la NOUVELLE table reports (SANS la contrainte CHECK restrictive)
    console.log("✨ Création de la nouvelle table...");
    db.run(`CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_number TEXT,
        client_id INTEGER,
        work_type TEXT,
        status TEXT DEFAULT 'draft',  -- Plus de contrainte CHECK restrictive ici !
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

    // 4. Copier les données de l'ancienne table vers la nouvelle
    console.log("🔄 Transfert des données...");
    // On liste les colonnes explicitement pour éviter les erreurs d'ordre
    const columns = [
        "id", "report_number", "client_id", "work_type", "status", 
        "cabinet_name", "address", "postal_code", "city", "interlocutor", 
        "installation", "remarks", "travel_costs", "travel_included", 
        "travel_location", "technician_signature_date", "work_accomplished", 
        "created_at", "validator_id", "validated_at", "rejection_reason", "archived_at"
    ];
    
    // On construit la requête de copie dynamique
    const colString = columns.join(", ");
    
    db.run(`INSERT INTO reports (${colString}) SELECT ${colString} FROM reports_old`, function(err) {
        if (err) {
            console.error("❌ Erreur lors du transfert :", err.message);
            console.log("⚠️ Restauration tentative...");
            db.run("DROP TABLE IF EXISTS reports");
            db.run("ALTER TABLE reports_old RENAME TO reports");
        } else {
            // 5. Si tout s'est bien passé, on supprime l'ancienne table
            console.log("✅ Transfert réussi (" + this.changes + " rapports). Suppression du backup...");
            db.run("DROP TABLE reports_old");
        }
    });

    // 6. Réactiver les clés étrangères
    db.run("PRAGMA foreign_keys=ON");
});

db.close(() => {
    console.log("🚀 Terminé. La base accepte maintenant les nouveaux statuts !");
});