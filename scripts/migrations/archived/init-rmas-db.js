const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.serialize(() => {
    console.log("Création des tables RMA...");

    // 1. Table principale des RMA
    db.run(`CREATE TABLE IF NOT EXISTS rmas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        equipment_id INTEGER,
        supplier_name TEXT DEFAULT 'Xion',
        rma_number TEXT,
        status TEXT DEFAULT 'Déclaration du problème',
        description TEXT,
        tracking_to_supplier TEXT,
        tracking_from_supplier TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id),
        FOREIGN KEY (equipment_id) REFERENCES equipment_catalog(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // 2. Table des Tags (Étiquettes personnalisées)
    db.run(`CREATE TABLE IF NOT EXISTS rma_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6'
    )`);

    // 3. Table de liaison RMA <-> Tags
    db.run(`CREATE TABLE IF NOT EXISTS rma_tag_links (
        rma_id INTEGER,
        tag_id INTEGER,
        FOREIGN KEY (rma_id) REFERENCES rmas(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES rma_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (rma_id, tag_id)
    )`);

    // 4. Table des commentaires horodatés
    db.run(`CREATE TABLE IF NOT EXISTS rma_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rma_id INTEGER,
        user_id INTEGER,
        comment TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rma_id) REFERENCES rmas(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`, () => {
        console.log("✅ Toutes les tables RMA ont été créées avec succès !");
    });
});

setTimeout(() => db.close(), 1500);