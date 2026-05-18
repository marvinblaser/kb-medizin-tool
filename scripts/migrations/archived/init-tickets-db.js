const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connexion à la base de données existante
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Erreur de connexion à la base de données:", err.message);
        process.exit(1);
    }
    console.log("Connecté à la base de données SQLite.");
});

db.serialize(() => {
    console.log("Création de la table 'tickets'...");
    db.run(`
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'Normale',
            status TEXT NOT NULL DEFAULT 'À faire',
            client_id INTEGER,
            equipment_id INTEGER,
            creator_id INTEGER NOT NULL,
            assigned_to INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
            FOREIGN KEY (equipment_id) REFERENCES client_equipment(id) ON DELETE SET NULL,
            FOREIGN KEY (creator_id) REFERENCES users(id),
            FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    console.log("Création de la table 'ticket_comments'...");
    db.run(`
        CREATE TABLE IF NOT EXISTS ticket_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    console.log("✅ Les tables des tickets ont été créées avec succès !");
});

db.close();