// server/migrations/008_contract_prices.js
// Table des tarifs contractuels — liée à la table materials existante

module.exports = {
  up: (db, done) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS contract_prices (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        brand       TEXT NOT NULL,
        model       TEXT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        notes       TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, done);
  }
};