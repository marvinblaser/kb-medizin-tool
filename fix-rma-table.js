const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db'); // Assurez-vous que le chemin est correct

db.serialize(() => {
    console.log("🛠️  Début de la réparation de la table RMAs...");

    // 1. On désactive temporairement les contraintes pour faire la manipulation
    db.run("PRAGMA foreign_keys=OFF");

    // 2. On renomme l'ancienne table
    db.run("ALTER TABLE rmas RENAME TO rmas_old");

    // 3. On crée la nouvelle table avec la BONNE clé étrangère (client_equipment) et la colonne title
    db.run(`CREATE TABLE rmas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        equipment_id INTEGER,
        supplier_name TEXT DEFAULT 'Xion',
        rma_number TEXT,
        title TEXT,
        status TEXT DEFAULT 'Déclaration du problème',
        description TEXT,
        tracking_to_supplier TEXT,
        tracking_from_supplier TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id),
        FOREIGN KEY (equipment_id) REFERENCES client_equipment(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // 4. On rapatrie toutes les données de l'ancienne table vers la nouvelle
    db.run(`INSERT INTO rmas (id, client_id, equipment_id, supplier_name, rma_number, title, status, description, tracking_to_supplier, tracking_from_supplier, created_by, created_at, updated_at)
            SELECT id, client_id, equipment_id, supplier_name, rma_number, title, status, description, tracking_to_supplier, tracking_from_supplier, created_by, created_at, updated_at
            FROM rmas_old`);

    // 5. On supprime l'ancienne table
    db.run("DROP TABLE rmas_old", () => {
        console.log("✅ Table RMA corrigée avec succès ! La clé étrangère pointe désormais sur client_equipment.");
        db.run("PRAGMA foreign_keys=ON"); // On réactive les sécurités
    });
});

setTimeout(() => db.close(), 1500);