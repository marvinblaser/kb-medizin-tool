// server/cron.js
const { db } = require('./config/database');

// Variable pour mémoriser le dernier jour d'exécution (évite de spammer à chaque redémarrage)
let lastRunDate = null;

const checkExpirations = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Sécurité : on ne lance les alertes qu'une seule fois par jour
    if (lastRunDate === todayStr) return;

    console.log("⏳ [CRON] Vérification des expirations de machines...");

    // Petite fonction pour calculer les dates futures exactement
    const getTargetDate = (daysToAdd) => {
        const d = new Date();
        d.setDate(d.getDate() + daysToAdd);
        return d.toISOString().split('T')[0];
    };

    const in30 = getTargetDate(30);
    const in7 = getTargetDate(7);
    const today = getTargetDate(0);

    // REQUÊTE INTELLIGENTE : 
    // - Cherche J-30, J-7 et Jour J
    // - Exclut les machines "Secondaires / Hors contrat"
    // - Exclut les clients masqués
    // - EXCLUT les clients qui ont un RDV futur !
    const sql = `
        SELECT 
            ce.id as equipment_id, 
            ce.next_maintenance_date, 
            c.id as client_id, 
            c.cabinet_name, 
            ec.name, 
            ec.brand
        FROM client_equipment ce
        JOIN clients c ON ce.client_id = c.id
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE 
            (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
            AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
            AND (c.is_hidden = 0 OR c.is_hidden IS NULL)
            AND ce.next_maintenance_date IN (?, ?, ?)
            AND NOT EXISTS (
                SELECT 1 FROM appointments_history ah 
                WHERE ah.client_id = c.id AND ah.appointment_date >= ?
            )
    `;

    db.all(sql, [in30, in7, today, today], (err, rows) => {
        if (err) {
            console.error("Erreur Cron Expirations:", err.message);
            return;
        }

        if (rows && rows.length > 0) {
            // Qui reçoit les alertes ? Admins et Secrétariat
            db.all("SELECT id FROM users WHERE role IN ('admin', 'secretary', 'sales_director')", [], (err, users) => {
                if (err || !users) return;

                rows.forEach(row => {
                    let msg = "";
                    let type = "warning";

                    if (row.next_maintenance_date === in30) {
                        msg = `⏳ Dans 30 jours : Maintenance requise pour ${row.brand} ${row.name} chez ${row.cabinet_name}.`;
                    } else if (row.next_maintenance_date === in7) {
                        msg = `⚠️ Urgent (J-7) : Maintenance requise pour ${row.brand} ${row.name} chez ${row.cabinet_name}.`;
                    } else if (row.next_maintenance_date === today) {
                        msg = `❌ EXPIRÉ AUJOURD'HUI : ${row.brand} ${row.name} chez ${row.cabinet_name}. Aucun RDV fixé !`;
                        type = "error"; // Toast Rouge
                    }

                    // Envoi des notifications
                    users.forEach(u => {
                        db.run("INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)",
                            [u.id, type, msg, `/clients.html?open=${row.client_id}`]
                        );
                    });
                });
            });
        }

        lastRunDate = todayStr; // On valide que le job a été fait pour aujourd'hui
        console.log(`✅ [CRON] Vérification terminée. ${rows ? rows.length : 0} alertes envoyées.`);
    });
};

const initCronJobs = () => {
    // 1. Exécuter une première fois au démarrage du serveur
    checkExpirations();
    
    // 2. Vérifier toutes les heures (3 600 000 ms)
    // S'il est 1h du matin et qu'on a changé de jour, la fonction lancera l'alerte !
    setInterval(checkExpirations, 3600000);
};

module.exports = { initCronJobs };