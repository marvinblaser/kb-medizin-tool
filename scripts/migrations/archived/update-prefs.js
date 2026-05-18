const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/database.db');

db.serialize(() => {
    db.run("ALTER TABLE users ADD COLUMN pref_mail_assign INTEGER DEFAULT 1", () => {});
    db.run("ALTER TABLE users ADD COLUMN pref_mail_mention INTEGER DEFAULT 1", () => {
        console.log("✅ Options de préférences ajoutées avec succès pour tous les utilisateurs !");
    });
});
setTimeout(() => db.close(), 1000);