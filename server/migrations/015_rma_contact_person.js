// server/migrations/015_rma_contact_person.js
// 1. Ajoute contact_person à la table rmas (remplace title)
// 2. Ajoute updated_at à rma_comments (pour l'édition de commentaires)

module.exports = {
  id: '015_rma_contact_person',
  up(db, callback) {
    db.run('ALTER TABLE rmas ADD COLUMN contact_person TEXT', (err) => {
      if (err && !err.message.includes('duplicate column')) return callback(err);
      db.run('ALTER TABLE rma_comments ADD COLUMN updated_at TEXT', (err) => {
        if (err && !err.message.includes('duplicate column')) return callback(err);
        callback(null);
      });
    });
  }
};