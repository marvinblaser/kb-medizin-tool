// server/migrations/023_ticket_reads.js
// Table de suivi "dernière consultation" par utilisateur, pour l'indicateur non-lu.

module.exports = {
  id: '023_ticket_reads',
  up(db, callback) {
    db.run(
      `CREATE TABLE IF NOT EXISTS ticket_reads (
        ticket_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (ticket_id, user_id),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      (err) => callback(err || null)
    );
  }
};
