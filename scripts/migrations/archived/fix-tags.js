const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.serialize(() => {
    // 1. On supprime la table de liaison cassée
    db.run("DROP TABLE IF EXISTS rma_tag_links");
    
    // 2. On la recrée proprement
    db.run(`CREATE TABLE rma_tag_links (
        rma_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (rma_id, tag_id),
        FOREIGN KEY (rma_id) REFERENCES rmas(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES rma_tags(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) console.error("Erreur :", err.message);
        else console.log("✅ Table rma_tag_links réparée et connectée à la bonne table !");
    });
});

setTimeout(() => db.close(), 1000);