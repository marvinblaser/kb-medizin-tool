// add-author-col.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🛠️  Ajout de la colonne 'author_id' aux rapports...");

db.serialize(() => {
    // On ajoute la colonne. Si elle existe déjà, SQLite renverra une erreur qu'on ignore.
    db.run("ALTER TABLE reports ADD COLUMN author_id INTEGER", (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error("Erreur:", err.message);
        } else {
            console.log("✅ Colonne 'author_id' ajoutée.");
        }
    });
});

db.close(() => {
    console.log("🚀 Terminé !");
});