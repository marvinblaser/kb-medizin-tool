const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Chemin vers votre base de données
const dbPath = path.join(__dirname, 'server', 'database.db'); 
const db = new sqlite3.Database(dbPath);

console.log("🔌 Connexion à la base de données...");

db.run("ALTER TABLE equipment_catalog ADD COLUMN name_de TEXT", (err) => {
    if (err) {
        if (err.message.includes("duplicate column name")) {
            console.log("✅ La colonne 'name_de' existe déjà. Tout est prêt !");
        } else {
            console.error("❌ Erreur :", err.message);
        }
    } else {
        console.log("✅ Colonne 'name_de' (Allemand) ajoutée avec succès au catalogue !");
    }
    db.close();
});