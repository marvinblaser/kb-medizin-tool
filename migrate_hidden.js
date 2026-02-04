// Fichier : migrate_hidden.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// On cherche la DB au bon endroit
let dbPath = path.join(__dirname, 'server/database.db');
if (!fs.existsSync(dbPath)) dbPath = path.join(__dirname, 'server/config/database.db');

const db = new sqlite3.Database(dbPath);

console.log("Ajout de la colonne 'is_hidden' aux clients...");

db.serialize(() => {
    // On ajoute la colonne is_hidden (0 = Visible, 1 = Masqué)
    db.run("ALTER TABLE clients ADD COLUMN is_hidden INTEGER DEFAULT 0", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) console.log(">> La colonne existe déjà (C'est bon !).");
            else console.error(">> Erreur :", err.message);
        } else {
            console.log(">> SUCCÈS : Colonne 'is_hidden' ajoutée.");
        }
    });
});