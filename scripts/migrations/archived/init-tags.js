const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS rma_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6'
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS rma_tag_links (
        rma_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (rma_id, tag_id),
        FOREIGN KEY (rma_id) REFERENCES rmas(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES rma_tags(id) ON DELETE CASCADE
    )`, () => console.log("✅ Tables de tags prêtes !"));
});
setTimeout(() => db.close(), 1000);