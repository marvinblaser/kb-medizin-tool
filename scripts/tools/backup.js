// Fichier : backup.js
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
// Chemin vers votre base de données actuelle
const sourceDB = path.join(__dirname, 'server/database.db');

// Dossier où stocker les backups (créé automatiquement s'il n'existe pas)
const backupDir = path.join(__dirname, 'backups');

// Nombre de jours à garder avant suppression automatique
const RETENTION_DAYS = 7;

// --- FONCTIONS ---

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const cleanOldBackups = () => {
    fs.readdir(backupDir, (err, files) => {
        if (err) return console.error("Erreur lecture dossier backup:", err);

        const now = Date.now();
        const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;

        files.forEach(file => {
            const filePath = path.join(backupDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                
                // Si le fichier est plus vieux que la limite
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlink(filePath, (err) => {
                        if (err) console.error(`Erreur suppression ${file}:`, err);
                        else console.log(`Nettoyage : ${file} supprimé (trop vieux).`);
                    });
                }
            });
        });
    });
};

const performBackup = () => {
    ensureDir(backupDir);

    // Formatage de la date YYYY-MM-DD_HH-MM
    const date = new Date();
    const dateStr = date.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const destName = `database_${dateStr}.db`;
    const destPath = path.join(backupDir, destName);

    // Copie du fichier
    fs.copyFile(sourceDB, destPath, (err) => {
        if (err) {
            console.error("ERREUR CRITIQUE DE SAUVEGARDE :", err);
        } else {
            console.log(`✅ Sauvegarde réussie : ${destName}`);
            // Après la copie, on nettoie les vieux fichiers
            cleanOldBackups();
        }
    });
};

// Lancement
console.log("Démarrage du processus de sauvegarde...");
performBackup();