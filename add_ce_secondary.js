const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.run("ALTER TABLE client_equipment ADD COLUMN is_secondary INTEGER DEFAULT 0", (err) => {
    if (err && !err.message.includes('duplicate column')) console.error(err.message);
    else console.log("✅ Colonne 'is_secondary' ajoutée aux machines des clients !");
    db.close();
});