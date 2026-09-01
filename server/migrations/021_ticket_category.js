// server/migrations/021_ticket_category.js
// Ajoute la colonne category (nullable) à la table tickets

module.exports = {
  id: '021_ticket_category',
  up(db, callback) {
    db.all('PRAGMA table_info(tickets)', [], (err, cols) => {
      if (err) return callback(err);
      if (cols.some((c) => c.name === 'category')) return callback(null);
      db.run(`ALTER TABLE tickets ADD COLUMN category TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) return callback(err);
        callback(null);
      });
    });
  }
};
