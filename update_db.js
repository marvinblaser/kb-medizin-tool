// update_db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Chemin vers ta base de données (vérifie que c'est le bon chemin relatif)
const dbPath = path.resolve(__dirname, 'server/database.db');

console.log("🔌 Connexion à : " + dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ Erreur d'ouverture BDD :", err.message);
        return;
    }
    console.log("✅ Base de données ouverte.");
});

// Commande SQL pour ajouter la colonne
const sql = "ALTER TABLE client_equipment ADD COLUMN location TEXT;";

db.run(sql, function(err) {
    if (err) {
        if (err.message.includes("duplicate column name")) {
            console.log("ℹ️ La colonne 'location' existe déjà. Tout est OK.");
        } else {
            console.error("❌ Erreur SQL :", err.message);
        }
    } else {
        console.log("🎉 SUCCÈS ! Colonne 'location' ajoutée.");
    }
    
    db.close(() => {
        console.log("🔒 Connexion fermée.");
    });
});