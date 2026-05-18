// server/migrations/011_rma_comments_is_system.js
// Ajoute is_system à rma_comments pour les logs automatiques

module.exports = {
  up: (db, done) => {
    db.all('PRAGMA table_info(rma_comments)', [], (err, cols) => {
      if (err) return done(err);
      if (cols.some(c => c.name === 'is_system')) return done();
      db.run(
        'ALTER TABLE rma_comments ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0',
        done
      );
    });
  }
};