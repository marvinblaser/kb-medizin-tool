const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'database.db');

async function seed() {
  console.log('🌱 Initialisation de la base de données...');

  // ========== SUPPRIMER L'ANCIENNE BASE ==========
  if (fs.existsSync(DB_PATH)) {
    console.log('🗑️  Suppression de l\'ancienne base de données...');
    try {
      fs.unlinkSync(DB_PATH);
      console.log('✅ Ancienne base supprimée');
    } catch (error) {
      console.error('❌ Erreur: La base est verrouillée (serveur en cours ?)');
      console.error('   Arrêtez le serveur (Ctrl+C) puis relancez npm run init\n');
      process.exit(1);
    }
  }

  // ========== CRÉER UNE NOUVELLE BASE ==========
  console.log('🔨 Création de la nouvelle base...');
  const db = new sqlite3.Database(DB_PATH);
  
  // Activer les foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // ========== CRÉER LES TABLES ==========
  console.log('📋 Création des tables...');
  
  await runAsync(db, `
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

  await runAsync(db, `
    CREATE TABLE IF NOT EXISTS sectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(db, `
    CREATE TABLE IF NOT EXISTS equipment_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT,
      type TEXT NOT NULL DEFAULT 'Autre',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(db, `
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
      technician_id INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(db, `
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

  await runAsync(db, `
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

  await runAsync(db, `
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

  await runAsync(db, `
    CREATE TABLE IF NOT EXISTS appointment_equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      equipment_id INTEGER NOT NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments_history(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_id) REFERENCES client_equipment(id) ON DELETE CASCADE
    )
  `);

  await runAsync(db, `
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

  await runAsync(db, `
    CREATE TABLE IF NOT EXISTS checklist_equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_id INTEGER NOT NULL,
      equipment_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      equipment_order INTEGER DEFAULT 0,
      FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
    )
  `);

  await runAsync(db, `
    CREATE TABLE IF NOT EXISTS checklist_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_id INTEGER NOT NULL,
      task_name TEXT NOT NULL,
      task_order INTEGER DEFAULT 0,
      FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
    )
  `);

  await runAsync(db, `
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_type TEXT NOT NULL CHECK(report_type IN ('RE-VALIDATION', 'SERVICE', 'REPARATION', 'INSTALLATION')),
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
      travel_costs REAL DEFAULT 0,
      remarks TEXT,
      technician_signature_date TEXT,
      technician_signature TEXT,
      client_signature_date TEXT,
      client_signature TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'completed', 'sent')),
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await runAsync(db, `
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

  await runAsync(db, `
    CREATE TABLE IF NOT EXISTS report_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    )
  `);

  // ========== INSÉRER LES DONNÉES ==========
  const passwordHash = await bcrypt.hash('admin123', 10);

  // Utilisateurs
  console.log('👤 Création des utilisateurs...');
  await runAsync(db, 
    `INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)`,
    ['admin@kbmedizin.ch', passwordHash, 'admin', 'Administrateur', '+41 61 123 45 67']
  );
  await runAsync(db, 
    `INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)`,
    ['tech1@kbmedizin.ch', passwordHash, 'tech', 'Marc Dubois', '+41 79 234 56 78']
  );
  await runAsync(db, 
    `INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)`,
    ['tech2@kbmedizin.ch', passwordHash, 'tech', 'Sophie Laurent', '+41 79 345 67 89']
  );

  // Secteurs
  console.log('🏥 Création des secteurs...');
  await runAsync(db, `INSERT INTO sectors (name, slug) VALUES ('ORL', 'orl')`);
  await runAsync(db, `INSERT INTO sectors (name, slug) VALUES ('Gynécologie', 'gynecologie')`);
  await runAsync(db, `INSERT INTO sectors (name, slug) VALUES ('Stérilisation', 'sterilisation')`);
  await runAsync(db, `INSERT INTO sectors (name, slug) VALUES ('Podologie', 'podologie')`);
  await runAsync(db, `INSERT INTO sectors (name, slug) VALUES ('Chirurgie', 'chirurgie')`);

  // Équipements
  console.log('🔧 Création du catalogue...');
  const equipment = [
    ['Unité ORL complète', 'Atmos', 'C31', 'ORL'],
    ['Fauteuil d\'examen', 'Promotal', 'Clavia', 'ORL'],
    ['Colposcope', 'Zeiss', 'OPMI pico', 'Gynécologie'],
    ['Table gynécologique', 'Schmitz', 'Medi-Matic', 'Gynécologie'],
    ['Autoclave', 'Melag', 'Vacuklav 31B+', 'Stérilisation'],
    ['Thermodésinfecteur', 'Miele', 'PG 8528', 'Stérilisation'],
    ['Microscope ORL', 'Leica', 'M320', 'ORL'],
    ['Unité de podologie', 'Podiatech', 'PT-500', 'Podologie']
  ];

  for (const eq of equipment) {
    await runAsync(db, 
      `INSERT INTO equipment_catalog (name, brand, model, type) VALUES (?, ?, ?, ?)`,
      eq
    );
  }

  // Clients
  console.log('👥 Création des clients...');
  const clients = [
    ['Cabinet Dr. Müller', 'Dr. Hans Müller', 'ORL', 'Bahnhofstrasse 15', null, 'BE', 'Bern', '+41 31 300 11 22', 'info@dr-mueller.ch', '2024-11-15', '2025-11-20'],
    ['Praxis Zürich Mitte', 'Dr. Anna Schmidt', 'Gynécologie', 'Rämistrasse 42', null, 'ZH', 'Zürich', '+41 44 200 33 44', 'kontakt@praxis-zh.ch', '2025-03-10', null],
    ['Clinique Lémanique', 'Dr. Pierre Dubois', 'ORL', 'Rue du Lac 8', null, 'GE', 'Genève', '+41 22 700 55 66', 'info@clinique-lemanique.ch', '2025-01-20', '2025-01-25']
  ];

  for (const client of clients) {
    await runAsync(db,
      `INSERT INTO clients (cabinet_name, contact_name, activity, address, postal_code, canton, city, phone, email, maintenance_due_date, appointment_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      client
    );
  }

  // Équipements clients
  console.log('🛠️  Installation des équipements...');
  await runAsync(db, 
    `INSERT INTO client_equipment (client_id, equipment_id, serial_number, installed_at, warranty_until) VALUES (?, ?, ?, ?, ?)`,
    [1, 1, 'ATM-2023-001', '2023-01-15', '2026-01-15']
  );
  await runAsync(db, 
    `INSERT INTO client_equipment (client_id, equipment_id, serial_number, installed_at, warranty_until) VALUES (?, ?, ?, ?, ?)`,
    [2, 3, 'ZEI-2022-078', '2022-06-10', '2025-06-10']
  );

  // Logs
  console.log('📋 Création des logs...');
  await runAsync(db,
    `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)`,
    [1, 'login', 'user', 1, '{"ip":"127.0.0.1"}']
  );

  // Fermer la connexion
  db.close((err) => {
    if (err) {
      console.error('❌ Erreur fermeture:', err.message);
    }
  });

  console.log('\n✅ Base de données initialisée avec succès!');
  console.log('\n📋 Compte admin créé:');
  console.log('   Email: admin@kbmedizin.ch');
  console.log('   Mot de passe: admin123');
  console.log('\n🚀 Lancez le serveur avec: npm start\n');
}

// Helper pour utiliser db.run avec async/await
function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

seed().catch(console.error);