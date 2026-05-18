// server/migrations/002_repair_report_equipment.js
// Ajoute equipment_id à report_equipment si absent.

function up(db, done) {
  db.run(
    'ALTER TABLE report_equipment ADD COLUMN equipment_id INTEGER REFERENCES equipment_catalog(id)',
    (err) => {
      if (err && !err.message.includes('duplicate column name')) return done(err);
      done(null);
    }
  );
}

module.exports = { up };
