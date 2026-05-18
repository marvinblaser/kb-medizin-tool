// server/migrations/014_users_pref_mail.js
// Ajoute les colonnes de préférences e-mail manquantes sur la table users
module.exports = {
  up: (db, done) => {
    db.all('PRAGMA table_info(users)', [], (err, cols) => {
      if (err) return done(err);
 
      const existing = cols.map(c => c.name);
      const toAdd = [
        { name: 'pref_mail_comment', def: 'INTEGER DEFAULT 1' },
        { name: 'pref_mail_status',  def: 'INTEGER DEFAULT 1' },
        { name: 'pref_mail_mention', def: 'INTEGER DEFAULT 1' },
      ].filter(c => !existing.includes(c.name));
 
      if (toAdd.length === 0) return done();
 
      let remaining = toAdd.length;
      toAdd.forEach(col => {
        db.run(
          `ALTER TABLE users ADD COLUMN ${col.name} ${col.def}`,
          err => {
            if (err) return done(err);
            if (--remaining === 0) done();
          }
        );
      });
    });
  }
};
 