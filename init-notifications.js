const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT DEFAULT 'info', -- 'success', 'warning', 'error', 'info'
        message TEXT NOT NULL,
        link TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("Erreur:", err.message);
        else console.log("✅ Table 'notifications' prête !");
        db.close();
    });
});