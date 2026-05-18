// server/migrations/013_loans.js

module.exports = {
  up: (db, done) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS loan_devices (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          name          TEXT NOT NULL,
          brand         TEXT,
          serial_number TEXT,
          status        TEXT DEFAULT 'Disponible',
          notes         TEXT,
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS loans (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id            INTEGER NOT NULL REFERENCES loan_devices(id) ON DELETE CASCADE,
          client_id            INTEGER REFERENCES clients(id) ON DELETE SET NULL,
          start_date           DATE NOT NULL,
          expected_return_date DATE,
          actual_return_date   DATE,
          reason               TEXT,
          notes                TEXT,
          return_condition     TEXT,
          return_notes         TEXT,
          status               TEXT DEFAULT 'En cours',
          created_by           INTEGER REFERENCES users(id),
          created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, done);
    });
  }
};