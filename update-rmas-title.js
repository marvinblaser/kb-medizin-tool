// update-rmas-title.js
const { db } = require('./server/config/database');
db.run("ALTER TABLE rmas ADD COLUMN title TEXT", (err) => {
    if (err) console.log("La colonne existe peut-être déjà.");
    else console.log("✅ Colonne 'title' ajoutée avec succès.");
});