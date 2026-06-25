// server/migrations/020_loan_device_archived.js
module.exports = {
  id: '020_loan_device_archived',
  up(db, callback) {
    db.run(
      `ALTER TABLE loan_devices ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`,
      (err) => {
        if (err && !err.message.includes('duplicate column')) return callback(err);
        callback(null);
      }
    );
  }
};