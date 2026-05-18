// server/migrations/010_materials_bexio_id.js

module.exports = {
  up: (db, done) => {
    db.all('PRAGMA table_info(materials)', [], (err, cols) => {
      if (err) return done(err);
      if (cols.some(c => c.name === 'bexio_id')) return done();

      // Ajoute la colonne SANS UNIQUE (SQLite ne le supporte pas via ALTER TABLE)
      db.run('ALTER TABLE materials ADD COLUMN bexio_id INTEGER', (err) => {
        if (err) return done(err);

        // Crée l'index unique séparément
        db.run(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_bexio_id ON materials(bexio_id) WHERE bexio_id IS NOT NULL',
          done
        );
      });
    });
  }
};