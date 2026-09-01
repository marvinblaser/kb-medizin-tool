// server/migrations/024_ticket_escalation.js
// Ajoute la colonne de suivi d'escalade SLA (anti-spam : pas de relance avant 24h).

module.exports = {
  id: '024_ticket_escalation',
  up(db, callback) {
    db.all('PRAGMA table_info(tickets)', [], (err, cols) => {
      if (err) return callback(err);
      if (cols.some((c) => c.name === 'last_escalated_at')) return callback(null);
      db.run(`ALTER TABLE tickets ADD COLUMN last_escalated_at TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) return callback(err);
        callback(null);
      });
    });
  }
};
