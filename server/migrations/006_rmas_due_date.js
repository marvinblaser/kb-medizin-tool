// server/migrations/006_rmas_due_date.js
// Ajoute la colonne due_date à la table rmas

module.exports = {
  up: (db, done) => {
    // Vérifie si la colonne existe déjà via PRAGMA
    db.all('PRAGMA table_info(rmas)', [], (err, columns) => {
      if (err) return done(err);

      // Table absente ou vide → rien à faire
      if (!columns || columns.length === 0) return done();

      // Colonne déjà présente → rien à faire
      if (columns.some(col => col.name === 'due_date')) return done();

      // Ajout de la colonne
      db.run('ALTER TABLE rmas ADD COLUMN due_date TEXT', done);
    });
  }
};