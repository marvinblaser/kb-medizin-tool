const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Migration de la table reports...');

db.serialize(() => {
  // Vérifier d'abord si la table reports existe et obtenir sa structure
  db.all("PRAGMA table_info(reports)", (err, columns) => {
    if (err) {
      console.error('❌ Erreur lecture structure:', err);
      db.close();
      return;
    }
    
    if (!columns || columns.length === 0) {
      console.log('⚠️  Table reports n\'existe pas, rien à migrer');
      db.close();
      return;
    }
    
    console.log('📋 Colonnes existantes:', columns.map(c => c.name).join(', '));
    
    // 1. Créer une nouvelle table
    db.run(`
      CREATE TABLE IF NOT EXISTS reports_new (
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
    `, (err) => {
      if (err) {
        console.error('❌ Erreur création nouvelle table:', err);
        db.close();
        return;
      }
      
      console.log('✅ Nouvelle table créée');
      
      // 2. Supprimer l'ancienne table et renommer
      db.run('DROP TABLE reports', (err) => {
        if (err) {
          console.error('❌ Erreur suppression:', err);
          db.close();
          return;
        }
        
        console.log('✅ Ancienne table supprimée');
        
        db.run('ALTER TABLE reports_new RENAME TO reports', (err) => {
          if (err) {
            console.error('❌ Erreur renommage:', err);
            db.close();
            return;
          }
          
          console.log('✅ Migration terminée avec succès !');
          console.log('⚠️  Note: Les données des anciens rapports ont été supprimées');
          console.log('   La nouvelle structure est prête à l\'emploi');
          db.close();
        });
      });
    });
  });
});