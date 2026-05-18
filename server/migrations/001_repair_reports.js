// server/migrations/001_repair_reports.js
// Ajoute les colonnes manquantes à la table reports.
// Idempotente : l'erreur "duplicate column name" est ignorée.

function up(db, done) {
  const columns = [
    { name: 'author_id',    sql: 'ALTER TABLE reports ADD COLUMN author_id INTEGER REFERENCES users(id)' },
    { name: 'validator_id', sql: 'ALTER TABLE reports ADD COLUMN validator_id INTEGER REFERENCES users(id)' },
    { name: 'status',       sql: "ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'draft'" },
  ];

  let pending = columns.length;
  let failed = null;

  columns.forEach(({ name, sql }) => {
    db.run(sql, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        failed = err;
      } else if (err) {
        // Colonne déjà présente, c'est OK
      }
      pending--;
      if (pending === 0) done(failed);
    });
  });
}

module.exports = { up };
