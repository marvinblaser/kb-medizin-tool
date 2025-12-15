// add-cords.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server/database.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Tentative de réparation de la base de données...');

db.serialize(() => {
  // 1. Vérifier et ajouter latitude
  db.run("ALTER TABLE clients ADD COLUMN latitude REAL", (err) => {
    if (err && err.message.includes('duplicate column')) {
      console.log('ℹ️  La colonne "latitude" existe déjà.');
    } else if (err) {
      console.error('❌ Erreur latitude:', err.message);
    } else {
      console.log('✅ Colonne "latitude" ajoutée.');
    }
  });

  // 2. Vérifier et ajouter longitude
  db.run("ALTER TABLE clients ADD COLUMN longitude REAL", (err) => {
    if (err && err.message.includes('duplicate column')) {
      console.log('ℹ️  La colonne "longitude" existe déjà.');
    } else if (err) {
      console.error('❌ Erreur longitude:', err.message);
    } else {
      console.log('✅ Colonne "longitude" ajoutée.');
    }
  });
  
  // 3. Vérifier code postal (au cas où)
  db.run("ALTER TABLE clients ADD COLUMN postal_code TEXT", (err) => {
    if (!err) console.log('✅ Colonne "postal_code" ajoutée.');
  });
});

// Attendre un peu que les commandes s'exécutent puis fermer
setTimeout(() => {
  db.close(() => {
    console.log('🏁 Terminé. Vous pouvez relancer le serveur (npm start).');
  });
}, 1000);