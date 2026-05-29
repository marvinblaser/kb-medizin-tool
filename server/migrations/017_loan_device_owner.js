module.exports = {
  id: '017_loan_device_owner',
  up(db, callback) {
    db.run(
      `ALTER TABLE loan_devices ADD COLUMN owner TEXT NOT NULL DEFAULT 'Non défini'`,
      (err) => {
        if (err && !err.message.includes('duplicate column')) return callback(err);

        // Récupère le device_owner le plus fréquent par appareil
        // depuis les prêts existants et l'applique au catalogue
        db.run(`
          UPDATE loan_devices
          SET owner = (
            SELECT device_owner
            FROM loans
            WHERE loans.device_id = loan_devices.id
              AND device_owner IS NOT NULL
              AND device_owner != ''
            GROUP BY device_owner
            ORDER BY COUNT(*) DESC
            LIMIT 1
          )
          WHERE EXISTS (
            SELECT 1 FROM loans
            WHERE loans.device_id = loan_devices.id
              AND device_owner IS NOT NULL
              AND device_owner != ''
          )`,
          (err2) => {
            if (err2) return callback(err2);
            callback(null);
          }
        );
      }
    );
  }
};