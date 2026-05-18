// server/migrations/009_ticket_priority.js
// Ajoute la colonne priority à la table tickets

module.exports = {
  up: (db, done) => {
    db.all('PRAGMA table_info(tickets)', [], (err, cols) => {
      if (err) return done(err);
      if (cols.some(c => c.name === 'priority')) return done(); // déjà présent
      db.run(
        `ALTER TABLE tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normale'`,
        done
      );
    });
  }
};