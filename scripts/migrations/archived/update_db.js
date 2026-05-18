// update_db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db'); // Vérifiez le nom (database.db ou .sqlite)

const db = new sqlite3.Database(dbPath);

const sql = "ALTER TABLE report_technicians ADD COLUMN included BOOLEAN DEFAULT 0;";

db.run(sql, function(err) {
    if (err) console.log("Info/Erreur: " + err.message);
    else console.log("✅ Succès : Colonne 'included' ajoutée aux techniciens.");
    db.close();
});