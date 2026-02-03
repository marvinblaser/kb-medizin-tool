const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// --- STATISTIQUES GLOBALES (FILTRÉES) ---
router.get('/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const sqlClients = `SELECT count(*) as count FROM clients`;

  // 1. MAINTENANCES EXPIRÉES (Filtre: Pas de RDV futur ET Pas secondaire)
  const sqlExpired = `
    SELECT count(*) as count 
    FROM client_equipment ce
    JOIN clients c ON ce.client_id = c.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.next_maintenance_date < ?
    AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL) -- EXCLURE SECONDAIRES
    AND NOT EXISTS (
        SELECT 1 FROM appointments_history ah 
        WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
    )
  `;
  
  // 2. À FIXER / BIENTÔT (Filtre: Pas de RDV futur ET Pas secondaire)
  const sqlWarning = `
    SELECT count(*) as count 
    FROM client_equipment ce
    JOIN clients c ON ce.client_id = c.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.next_maintenance_date >= ? 
    AND ce.next_maintenance_date <= date(?, '+60 days')
    AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL) -- EXCLURE SECONDAIRES
    AND NOT EXISTS (
        SELECT 1 FROM appointments_history ah 
        WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
    )
  `;

  const sqlEquipment = `SELECT count(*) as count FROM client_equipment`;

  // 3. STATUT CLIENTS (Mise à jour pour ignorer les appareils secondaires dans le calcul)
  const sqlClientsStatus = `
    SELECT 
        c.id, 
        SUM(CASE 
            WHEN ce.next_maintenance_date < ? 
            AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL) 
            THEN 1 ELSE 0 END
        ) as expired_eq,
        (SELECT count(*) FROM appointments_history ah WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')) as has_rdv
    FROM clients c
    LEFT JOIN client_equipment ce ON c.id = ce.client_id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    GROUP BY c.id
  `;

  db.serialize(() => {
    let stats = {};
    db.get(sqlClients, [], (err, row) => {
      stats.totalClients = row.count;
      db.get(sqlExpired, [today], (err, row) => {
        stats.maintenanceExpired = row.count;
        db.get(sqlWarning, [today, today], (err, row) => {
          stats.appointmentsToSchedule = row.count;
          db.get(sqlEquipment, [], (err, row) => {
            stats.equipmentInstalled = row.count;
            db.all(sqlClientsStatus, [today], (err, rows) => {
              const upToDateCount = rows.filter(r => r.expired_eq === 0 || r.has_rdv > 0).length;
              stats.clientsUpToDate = upToDateCount;
              res.json(stats);
            });
          });
        });
      });
    });
  });
});

// --- LISTES DÉTAILLÉES ---
router.get('/details', requireAuth, (req, res) => {
    const { type } = req.query; 
    const today = new Date().toISOString().split('T')[0];
    
    let sql = `
        SELECT 
            c.id as client_id, c.cabinet_name, c.city, c.phone,
            ce.id as equipment_id, ce.serial_number, ce.location, ce.next_maintenance_date,
            ec.name, ec.brand, ec.model, ec.is_secondary
        FROM client_equipment ce
        JOIN clients c ON ce.client_id = c.id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE (ec.is_secondary = 0 OR ec.is_secondary IS NULL) -- FILTRE GLOBAL
        AND NOT EXISTS (
            SELECT 1 FROM appointments_history ah 
            WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
        )
    `;
    
    let params = [];
    if (type === 'expired') {
        sql += ` AND ce.next_maintenance_date < ?`;
        params.push(today);
    } else if (type === 'warning') {
        sql += ` AND ce.next_maintenance_date >= ? AND ce.next_maintenance_date <= date(?, '+60 days')`;
        params.push(today, today);
    } else { return res.json([]); }

    sql += ` ORDER BY ce.next_maintenance_date ASC`;
    db.all(sql, params, (err, rows) => res.json(rows));
});

// --- WIDGETS ---
// 1. Prochains RDV (Inchangé)
router.get('/upcoming-appointments', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT 
        ah.id as appointment_id, ah.appointment_date, 
        c.id as client_id, c.cabinet_name, c.city, c.phone,
        (SELECT group_concat(u.name, ', ') FROM appointment_technicians at JOIN users u ON at.user_id = u.id WHERE at.appointment_id = ah.id) as technician_names
    FROM appointments_history ah
    JOIN clients c ON ah.client_id = c.id
    WHERE ah.appointment_date >= ?
    ORDER BY ah.appointment_date ASC LIMIT 100
  `;
  db.all(sql, [today], (err, rows) => res.json(rows));
});

// 2. À Contacter (Filtre Secondary)
router.get('/clients-to-contact', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT DISTINCT c.id, c.cabinet_name, c.phone, MIN(ce.next_maintenance_date) as maintenance_due_date
    FROM clients c
    JOIN client_equipment ce ON c.id = ce.client_id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.next_maintenance_date < ?
    AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL) -- FILTRE
    AND NOT EXISTS (
        SELECT 1 FROM appointments_history ah 
        WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
    )
    GROUP BY c.id
    ORDER BY maintenance_due_date ASC LIMIT 100
  `;
  db.all(sql, [today], (err, rows) => res.json(rows));
});

// 3. Carte (Filtre Secondary dans le SUM)
router.get('/clients-map', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT 
      c.id, c.cabinet_name, c.contact_name, c.address, c.city, c.postal_code, c.phone, c.canton,
      c.latitude, c.longitude,
      SUM(CASE 
        WHEN ce.next_maintenance_date < ? 
        AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL) 
        THEN 1 ELSE 0 END
      ) as expired_count,
      (SELECT count(*) FROM appointments_history ah WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')) as future_rdv
    FROM clients c
    LEFT JOIN client_equipment ce ON c.id = ce.client_id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    GROUP BY c.id
  `;
  db.all(sql, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const clients = rows.map(row => {
      let status = 'ok';
      if (row.future_rdv > 0) status = 'ok';
      else if (row.expired_count > 0) status = 'expired';
      // Note: On ne met pas 'warning' sur la carte pour simplifier, ou on pourrait l'ajouter avec la même logique
      return { ...row, status };
    });
    res.json(clients);
  });
});

module.exports = router;