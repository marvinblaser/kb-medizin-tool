// server/migrations/025_ticket_owner.js
// Ajoute un responsable principal (owner), distinct des simples assignés.

module.exports = {
  id: '025_ticket_owner',
  up(db, callback) {
    db.all('PRAGMA table_info(tickets)', [], (err, cols) => {
      if (err) return callback(err);
      if (cols.some((c) => c.name === 'owner_id')) return callback(null);
      db.run(`ALTER TABLE tickets ADD COLUMN owner_id INTEGER REFERENCES users(id)`, (err) => {
        if (err && !err.message.includes('duplicate column')) return callback(err);
        callback(null);
      });
    });
  }
};
