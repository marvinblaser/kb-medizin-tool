// server/migrations/016_loans_rma_link.js
// Ajoute le lien RMA et l'info propriétaire à la table loans

module.exports = {
  id: '016_loans_rma_link',
  up(db, callback) {
    db.run('ALTER TABLE loans ADD COLUMN rma_id INTEGER', (err) => {
      if (err && !err.message.includes('duplicate column')) return callback(err);
      db.run("ALTER TABLE loans ADD COLUMN device_owner TEXT NOT NULL DEFAULT 'KB Med'", (err) => {
        if (err && !err.message.includes('duplicate column')) return callback(err);
        callback(null);
      });
    });
  }
};