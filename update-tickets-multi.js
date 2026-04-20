const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/database.db');

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS ticket_assignees (
            ticket_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    console.log("✅ Table multi-assignation créée avec succès !");
});

db.close();