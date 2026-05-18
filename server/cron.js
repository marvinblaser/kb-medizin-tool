// server/cron.js
const { db } = require('./config/database');

// Variable pour mémoriser le dernier jour d'exécution (évite de spammer à chaque redémarrage)
let lastRunDate = null;
let lastBexioDate  = null; // ← nouveau

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

const checkLoanReminders = () => {
  const todayStr = new Date().toISOString().split('T')[0];
 
  // J-3 : retour prévu dans 3 jours
  const in3Days = new Date();
  in3Days.setDate(in3Days.getDate() + 3);
  const in3Str = in3Days.toISOString().split('T')[0];
 
  // Prêts en retard depuis exactement 7 jours (rappel hebdo)
  const minus7 = new Date();
  minus7.setDate(minus7.getDate() - 7);
 
  const sql = `
    SELECT l.id, l.expected_return_date, l.start_date,
      d.name as device_name, c.cabinet_name
    FROM loans l
    LEFT JOIN loan_devices d ON l.device_id = d.id
    LEFT JOIN clients c ON l.client_id = c.id
    WHERE l.status = 'En cours'
    AND (
      l.expected_return_date = ?
      OR l.expected_return_date = ?
      OR (l.expected_return_date < ? AND (CAST(julianday(?) - julianday(l.expected_return_date) AS INTEGER)) % 7 = 0)
    )
  `;
 
  db.all(sql, [in3Str, todayStr, todayStr, todayStr], (err, loans) => {
    if (err || !loans?.length) return;
 
    // Qui notifier : admins + secrétaires
    db.all("SELECT id FROM users WHERE role IN ('admin', 'secretary') AND is_active = 1", [], (err, users) => {
      if (err || !users?.length) return;
 
      loans.forEach(loan => {
        const isToday   = loan.expected_return_date === todayStr;
        const isIn3Days = loan.expected_return_date === in3Str;
        const isOverdue = loan.expected_return_date < todayStr;
 
        let msg = '';
        if (isToday) {
          msg = `🚨 Retour prévu AUJOURD'HUI : ${loan.device_name}${loan.cabinet_name ? ` chez ${loan.cabinet_name}` : ''}.`;
        } else if (isIn3Days) {
          msg = `🔔 Retour prévu dans 3 jours : ${loan.device_name}${loan.cabinet_name ? ` chez ${loan.cabinet_name}` : ''}.`;
        } else if (isOverdue) {
          const days = Math.floor((new Date() - new Date(loan.expected_return_date)) / 86400000);
          msg = `🚨 Appareil en retard depuis ${days} jours : ${loan.device_name}${loan.cabinet_name ? ` chez ${loan.cabinet_name}` : ''}.`;
        }
 
        if (msg) {
          users.forEach(u => {
            db.run(
              "INSERT INTO notifications (user_id, type, message, link) VALUES (?, 'warning', ?, '/loans.html')",
              [u.id, msg]
            );
          });
        }
      });
 
      console.log(`✅ [CRON] ${loans.length} rappel(s) prêt(s) envoyé(s).`);
    });
  });
};

// ─── Sync Bexio ──────────────────────────────────────────────────────────────
const syncBexioIfNeeded = async () => {
    if (!process.env.BEXIO_API_TOKEN) return; // Token non configuré → skip

    const todayStr = new Date().toISOString().split('T')[0];
    if (lastBexioDate === todayStr) return; // Déjà fait aujourd'hui

    try {
        console.log('⏳ [CRON] Sync Bexio automatique...');
        const { syncBexio } = require('./routes/bexio');
        const result = await syncBexio();
        console.log(`✅ [CRON] Bexio sync : ${result.message}`);
        lastBexioDate = todayStr;
    } catch (e) {
        console.error('❌ [CRON] Bexio sync échouée:', e.message);
    }
};

// ─── Init ────────────────────────────────────────────────────────────────────
const initCronJobs = () => {
    checkExpirations();
    syncBexioIfNeeded(); // ← sync au démarrage
    checkLoanReminders(); // ← sync au démarrage

    // Vérifie toutes les heures
    setInterval(() => {
        checkExpirations();
        syncBexioIfNeeded();
        checkLoanReminders(); // ← sync une fois par jour via l'intervalle horaire
    }, 3600000);
};

module.exports = { initCronJobs };