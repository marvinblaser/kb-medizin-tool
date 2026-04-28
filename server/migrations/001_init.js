// server/migrations/001_init.js
// ─────────────────────────────────────────────────────────────────────────────
// MODÈLE À SUIVRE pour toutes les futures migrations
//
// Convention de nommage : NNN_description-courte.js
//   - NNN = numéro à 3 chiffres, incrémenté à chaque nouvelle migration
//   - Exemples : 002_add_author_column.js / 003_create_rmas_table.js
//
// Chaque fichier DOIT exporter une fonction `up(db, callback)`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applique la migration.
 * @param {object} db - Instance sqlite3
 * @param {function} done - Callback(err) à appeler une fois terminé
 */
function up(db, done) {
  // Exemple : ajouter une colonne `author` à la table `reports` si elle n'existe pas
  db.run(
    `ALTER TABLE reports ADD COLUMN author TEXT`,
    (err) => {
      // SQLite renvoie une erreur si la colonne existe déjà.
      // On l'ignore pour rendre la migration idempotente.
      if (err && !err.message.includes('duplicate column name')) {
        return done(err);
      }
      done(null);
    }
  );
}

module.exports = { up };
