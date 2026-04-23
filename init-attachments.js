const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS rma_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rma_id INTEGER,
        file_name TEXT,
        file_path TEXT,
        file_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rma_id) REFERENCES rmas(id) ON DELETE CASCADE
    )`, () => console.log("✅ Table des pièces jointes créée !"));
});
setTimeout(() => db.close(), 1000);