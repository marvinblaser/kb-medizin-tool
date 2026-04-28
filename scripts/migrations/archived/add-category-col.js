const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('🔌 Connexion à la base de données...');

db.serialize(() => {
  // Ajouter la colonne category
  db.run(`ALTER TABLE checklists ADD COLUMN category TEXT DEFAULT 'Autre'`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('⚠️ La colonne "category" existe déjà.');
      } else {
        console.error('❌ Erreur lors de l\'ajout de la colonne :', err.message);
      }
    } else {
      console.log('✅ Colonne "category" ajoutée avec succès.');
    }
  });
});

db.close(() => {
  console.log('🔒 Connexion fermée.');
});