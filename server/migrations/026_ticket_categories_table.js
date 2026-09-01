// server/migrations/026_ticket_categories_table.js
// Rend les catégories de tickets gérables (admin) au lieu d'être figées dans le code.
// Seed avec les 4 catégories actuelles pour ne rien casser sur les tickets existants
// (tickets.category reste un TEXT libre, pas de FK).

module.exports = {
  id: '026_ticket_categories_table',
  up(db, callback) {
    db.run(
      `CREATE TABLE IF NOT EXISTS ticket_categories (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )`,
      (err) => {
        if (err) return callback(err);
        const seed = ['Panne machine', 'Question technique', 'Demande administrative', 'SAV / Garantie'];
        const stmt = db.prepare('INSERT OR IGNORE INTO ticket_categories (name) VALUES (?)');
        seed.forEach((name) => stmt.run(name));
        stmt.finalize((err) => callback(err || null));
      }
    );
  }
};
