// server/migrations/027_ticket_blocked_status.js
// Remplace le statut vague "En attente" par "Bloqué" + une raison de blocage
// explicite (Client / Pièce détachée / Planification / Autre), pour que l'équipe
// (technicien only, pas de secrétariat/dispatcher) sache d'un coup d'œil pourquoi
// un ticket est bloqué sans avoir à ouvrir chaque ticket.

module.exports = {
  id: '027_ticket_blocked_status',
  up(db, callback) {
    db.all('PRAGMA table_info(tickets)', [], (err, cols) => {
      if (err) return callback(err);

      const addColumn = (cb) => {
        if (cols.some((c) => c.name === 'blocked_reason')) return cb(null);
        db.run(`ALTER TABLE tickets ADD COLUMN blocked_reason TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column')) return cb(err);
          cb(null);
        });
      };

      addColumn((err) => {
        if (err) return callback(err);
        db.run(`UPDATE tickets SET status = 'Bloqué' WHERE status = 'En attente'`, (err) => {
          callback(err || null);
        });
      });
    });
  }
};
