module.exports = {
  id: '018_stk_discount',
  up(db, callback) {
    db.run(
      `ALTER TABLE report_stk_tests ADD COLUMN discount REAL NOT NULL DEFAULT 0`,
      (err) => {
        if (err && !err.message.includes('duplicate column')) return callback(err);
        callback(null);
      }
    );
  }
};