const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/database.db');

db.serialize(() => {
    console.log("Reprise de la mise à jour des tables...");
    
    db.run("ALTER TABLE ticket_comments ADD COLUMN file_path TEXT", (err) => {
        if (err && err.message.includes('duplicate')) {
            console.log("La colonne des pièces jointes est déjà là !");
        } else if (err) {
            console.log("Erreur :", err.message);
        } else {
            console.log("✅ Colonne des pièces jointes ajoutée avec succès !");
        }
        console.log("🚀 Base de données 100% prête, vous pouvez relancer npm run dev !");
    });
});

setTimeout(() => db.close(), 1000);