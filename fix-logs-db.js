// fix-logs-db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🩹 Réparation de la table 'activity_logs'...");

db.serialize(() => {
    db.run("PRAGMA foreign_keys=OFF");

    // 1. Sauvegarde des logs actuels
    db.run("ALTER TABLE activity_logs RENAME TO activity_logs_old", (err) => {
        if (err && !err.message.includes('no such table')) {
            console.error("Info:", err.message);
        }
    });

    // 2. Création de la table PROPRE reliée à la nouvelle table 'users'
    console.log("✨ Création de la nouvelle table activity_logs...");
    db.run(`CREATE TABLE activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT,
        entity TEXT,
        entity_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // 3. Récupération des données (si la vieille table existait)
    db.run(`INSERT INTO activity_logs (id, user_id, action, entity, entity_id, details, created_at)
            SELECT id, user_id, action, entity, entity_id, details, created_at 
            FROM activity_logs_old`, 
        function(err) {
            if (!err) {
                console.log(`✅ ${this.changes} lignes d'historique récupérées.`);
                db.run("DROP TABLE activity_logs_old");
            } else {
                console.log("ℹ️ Création d'une table logs vide (pas d'historique précédent ou erreur).");
                // Si erreur (ex: table n'existait pas), on s'assure juste que la vieille est supprimée si elle existe
                db.run("DROP TABLE IF EXISTS activity_logs_old");
            }
        }
    );

    db.run("PRAGMA foreign_keys=ON");
});

db.close(() => {
    console.log("🚀 Terminé ! La connexion devrait fonctionner.");
});