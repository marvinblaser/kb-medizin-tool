// server/config/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { runMigrations } = require('../migrations/runner');

// Utilise DB_PATH depuis .env, sinon valeur par défaut
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Impossible d\'ouvrir la base de données :', err.message);
    process.exit(1);
  }
});

db.run('PRAGMA foreign_keys = ON');

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {

      // ── Users & Rôles ────────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        photo_url TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login_at TEXT
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS roles (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        permissions TEXT,
        is_removable INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);

      const defaultRoles = [
        ['admin',        'Administrateur',        'all',                              1],
        ['tech',         'Technicien',            'create_reports,view_clients,view_stock', 1],
        ['secretary',    'Secrétaire',            'manage_appointments,view_reports', 1],
        ['sales_tech',   'Technico-commercial',   'view_clients,create_quotes',       1],
        ['sales_director','Directeur des ventes', 'view_all_stats,manage_sales',      1],
        ['verifier',     'Vérificateur',          'validate_reports',                 1],
      ];
      const stmtRoles = db.prepare(
        'INSERT OR IGNORE INTO roles (slug, name, permissions, is_removable) VALUES (?, ?, ?, ?)'
      );
      defaultRoles.forEach((role) => stmtRoles.run(role));
      stmtRoles.finalize();

      // ── Catalogues & Secteurs ─────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS sectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS device_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS equipment_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT,
        type TEXT NOT NULL,
        device_type TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);

      // ── Clients & Équipements ─────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cabinet_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        activity TEXT NOT NULL,
        address TEXT NOT NULL,
        postal_code TEXT,
        canton TEXT NOT NULL,
        city TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        maintenance_due_date TEXT,
        appointment_at TEXT,
        technician_id INTEGER,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        latitude REAL,
        longitude REAL,
        FOREIGN KEY (technician_id) REFERENCES users(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS client_equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL,
        serial_number TEXT,
        installed_at TEXT,
        warranty_until TEXT,
        last_maintenance_date TEXT,
        maintenance_interval INTEGER DEFAULT 1,
        next_maintenance_date TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (equipment_id) REFERENCES equipment_catalog(id)
      )`);

      // ── Logs & Historique ─────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        meta_json TEXT,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS appointments_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        appointment_date TEXT NOT NULL,
        task_description TEXT,
        technician_id INTEGER,
        report_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (technician_id) REFERENCES users(id),
        FOREIGN KEY (report_id) REFERENCES reports(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS appointment_equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL,
        FOREIGN KEY (appointment_id) REFERENCES appointments_history(id) ON DELETE CASCADE,
        FOREIGN KEY (equipment_id) REFERENCES client_equipment(id) ON DELETE CASCADE
      )`);

      // ── Checklists ────────────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS checklists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        updated_by_user_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS checklist_equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checklist_id INTEGER NOT NULL,
        equipment_name TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        equipment_order INTEGER DEFAULT 0,
        FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS checklist_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checklist_id INTEGER NOT NULL,
        task_name TEXT NOT NULL,
        task_order INTEGER DEFAULT 0,
        FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
      )`);

      // ── Rapports & Matériel ───────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        product_code TEXT NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_number TEXT UNIQUE,
        client_id INTEGER NOT NULL,
        author_id INTEGER,
        validator_id INTEGER,
        cabinet_name TEXT NOT NULL,
        address TEXT NOT NULL,
        postal_code TEXT,
        city TEXT NOT NULL,
        interlocutor TEXT,
        work_type TEXT NOT NULL,
        installation TEXT,
        work_accomplished TEXT,
        travel_location TEXT,
        travel_costs REAL DEFAULT 0,
        travel_included INTEGER DEFAULT 0,
        remarks TEXT,
        status TEXT DEFAULT 'draft',
        rejection_reason TEXT,
        technician_signature_date TEXT,
        client_signature_date TEXT,
        validated_at TEXT,
        archived_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (validator_id) REFERENCES users(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS report_technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        technician_id INTEGER,
        technician_name TEXT NOT NULL,
        work_date TEXT NOT NULL,
        hours_normal REAL DEFAULT 0,
        hours_extra REAL DEFAULT 0,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
        FOREIGN KEY (technician_id) REFERENCES users(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS report_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        material_id INTEGER,
        material_name TEXT NOT NULL,
        product_code TEXT,
        quantity INTEGER DEFAULT 1,
        unit_price REAL DEFAULT 0,
        total_price REAL DEFAULT 0,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
        FOREIGN KEY (material_id) REFERENCES materials(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS report_stk_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        test_name TEXT NOT NULL,
        price REAL DEFAULT 0,
        included INTEGER DEFAULT 0,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS report_equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        equipment_id INTEGER,
        equipment_info TEXT,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
        FOREIGN KEY (equipment_id) REFERENCES equipment_catalog(id)
      )`);

      // ── Fin du schema — on lance les migrations ensuite ───────────────────────
      // Ce SELECT 1 est la sentinelle : son callback ne se déclenche qu'une fois
      // que TOUTES les requêtes précédentes dans serialize() sont terminées.
      db.run('SELECT 1', async (err) => {
        if (err) return reject(err);
        try {
          await runMigrations(db);
          resolve();
        } catch (migrationErr) {
          reject(migrationErr);
        }
      });
    });
  });
}

module.exports = { db, initDatabase };
