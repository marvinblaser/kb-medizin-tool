const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// Connexion DB
const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

const SALT_ROUNDS = 10;

// --- CONFIGURATION ---
// J'ai ajouté la propriété is_removable: 0 (Non supprimable)
const ROLES = [
    { name: 'Administrateur', slug: 'admin', permissions: 'all', is_removable: 0 },
    { name: 'Technicien', slug: 'tech', permissions: 'view_dashboard,view_clients,create_reports', is_removable: 0 },
    { name: 'Secrétaire', slug: 'secretary', permissions: 'view_dashboard,view_clients,manage_appointments,validate_reports', is_removable: 0 }
];

const SECTORS = ['ORL', 'Gynécologie', 'Stérilisation', 'Dermatologie', 'Médecine Générale', 'Ophtalmologie', 'Chirurgie Esthétique'];
const DEVICE_TYPES = ['Fauteuil d\'examen', 'Microscope', 'Autoclave', 'Laveur-Désinfecteur', 'Unité de consultation', 'Aspirateur chirurgical', 'Lampe scialytique', 'Colposcope'];

async function seed() {
    console.log("🏗️  Création de la structure de la base de données...");

    db.serialize(async () => {
        
        // --- 1. CRÉATION DES TABLES ---

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'tech',
            name TEXT NOT NULL,
            phone TEXT,
            photo_url TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME
        )`);

        // CORRECTION ICI : Ajout de is_removable
        db.run(`CREATE TABLE IF NOT EXISTS roles (
            slug TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            permissions TEXT,
            is_removable BOOLEAN DEFAULT 1
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            entity TEXT,
            entity_id INTEGER,
            meta_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cabinet_name TEXT NOT NULL,
            contact_name TEXT,
            activity TEXT,
            address TEXT,
            postal_code TEXT,
            city TEXT,
            canton TEXT,
            phone TEXT,
            email TEXT,
            appointment_at DATETIME,
            technician_id INTEGER,
            notes TEXT,
            latitude REAL,
            longitude REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS sectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS device_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS equipment_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            type TEXT,
            device_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            product_code TEXT,
            unit_price REAL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS client_equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            equipment_id INTEGER NOT NULL,
            serial_number TEXT,
            installed_at DATE,
            warranty_until DATE,
            last_maintenance_date DATE,
            maintenance_interval INTEGER DEFAULT 12,
            next_maintenance_date DATE,
            FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
            FOREIGN KEY(equipment_id) REFERENCES equipment_catalog(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            author_id INTEGER,
            report_number TEXT UNIQUE,
            work_type TEXT,
            technician_signature_date DATETIME,
            customer_signature_date DATETIME,
            content_json TEXT,
            installation TEXT,
            pdf_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS appointments_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            appointment_date DATETIME NOT NULL,
            task_description TEXT,
            technician_id INTEGER,
            report_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS appointment_equipment (
            appointment_id INTEGER NOT NULL,
            equipment_id INTEGER NOT NULL,
            PRIMARY KEY (appointment_id, equipment_id)
        )`);

        console.log("✅ Tables créées.");

        // --- 2. INSERTION DONNÉES ---

        // Rôles (Avec is_removable)
        const roleStmt = db.prepare("INSERT OR IGNORE INTO roles (name, slug, permissions, is_removable) VALUES (?, ?, ?, ?)");
        ROLES.forEach(r => roleStmt.run(r.name, r.slug, r.permissions, r.is_removable));
        roleStmt.finalize();

        // Secteurs
        const sectStmt = db.prepare("INSERT OR IGNORE INTO sectors (name, slug) VALUES (?, ?)");
        SECTORS.forEach(s => sectStmt.run(s, s.toLowerCase().replace(/[^a-z0-9]/g, '')));
        sectStmt.finalize();

        // Types
        const typeStmt = db.prepare("INSERT OR IGNORE INTO device_types (name) VALUES (?)");
        DEVICE_TYPES.forEach(t => typeStmt.run(t));
        typeStmt.finalize();

        // Admin User
        const adminEmail = 'admin@kbmed.ch';
        const adminPass = 'admin123';
        const hashedPassword = await bcrypt.hash(adminPass, SALT_ROUNDS);
        
        db.get("SELECT id FROM users WHERE email = ?", [adminEmail], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO users (name, email, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`, 
                        ['Super Admin', adminEmail, hashedPassword, 'admin'], 
                        (err) => {
                            if(!err) console.log(`👤 Admin créé : ${adminEmail} / ${adminPass}`);
                        });
            }
        });

        console.log("🚀 Base de données réparée et prête !");
    });
}

seed();