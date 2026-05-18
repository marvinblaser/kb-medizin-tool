const sqlite3 = require('sqlite3').verbose();

// Utilisation du bon chemin que vous m'avez indiqué
const db = new sqlite3.Database('server/database.db', (err) => {
    if (err) { console.error("Erreur de connexion:", err.message); process.exit(1); }
});

db.serialize(() => {
    console.log("Suppression des anciennes tables de tickets...");
    db.run("DROP TABLE IF EXISTS ticket_comments");
    db.run("DROP TABLE IF EXISTS tickets");

    console.log("Création des nouvelles tables (Post-it Universel)...");
    db.run(`
        CREATE TABLE tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'Ouvert',
            client_id INTEGER,
            equipment_id INTEGER,
            creator_id INTEGER NOT NULL,
            assigned_to INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE ticket_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            comment TEXT NOT NULL,
            is_system INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        )
    `);

    console.log("✅ Base de données des tickets mise à jour avec succès !");
});

db.close();