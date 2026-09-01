// server/migrations/022_ticket_urgent_backfill.js
// Fusionne l'ancien flag is_urgent dans priority avant que l'app arrête de le lire.
// La colonne is_urgent n'est pas supprimée (pas de DROP COLUMN destructif),
// elle devient simplement inerte.

module.exports = {
  id: '022_ticket_urgent_backfill',
  up(db, callback) {
    db.run(
      `UPDATE tickets SET priority = 'Urgente' WHERE is_urgent = 1 AND priority != 'Urgente'`,
      (err) => callback(err || null)
    );
  }
};
