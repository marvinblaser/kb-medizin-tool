// migrate_techs.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Chemin vers votre base existante
const dbPath = path.join(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("Démarrage de la migration...");

db.serialize(() => {
    // 1. Créer la nouvelle table de liaison
    db.run(`
        CREATE TABLE IF NOT EXISTS appointment_technicians (
            appointment_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            PRIMARY KEY (appointment_id, user_id),
            FOREIGN KEY (appointment_id) REFERENCES appointments_history(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) { console.error("Erreur création table:", err); return; }
        console.log("Table 'appointment_technicians' vérifiée/créée.");

        // 2. Migrer les données existantes
        // On prend tous les RDV qui ont un technician_id et on les insère dans la nouvelle table
        const sqlMigration = `
            INSERT OR IGNORE INTO appointment_technicians (appointment_id, user_id)
            SELECT id, technician_id FROM appointments_history 
            WHERE technician_id IS NOT NULL AND technician_id > 0
        `;

        db.run(sqlMigration, function(err) {
            if (err) console.error("Erreur migration données:", err);
            else console.log(`Migration terminée : ${this.changes} rendez-vous mis à jour.`);
            
            console.log("Vous pouvez supprimer ce script.");
        });
    });
});