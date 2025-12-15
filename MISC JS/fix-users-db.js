// fix-users-db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log("🛠️  Correction de la table 'users' et ajout des rôles...");

db.serialize(() => {
    db.run("PRAGMA foreign_keys=OFF");

    // 1. DÉVERROUILLAGE DE LA TABLE USERS
    console.log("📦 Migration de la table users...");
    
    db.run("ALTER TABLE users RENAME TO users_old");

    // Création de la nouvelle table SANS la contrainte "CHECK(role IN...)"
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL, -- Plus de restriction ici, on accepte tout
        name TEXT NOT NULL,
        phone TEXT,
        photo_url TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
    )`);

    // Copie des données
    db.run(`INSERT INTO users (id, email, password_hash, role, name, phone, photo_url, is_active, created_at, last_login_at)
            SELECT id, email, password_hash, role, name, phone, photo_url, is_active, created_at, last_login_at FROM users_old`, 
    function(err) {
        if (err) {
            console.error("❌ Erreur copie users :", err.message);
            db.run("DROP TABLE users");
            db.run("ALTER TABLE users_old RENAME TO users");
        } else {
            console.log("✅ Users migrés. Suppression backup...");
            db.run("DROP TABLE users_old");
        }
    });

    // 2. AJOUT DES NOUVEAUX RÔLES (Table 'roles')
    // On s'assure que les rôles existent pour que l'interface soit cohérente
    console.log("✨ Ajout des définitions de rôles...");
    const roles = [
        ['secretary', 'Secrétaire', 'Gère la facturation et les archives'],
        ['validator', 'Validateur', 'Valide les rapports techniques'],
        ['sales_director', 'Directeur Ventes', 'Accès global et validation']
    ];

    // Création table roles si elle n'existe pas (sécurité)
    db.run(`CREATE TABLE IF NOT EXISTS roles (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        permissions TEXT
    )`);

    const stmt = db.prepare("INSERT OR IGNORE INTO roles (slug, name, permissions) VALUES (?, ?, ?)");
    roles.forEach(r => stmt.run(r[0], r[1], r[2]));
    stmt.finalize();

    db.run("PRAGMA foreign_keys=ON");
});

db.close(() => {
    console.log("🚀 Terminé ! Tu peux maintenant créer des secrétaires.");
});