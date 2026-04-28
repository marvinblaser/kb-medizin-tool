// server/migrations/runner.js
// Système de migrations versionnées
// S'exécute automatiquement au démarrage via initDatabase()

const path = require('path');
const fs = require('fs');

/**
 * Exécute toutes les migrations en attente dans l'ordre numérique.
 * Une table `_migrations` dans la BDD trace les migrations déjà appliquées.
 *
 * @param {object} db - Instance de la base de données (sqlite3)
 */
async function runMigrations(db) {
  return new Promise((resolve, reject) => {
    // 1. Crée la table de suivi si elle n'existe pas encore
    db.run(
      `CREATE TABLE IF NOT EXISTS _migrations (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        filename  TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      (err) => {
        if (err) return reject(err);

        // 2. Récupère les migrations déjà appliquées
        db.all('SELECT filename FROM _migrations', (err, rows) => {
          if (err) return reject(err);

          const applied = new Set(rows.map((r) => r.filename));

          // 3. Lit le dossier migrations/ et trie par nom (ordre numérique)
          const migrationsDir = path.join(__dirname);
          let files;
          try {
            files = fs
              .readdirSync(migrationsDir)
              .filter((f) => f.match(/^\d+_.+\.js$/) && f !== 'runner.js')
              .sort();
          } catch (e) {
            return reject(e);
          }

          const pending = files.filter((f) => !applied.has(f));

          if (pending.length === 0) {
            console.log('✅ Base de données à jour (aucune migration en attente)');
            return resolve();
          }

          console.log(`🔄 ${pending.length} migration(s) à appliquer...`);

          // 4. Exécute les migrations une par une, dans l'ordre
          const runNext = (index) => {
            if (index >= pending.length) {
              console.log('✅ Toutes les migrations appliquées.');
              return resolve();
            }

            const filename = pending[index];
            const migration = require(path.join(migrationsDir, filename));

            if (typeof migration.up !== 'function') {
              return reject(
                new Error(`Migration ${filename} n'exporte pas de fonction 'up'`)
              );
            }

            console.log(`  ▶ ${filename}`);
            migration.up(db, (err) => {
              if (err) {
                console.error(`  ❌ Échec : ${filename}`);
                return reject(err);
              }

              // Marque la migration comme appliquée
              db.run(
                'INSERT INTO _migrations (filename) VALUES (?)',
                [filename],
                (err) => {
                  if (err) return reject(err);
                  console.log(`  ✓ ${filename}`);
                  runNext(index + 1);
                }
              );
            });
          };

          runNext(0);
        });
      }
    );
  });
}

module.exports = { runMigrations };
