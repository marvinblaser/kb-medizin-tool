// server/migrations/012_app_settings.js
// Table clé-valeur pour les paramètres de l'application (rappels, préférences...)

module.exports = {
  up: (db, done) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, done);
  }
};