// add-language-col.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Chemin vers ta base de données
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("Mise à jour de la base de données...");

db.serialize(() => {
  // Ajoute la colonne 'language' avec 'fr' comme valeur par défaut
  db.run("ALTER TABLE reports ADD COLUMN language TEXT DEFAULT 'fr'", (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(">> La colonne 'language' existe déjà. Rien à faire.");
      } else {
        console.error(">> Erreur :", err.message);
      }
    } else {
      console.log(">> Succès : Colonne 'language' ajoutée !");
    }
  });
});

db.close(() => {
    console.log("Terminé.");
});