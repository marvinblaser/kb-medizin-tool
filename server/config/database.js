// server/config/database.js

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "../database.db");
const db = new sqlite3.Database(dbPath);

db.run("PRAGMA foreign_keys = ON");

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Table users
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
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
        )
      `);

      // 2. Table roles
      db.run(`
        CREATE TABLE IF NOT EXISTS roles (
          slug TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          permissions TEXT,
          is_removable INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Initialisation des Rôles par défaut
      // IMPORTANT: is_removable est à 1 partout pour te donner le contrôle total.
      const defaultRoles = [
        ["admin", "Administrateur", "all", 1],
        ["tech", "Technicien", "create_reports,view_clients,view_stock", 1],
        ["secretary", "Secrétaire", "manage_appointments,view_reports", 1],
        ["sales_tech", "Technico-commercial", "view_clients,create_quotes", 1],
        [
          "sales_director",
          "Directeur des ventes",
          "view_all_stats,manage_sales",
          1,
        ],
        ["verifier", "Vérificateur", "validate_reports", 1],
      ];

      const stmt = db.prepare(
        "INSERT OR IGNORE INTO roles (slug, name, permissions, is_removable) VALUES (?, ?, ?, ?)"
      );
      defaultRoles.forEach((role) => stmt.run(role));
      stmt.finalize();

      // 3. Table sectors
      db.run(
        `CREATE TABLE IF NOT EXISTS sectors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`
      );

      // 4. Table device_types
      db.run(
        `CREATE TABLE IF NOT EXISTS device_types (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)`
      );

      // 5. Table equipment_catalog
      db.run(
        `CREATE TABLE IF NOT EXISTS equipment_catalog (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, brand TEXT NOT NULL, model TEXT, type TEXT NOT NULL, device_type TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`
      );

      // 6. Table clients
      db.run(`
        CREATE TABLE IF NOT EXISTS clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT, cabinet_name TEXT NOT NULL, contact_name TEXT NOT NULL, activity TEXT NOT NULL, address TEXT NOT NULL, postal_code TEXT, canton TEXT NOT NULL, city TEXT NOT NULL, phone TEXT, email TEXT, maintenance_due_date TEXT, appointment_at TEXT, technician_id INTEGER, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, latitude REAL, longitude REAL,
          FOREIGN KEY (technician_id) REFERENCES users(id)
        )
      `);

      // 7. Table client_equipment
      db.run(`
        CREATE TABLE IF NOT EXISTS client_equipment (
          id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, equipment_id INTEGER NOT NULL, serial_number TEXT, installed_at TEXT, warranty_until TEXT, last_maintenance_date TEXT, maintenance_interval INTEGER DEFAULT 1, next_maintenance_date TEXT,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE, FOREIGN KEY (equipment_id) REFERENCES equipment_catalog(id)
        )
      `);

      // 8. Table activity_logs
      db.run(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          entity_id INTEGER,
          details TEXT,  
          meta_json TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // 9. Table appointments_history
      db.run(`
        CREATE TABLE IF NOT EXISTS appointments_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, appointment_date TEXT NOT NULL, task_description TEXT, technician_id INTEGER, report_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE, FOREIGN KEY (technician_id) REFERENCES users(id), FOREIGN KEY (report_id) REFERENCES reports(id)
        )
      `);

      // 10. Table appointment_equipment
      db.run(
        `CREATE TABLE IF NOT EXISTS appointment_equipment (id INTEGER PRIMARY KEY AUTOINCREMENT, appointment_id INTEGER NOT NULL, equipment_id INTEGER NOT NULL, FOREIGN KEY (appointment_id) REFERENCES appointments_history(id) ON DELETE CASCADE, FOREIGN KEY (equipment_id) REFERENCES client_equipment(id) ON DELETE CASCADE)`
      );

      // 11. Table checklists
      db.run(
        `CREATE TABLE IF NOT EXISTS checklists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, updated_by_user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (updated_by_user_id) REFERENCES users(id))`
      );

      // 12. Table checklist_equipment
      db.run(
        `CREATE TABLE IF NOT EXISTS checklist_equipment (id INTEGER PRIMARY KEY AUTOINCREMENT, checklist_id INTEGER NOT NULL, equipment_name TEXT NOT NULL, quantity INTEGER DEFAULT 1, equipment_order INTEGER DEFAULT 0, FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE)`
      );

      // 13. Table checklist_tasks
      db.run(
        `CREATE TABLE IF NOT EXISTS checklist_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, checklist_id INTEGER NOT NULL, task_name TEXT NOT NULL, task_order INTEGER DEFAULT 0, FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE)`
      );

      // 14. Table materials
      db.run(
        `CREATE TABLE IF NOT EXISTS materials (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, product_code TEXT NOT NULL, unit_price REAL NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`
      );

      // 15. Table reports
      db.run(`
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT, report_number TEXT UNIQUE, client_id INTEGER NOT NULL, cabinet_name TEXT NOT NULL, address TEXT NOT NULL, postal_code TEXT, city TEXT NOT NULL, interlocutor TEXT, work_type TEXT NOT NULL, installation TEXT, work_accomplished TEXT, travel_location TEXT, travel_costs REAL DEFAULT 0, travel_included INTEGER DEFAULT 0, remarks TEXT, status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'completed', 'sent')), technician_signature_date TEXT, client_signature_date TEXT, created_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE, FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);

      // 16. Table report_technicians
      db.run(
        `CREATE TABLE IF NOT EXISTS report_technicians (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, technician_id INTEGER, technician_name TEXT NOT NULL, work_date TEXT NOT NULL, hours_normal REAL DEFAULT 0, hours_extra REAL DEFAULT 0, FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE, FOREIGN KEY (technician_id) REFERENCES users(id))`
      );

      // 17. Table report_materials
      db.run(
        `CREATE TABLE IF NOT EXISTS report_materials (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, material_id INTEGER, material_name TEXT NOT NULL, product_code TEXT, quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0, FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE, FOREIGN KEY (material_id) REFERENCES materials(id))`
      );

      // 18. Table report_stk_tests
      db.run(
        `CREATE TABLE IF NOT EXISTS report_stk_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, test_name TEXT NOT NULL, price REAL DEFAULT 0, included INTEGER DEFAULT 0, FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE)`
      );

      // 19. Table report_equipment
      db.run(
        `CREATE TABLE IF NOT EXISTS report_equipment (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, equipment_info TEXT NOT NULL, FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE)`
      );

      // MIGRATIONS
      db.all("PRAGMA table_info(users)", (err, columns) => {
        if (!err) {
          const names = columns.map((c) => c.name);
          if (!names.includes("photo_url"))
            db.run("ALTER TABLE users ADD COLUMN photo_url TEXT");
        }
      });
      db.all("PRAGMA table_info(equipment_catalog)", (err, columns) => {
        if (!err) {
          const names = columns.map((c) => c.name);
          if (!names.includes("device_type"))
            db.run("ALTER TABLE equipment_catalog ADD COLUMN device_type TEXT");
        }
      });
      db.all("PRAGMA table_info(activity_logs)", (err, columns) => {
        if (!err) {
          const names = columns.map((c) => c.name);
          if (!names.includes("details")) {
            console.log("Migration: Ajout de la colonne 'details' à activity_logs");
            db.run("ALTER TABLE activity_logs ADD COLUMN details TEXT");
          }
        }
      });
      db.all("PRAGMA table_info(reports)", (err, columns) => {
        if (!err) {
          const names = columns.map((c) => c.name);
          if (!names.includes("status")) {
            console.log("Migration: Ajout de la colonne 'status' manquant dans reports");
            // On ajoute la colonne avec une valeur par défaut
            db.run("ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'draft'");
          }
        }
      });

      resolve();
    });
  });
}

module.exports = { db, initDatabase };
