const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Adaptez le chemin si votre base est ailleurs (ex: './server/database.db')
const dbPath = path.resolve(__dirname, 'server/database.db'); 
const db = new sqlite3.Database(dbPath);

console.log(`🔌 Connexion à : ${dbPath}`);

db.serialize(() => {
    // 1. On supprime l'ancienne table qui pose problème
    console.log("🗑️ Suppression de l'ancienne table 'report_stk_tests'...");
    db.run("DROP TABLE IF EXISTS report_stk_tests", (err) => {
        if (err) {
            console.error("❌ Erreur suppression :", err.message);
            return;
        }
        console.log("✅ Ancienne table supprimée.");

        // 2. On la recrée proprement avec la colonne 'device_name'
        const createSql = `
        CREATE TABLE report_stk_tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            device_name TEXT, 
            price REAL DEFAULT 0,
            is_included INTEGER DEFAULT 0,
            FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
        );
        `;

        console.log("🔨 Création de la nouvelle table...");
        db.run(createSql, (err) => {
            if (err) {
                console.error("❌ Erreur création :", err.message);
            } else {
                console.log("🎉 Table 'report_stk_tests' réparée avec succès !");
                console.log("👉 La colonne 'device_name' est maintenant présente.");
            }
            db.close();
        });
    });
});