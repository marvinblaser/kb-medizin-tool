// fix-db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Chemin vers ta base de données
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log(`Connexion à la base de données : ${dbPath}`);

db.serialize(() => {
    // 1. Ajouter la colonne report_id à appointments_history
    console.log("Tentative d'ajout de la colonne 'report_id'...");
    
    db.run("ALTER TABLE appointments_history ADD COLUMN report_id INTEGER", function(err) {
        if (err) {
            if (err.message.includes("duplicate column name")) {
                console.log("✅ La colonne 'report_id' existe déjà.");
            } else {
                console.error("❌ Erreur lors de l'ajout de la colonne :", err.message);
            }
        } else {
            console.log("✅ Succès : Colonne 'report_id' ajoutée à la table appointments_history.");
        }
    });
});

db.close(() => {
    console.log("Terminé. Vous pouvez relancer le serveur.");
});