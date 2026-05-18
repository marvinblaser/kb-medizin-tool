// server/migrations/005_align_stk_tests.js
// Aligne la table report_stk_tests sur ce que le code utilise réellement
// (device_name, is_included). Si la table a été créée avec test_name/included
// par initDatabase(), on renomme les colonnes proprement.

function up(db, done) {
  db.all('PRAGMA table_info(report_stk_tests)', (err, columns) => {
    if (err) return done(err);

    const names = columns.map((c) => c.name);

    // Cas 1 : la BDD utilise test_name → renommer en device_name
    // Cas 2 : déjà device_name → rien à faire
    const renames = [];
    if (names.includes('test_name') && !names.includes('device_name')) {
      renames.push('ALTER TABLE report_stk_tests RENAME COLUMN test_name TO device_name');
    }
    if (names.includes('included') && !names.includes('is_included')) {
      renames.push('ALTER TABLE report_stk_tests RENAME COLUMN included TO is_included');
    }

    if (renames.length === 0) return done(null);

    let pending = renames.length;
    let failed = null;
    renames.forEach((sql) => {
      db.run(sql, (err) => {
        if (err && !err.message.includes('duplicate column')) failed = err;
        pending--;
        if (pending === 0) done(failed);
      });
    });
  });
}

module.exports = { up };
