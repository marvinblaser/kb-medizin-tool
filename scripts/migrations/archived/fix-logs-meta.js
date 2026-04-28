// fix-logs-meta.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🩹 Ajout de la colonne 'meta_json' manquante...");

db.serialize(() => {
    db.run("PRAGMA foreign_keys=OFF");

    // 1. On renomme la table actuelle (qui est incomplète)
    db.run("ALTER TABLE activity_logs RENAME TO activity_logs_temp");

    // 2. On recrée la table avec TOUTES les colonnes possibles (details ET meta_json)
    console.log("✨ Création de la table complète...");
    db.run(`CREATE TABLE activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT,
        entity TEXT,
        entity_id INTEGER,
        details TEXT,
        meta_json TEXT,  -- <-- C'est la colonne qui manquait !
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // 3. On remet les anciennes données (on laisse meta_json vide pour les anciens logs)
    db.run(`INSERT INTO activity_logs (id, user_id, action, entity, entity_id, details, created_at)
            SELECT id, user_id, action, entity, entity_id, details, created_at 
            FROM activity_logs_temp`, 
        function(err) {
            if (err) {
                console.error("❌ Erreur transfert données :", err.message);
            } else {
                console.log(`✅ ${this.changes} logs récupérés.`);
            }
        }
    );

    // 4. On supprime la table temporaire
    db.run("DROP TABLE activity_logs_temp");

    db.run("PRAGMA foreign_keys=ON");
});

db.close(() => {
    console.log("🚀 Terminé ! La connexion fonctionnera maintenant.");
});