const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.serialize(() => {
    // Ajoute la colonne has_contract (0 = Non, 1 = Oui) avec 0 par défaut
    db.run("ALTER TABLE clients ADD COLUMN has_contract INTEGER DEFAULT 0", (err) => {
        if (err && !err.message.includes("duplicate column name")) {
            console.error("Erreur :", err.message);
        } else {
            console.log("✅ Colonne 'has_contract' ajoutée avec succès à la table clients !");
        }
    });
});

setTimeout(() => db.close(), 1000);