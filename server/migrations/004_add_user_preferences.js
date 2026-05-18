// server/migrations/004_add_user_preferences.js
// Ajoute les colonnes de préférences mail à la table users.

function up(db, done) {
  const columns = [
    'ALTER TABLE users ADD COLUMN pref_mail_assign INTEGER DEFAULT 1',
    'ALTER TABLE users ADD COLUMN pref_mail_mention INTEGER DEFAULT 1',
  ];

  let pending = columns.length;
  let failed = null;

  columns.forEach((sql) => {
    db.run(sql, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        failed = err;
      }
      pending--;
      if (pending === 0) done(failed);
    });
  });
}

module.exports = { up };
