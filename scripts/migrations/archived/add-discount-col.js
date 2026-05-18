// add-discount-col.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🛠️  Ajout de la colonne 'discount'...");

db.serialize(() => {
    // On ajoute la colonne discount (pourcentage) avec une valeur par défaut de 0
    db.run("ALTER TABLE report_materials ADD COLUMN discount REAL DEFAULT 0", (err) => {
        if (err) {
            if (err.message.includes("duplicate column name")) {
                console.log("✅ La colonne 'discount' existe déjà.");
            } else {
                console.error("❌ Erreur :", err.message);
            }
        } else {
            console.log("✅ Succès : Colonne 'discount' ajoutée.");
        }
    });
});

db.close();