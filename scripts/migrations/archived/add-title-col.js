// add-title-col.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("🛠️ Ajout de la colonne 'title'...");
    db.run("ALTER TABLE reports ADD COLUMN title TEXT", (err) => {
        if (err && err.message.includes("duplicate column")) {
            console.log("✅ La colonne 'title' existe déjà.");
        } else if (err) {
            console.error("❌ Erreur :", err.message);
        } else {
            console.log("🎉 Colonne 'title' ajoutée avec succès !");
        }
    });
});
db.close();