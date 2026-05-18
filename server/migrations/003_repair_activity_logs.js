// server/migrations/003_repair_activity_logs.js
// Ajoute la colonne details à activity_logs si absente.

function up(db, done) {
  db.run(
    'ALTER TABLE activity_logs ADD COLUMN details TEXT',
    (err) => {
      if (err && !err.message.includes('duplicate column name')) return done(err);
      done(null);
    }
  );
}

module.exports = { up };
