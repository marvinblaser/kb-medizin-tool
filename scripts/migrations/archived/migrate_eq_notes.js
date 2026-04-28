// migrate_eq_notes.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let dbPath = path.join(__dirname, 'database.db');
if (!fs.existsSync(dbPath)) dbPath = path.join(__dirname, 'server/database.db');

const db = new sqlite3.Database(dbPath);

console.log("Ajout de la colonne 'notes' aux équipements clients...");

db.serialize(() => {
    db.run("ALTER TABLE client_equipment ADD COLUMN notes TEXT", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) console.log(">> La colonne existe déjà.");
            else console.error(">> Erreur :", err.message);
        } else {
            console.log(">> SUCCÈS : Colonne 'notes' ajoutée.");
        }
    });
});