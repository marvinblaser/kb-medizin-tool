const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.db');

db.serialize(() => {
    // Statut du contrat (0 ou 1)
    db.run("ALTER TABLE clients ADD COLUMN has_contract INTEGER DEFAULT 0");
    // Chemin du fichier attaché
    db.run("ALTER TABLE clients ADD COLUMN contract_file TEXT");
    console.log("✅ Base de données mise à jour pour les contrats.");
});
db.close();