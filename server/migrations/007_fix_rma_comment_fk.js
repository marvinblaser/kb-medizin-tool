// server/migrations/007_fix_rma_comments_fk.js
// Corrige la foreign key de rma_comments qui pointe vers rmas_old au lieu de rmas

module.exports = {
  up: (db, done) => {
    // SQLite ne supporte pas ALTER TABLE pour modifier les FK
    // On doit recréer la table avec la bonne FK

    db.serialize(() => {
      // 1. Désactive temporairement les foreign keys
      db.run('PRAGMA foreign_keys = OFF', (err) => {
        if (err) return done(err);

        // 2. Crée la nouvelle table avec la bonne FK
        db.run(`
          CREATE TABLE IF NOT EXISTS rma_comments_new (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            rma_id     INTEGER,
            user_id    INTEGER,
            comment    TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (rma_id)  REFERENCES rmas(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `, (err) => {
          if (err) return done(err);

          // 3. Copie les données existantes
          db.run(`
            INSERT INTO rma_comments_new (id, rma_id, user_id, comment, created_at)
            SELECT id, rma_id, user_id, comment, created_at FROM rma_comments
          `, (err) => {
            if (err) return done(err);

            // 4. Supprime l'ancienne table
            db.run('DROP TABLE rma_comments', (err) => {
              if (err) return done(err);

              // 5. Renomme la nouvelle table
              db.run('ALTER TABLE rma_comments_new RENAME TO rma_comments', (err) => {
                if (err) return done(err);

                // 6. Réactive les foreign keys
                db.run('PRAGMA foreign_keys = ON', (err) => {
                  if (err) return done(err);
                  done();
                });
              });
            });
          });
        });
      });
    });
  }
};