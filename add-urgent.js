const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/database.db');

db.serialize(() => {
    db.run("ALTER TABLE tickets ADD COLUMN is_urgent INTEGER DEFAULT 0", (err) => {
        if (err && err.message.includes('duplicate')) {
            console.log("✅ La colonne is_urgent est déjà là !");
        } else if (err) {
            console.log("❌ Erreur :", err.message);
        } else {
            console.log("✅ Colonne is_urgent ajoutée avec succès ! Le bug 500 est réparé.");
        }
    });
});

setTimeout(() => db.close(), 1000);