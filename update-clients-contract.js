const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.serialize(() => {
    // Ajout de la colonne pour le statut du contrat (0 = Non, 1 = Oui)
    db.run("ALTER TABLE clients ADD COLUMN has_contract INTEGER DEFAULT 0", (err) => {
        if (err && !err.message.includes("duplicate column name")) console.error(err.message);
    });
    
    // Ajout de la colonne pour stocker le chemin du fichier PDF/Image
    db.run("ALTER TABLE clients ADD COLUMN contract_file TEXT", (err) => {
        if (err && !err.message.includes("duplicate column name")) console.error(err.message);
        else console.log("Mise à jour de la table clients terminée avec succès.");
    });
});

setTimeout(() => db.close(), 1000);