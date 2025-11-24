const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.db');
const db = new sqlite3.Database(dbPath);

db.run('PRAGMA foreign_keys = ON');

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Table users
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin', 'tech')),
          name TEXT NOT NULL,
          phone TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          last_login_at TEXT
        )
      `);

      // Table sectors
      db.run(`
        CREATE TABLE IF NOT EXISTS sectors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Table equipment_catalog
      db.run(`
        CREATE TABLE IF NOT EXISTS equipment_catalog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          brand TEXT NOT NULL,
          model TEXT,
          type TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.all("PRAGMA table_info(equipment_catalog)", (err, columns) => {
        if (!err) {
          const columnNames = columns.map(col => col.name);
          if (!columnNames.includes('type')) {
            db.run("ALTER TABLE equipment_catalog ADD COLUMN type TEXT DEFAULT 'Autre'");
          }
        }
      });

      // Table clients
      db.run(`
        CREATE TABLE IF NOT EXISTS clients (
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
          FOREIGN KEY (technician_id) REFERENCES users(id)
        )
      `);

      db.all("PRAGMA table_info(clients)", (err, columns) => {
        if (!err) {
          const columnNames = columns.map(col => col.name);
          if (!columnNames.includes('postal_code')) {
            db.run("ALTER TABLE clients ADD COLUMN postal_code TEXT");
          }
          if (!columnNames.includes('technician_id')) {
            db.run("ALTER TABLE clients ADD COLUMN technician_id INTEGER REFERENCES users(id)");
          }
        }
      });

      // Table client_equipment
      db.run(`
        CREATE TABLE IF NOT EXISTS client_equipment (
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
        )
      `);

      db.all("PRAGMA table_info(client_equipment)", (err, columns) => {
        if (!err) {
          const columnNames = columns.map(col => col.name);
          
          if (!columnNames.includes('last_maintenance_date')) {
            db.run("ALTER TABLE client_equipment ADD COLUMN last_maintenance_date TEXT");
          }
          if (!columnNames.includes('maintenance_interval')) {
            db.run("ALTER TABLE client_equipment ADD COLUMN maintenance_interval INTEGER DEFAULT 1");
          }
          if (!columnNames.includes('next_maintenance_date')) {
            db.run("ALTER TABLE client_equipment ADD COLUMN next_maintenance_date TEXT");
          }
        }
      });

      // Table activity_logs
      db.run(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          entity_id INTEGER,
          meta_json TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // Table appointments_history
      db.run(`
        CREATE TABLE IF NOT EXISTS appointments_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          appointment_date TEXT NOT NULL,
          task_description TEXT,
          technician_id INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          FOREIGN KEY (technician_id) REFERENCES users(id)
        )
      `);

      // Table pour lier équipements aux rendez-vous
      db.run(`
        CREATE TABLE IF NOT EXISTS appointment_equipment (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          appointment_id INTEGER NOT NULL,
          equipment_id INTEGER NOT NULL,
          FOREIGN KEY (appointment_id) REFERENCES appointments_history(id) ON DELETE CASCADE,
          FOREIGN KEY (equipment_id) REFERENCES client_equipment(id) ON DELETE CASCADE
        )
      `);
      
      // Table checklists
      db.run(`
        CREATE TABLE IF NOT EXISTS checklists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          updated_by_user_id INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
        )
      `);
      
      // Table checklist_equipment
      db.run(`
        CREATE TABLE IF NOT EXISTS checklist_equipment (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          checklist_id INTEGER NOT NULL,
          equipment_name TEXT NOT NULL,
          quantity INTEGER DEFAULT 1,
          equipment_order INTEGER DEFAULT 0,
          FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
        )
      `);

      db.all("PRAGMA table_info(checklist_equipment)", (err, columns) => {
        if (!err) {
          const columnNames = columns.map(col => col.name);
          if (!columnNames.includes('equipment_order')) {
            db.run("ALTER TABLE checklist_equipment ADD COLUMN equipment_order INTEGER DEFAULT 0");
          }
        }
      });
      
      // Table checklist_tasks
      db.run(`
        CREATE TABLE IF NOT EXISTS checklist_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          checklist_id INTEGER NOT NULL,
          task_name TEXT NOT NULL,
          task_order INTEGER DEFAULT 0,
          FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
        )
      `);

      // Table materials
      db.run(`
        CREATE TABLE IF NOT EXISTS materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          product_code TEXT NOT NULL,
          unit_price REAL NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Table reports (SANS report_type)
      db.run(`
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_number TEXT UNIQUE,
          client_id INTEGER NOT NULL,
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
          status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'completed', 'sent')),
          technician_signature_date TEXT,
          client_signature_date TEXT,
          created_by INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);

      // ✅ FIX: C'est ici que la magie opère. On force l'ajout des colonnes si elles manquent.
      db.all("PRAGMA table_info(reports)", (err, columns) => {
        if (!err) {
          const columnNames = columns.map(col => col.name);
          
          // Fix pour ton erreur "no column named travel_location"
          if (!columnNames.includes('travel_location')) {
            console.log('🔧 Ajout de la colonne manquante : travel_location');
            db.run("ALTER TABLE reports ADD COLUMN travel_location TEXT");
          }
          
          // Je rajoute celle-ci par sécurité car elle va souvent avec
          if (!columnNames.includes('travel_included')) {
            console.log('🔧 Ajout de la colonne manquante : travel_included');
            db.run("ALTER TABLE reports ADD COLUMN travel_included INTEGER DEFAULT 0");
          }

          if (columnNames.includes('report_type')) {
            console.log('⚠️ Colonne report_type détectée, migration nécessaire');
          }
        }
      });

      // Table report_technicians (intervenants)
      db.run(`
        CREATE TABLE IF NOT EXISTS report_technicians (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_id INTEGER NOT NULL,
          technician_id INTEGER,
          technician_name TEXT NOT NULL,
          work_date TEXT NOT NULL,
          hours_normal REAL DEFAULT 0,
          hours_extra REAL DEFAULT 0,
          FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
          FOREIGN KEY (technician_id) REFERENCES users(id)
        )
      `);

      // Table report_materials (matériel utilisé)
      db.run(`
        CREATE TABLE IF NOT EXISTS report_materials (
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
        )
      `);

      // ✅ Ajouter les colonnes manquantes à la table report_materials
      db.all("PRAGMA table_info(report_materials)", (err, columns) => {
        if (!err) {
          const columnNames = columns.map(col => col.name);
          
          if (!columnNames.includes('material_id')) {
            db.run("ALTER TABLE report_materials ADD COLUMN material_id INTEGER REFERENCES materials(id)");
          }
          if (!columnNames.includes('product_code')) {
            db.run("ALTER TABLE report_materials ADD COLUMN product_code TEXT");
          }
        }
      });

      // ✅ NOUVEAU : Table pour les tests STK
      db.run(`
        CREATE TABLE IF NOT EXISTS report_stk_tests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_id INTEGER NOT NULL,
          test_name TEXT NOT NULL,
          price REAL DEFAULT 0,
          included INTEGER DEFAULT 0,
          FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('Erreur création table report_stk_tests:', err);
        } else {
          console.log('✅ Table report_stk_tests prête');
        }
      });

      // Table pour les équipements associés au rapport (optionnel)
      db.run(`
        CREATE TABLE IF NOT EXISTS report_equipment (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_id INTEGER NOT NULL,
          equipment_info TEXT NOT NULL,
          FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else {
          console.log('✅ Base de données initialisée avec succès');
          resolve();
        }
      });
    });
  });
}

module.exports = { db, initDatabase };