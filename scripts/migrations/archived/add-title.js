const { db } = require('./server/config/database');
db.run("ALTER TABLE rmas ADD COLUMN title TEXT", (err) => {
    if (err) console.log("Erreur ou colonne déjà existante :", err.message);
    else console.log("✅ Colonne 'title' ajoutée avec succès !");
});