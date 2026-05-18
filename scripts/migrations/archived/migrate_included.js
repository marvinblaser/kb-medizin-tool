// migrate_included.js
const { db } = require('./server/config/database');

console.log("--- Démarrage de la migration : Ajout colonne 'included' ---");

// Commande SQL pour ajouter la colonne
const sql = "ALTER TABLE report_materials ADD COLUMN included INTEGER DEFAULT 0";

db.run(sql, function(err) {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log("⚠️  La colonne 'included' existe déjà. Aucune action nécessaire.");
        } else {
            console.error("❌ Erreur critique :", err.message);
        }
    } else {
        console.log("✅ Succès : La colonne 'included' a été ajoutée à 'report_materials'.");
    }
    
    // On ferme proprement (attendre un peu que le log sorte)
    setTimeout(() => {
        console.log("--- Migration terminée ---");
        process.exit(0);
    }, 500);
});