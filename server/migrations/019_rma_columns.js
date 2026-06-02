// server/migrations/019_rma_columns.js
module.exports = {
  id: '019_rma_columns',
  up(db, callback) {
    db.run(`
      CREATE TABLE IF NOT EXISTS rma_columns (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        color       TEXT    NOT NULL DEFAULT '#6366f1',
        position    INTEGER NOT NULL DEFAULT 0,
        is_protected INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    DEFAULT (datetime('now'))
      )`, (err) => {
      if (err) return callback(err);

      // Seed avec les colonnes existantes
      const stages = [
        ['Déclaration du problème',    '#6366f1', 0, 0],
        ['Transit vers Xion',          '#8b5cf6', 1, 0],
        ['Réception Xion',             '#3b82f6', 2, 0],
        ['RMA Offre Reçu ?',           '#f59e0b', 3, 0],
        ['Devis au client',            '#f97316', 4, 0],
        ['Validation KB Med + Xion',   '#10b981', 5, 0],
        ['En réparation',              '#ef4444', 6, 0],
        ['Transit vers KB',            '#06b6d4', 7, 0],
        ["Attente d'installation",     '#84cc16', 8, 0],
        ['Livraison + Facturation',    '#10b981', 9, 0],
        ['Archives',                   '#94a3b8', 10, 1], // protégée
      ];

      const stmt = db.prepare(
        'INSERT OR IGNORE INTO rma_columns (name, color, position, is_protected) VALUES (?, ?, ?, ?)'
      );
      stages.forEach(s => stmt.run(s));
      stmt.finalize((err2) => {
        if (err2) return callback(err2);
        callback(null);
      });
    });
  }
};