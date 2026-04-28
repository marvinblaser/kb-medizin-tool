const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ajustez le chemin si nécessaire selon votre structure
const dbPath = path.join(__dirname, 'server/database.db'); 
const db = new sqlite3.Database(dbPath);

console.log("Ajout de la distinction 'Appareil Secondaire'...");

db.serialize(() => {
    // On ajoute la colonne is_secondary (0 = Prioritaire/Maintenance, 1 = Secondaire/Sécurité)
    db.run("ALTER TABLE equipment_catalog ADD COLUMN is_secondary INTEGER DEFAULT 0", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) console.log("La colonne existe déjà.");
            else console.error("Erreur :", err.message);
        } else {
            console.log("Succès : Colonne 'is_secondary' ajoutée à equipment_catalog.");
        }
    });
});