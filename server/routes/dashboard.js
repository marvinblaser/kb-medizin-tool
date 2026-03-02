// server/routes/dashboard.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// --- STATISTIQUES GLOBALES ---
router.get('/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // 1. TOTAL CLIENTS
  const sqlClients = `SELECT count(*) as count FROM clients WHERE (is_hidden = 0 OR is_hidden IS NULL)`;

  // 2. MAINTENANCES EXPIRÉES
  const sqlExpired = `
    SELECT count(*) as count 
    FROM client_equipment ce
    JOIN clients c ON ce.client_id = c.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.next_maintenance_date < ?
    AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
    AND (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
    AND (c.is_hidden = 0 OR c.is_hidden IS NULL)
    AND NOT EXISTS (
        SELECT 1 FROM appointments_history ah 
        WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
    )
  `;
  
  // 3. À FIXER / BIENTÔT
  const sqlWarning = `
    SELECT count(*) as count 
    FROM client_equipment ce
    JOIN clients c ON ce.client_id = c.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.next_maintenance_date >= ? AND ce.next_maintenance_date <= date('now', '+30 days')
    AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
    AND (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
    AND (c.is_hidden = 0 OR c.is_hidden IS NULL)
    AND NOT EXISTS (
        SELECT 1 FROM appointments_history ah 
        WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
    )
  `;
  
  // 4. CLIENTS À JOUR
  const sqlUpToDate = `
    SELECT count(DISTINCT c.id) as count 
    FROM clients c
    WHERE (c.is_hidden = 0 OR c.is_hidden IS NULL)
    AND NOT EXISTS (
        SELECT 1 FROM client_equipment ce
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ce.client_id = c.id 
        AND ce.next_maintenance_date < date('now', '+30 days')
        AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
        AND (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
    )
  `;

  // 5. TOTAL MACHINES ACTIVES
  const sqlEquip = `
    SELECT count(*) as count 
    FROM client_equipment ce
    JOIN clients c ON ce.client_id = c.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE (c.is_hidden = 0 OR c.is_hidden IS NULL)
    AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
    AND (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
  `;

  Promise.all([
    new Promise(res => db.get(sqlClients, [], (err, row) => res(row ? row.count : 0))),
    new Promise(res => db.get(sqlExpired, [today], (err, row) => res(row ? row.count : 0))),
    new Promise(res => db.get(sqlWarning, [today], (err, row) => res(row ? row.count : 0))),
    new Promise(res => db.get(sqlUpToDate, [], (err, row) => res(row ? row.count : 0))),
    new Promise(res => db.get(sqlEquip, [], (err, row) => res(row ? row.count : 0)))
  ]).then(results => {
    res.json({
        totalClients: results[0],
        expiredMaintenances: results[1],
        soonMaintenances: results[2],
        clientsUpToDate: results[3],
        equipmentInstalled: results[4]
    });
  }).catch(e => res.status(500).json({error: e.message}));
});

// --- LISTES DÉTAILLÉES (POPUP) ---
router.get('/details', requireAuth, (req, res) => {
    const type = req.query.type; 
    const baseQuery = `
        SELECT ce.*, c.cabinet_name, c.city, ec.name as catalog_name, ec.brand 
        FROM client_equipment ce
        JOIN clients c ON ce.client_id = c.id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ce.next_maintenance_date IS NOT NULL
        AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
        AND (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
        AND (c.is_hidden = 0 OR c.is_hidden IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM appointments_history ah 
            WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
        )
    `;

    let query = "";
    if (type === 'expired') {
        query = baseQuery + ` AND ce.next_maintenance_date < date('now') ORDER BY ce.next_maintenance_date ASC`;
    } else if (type === 'warning') {
        query = baseQuery + ` AND ce.next_maintenance_date >= date('now') AND ce.next_maintenance_date <= date('now', '+30 days') ORDER BY ce.next_maintenance_date ASC`;
    } else {
        return res.json([]);
    }

    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

// --- PROCHAINS RDV ---
router.get('/upcoming-appointments', requireAuth, (req, res) => {
    const sql = `
        SELECT ah.id as appointment_id, ah.appointment_date, ah.client_id, 
               c.cabinet_name, c.city,
               (SELECT group_concat(u.name, ', ') 
                FROM appointment_technicians at 
                JOIN users u ON at.user_id = u.id 
                WHERE at.appointment_id = ah.id) as technician_names
        FROM appointments_history ah
        JOIN clients c ON ah.client_id = c.id
        WHERE ah.appointment_date >= date('now')
        ORDER BY ah.appointment_date ASC
    `;
    db.all(sql, [], (err, rows) => err ? res.status(500).json({error: err.message}) : res.json(rows));
});

// --- CLIENTS À CONTACTER ---
router.get('/clients-to-contact', requireAuth, (req, res) => {
    const sql = `
        SELECT c.id, c.cabinet_name, c.city, c.phone, 
               MIN(ce.next_maintenance_date) as maintenance_due_date
        FROM clients c
        JOIN client_equipment ce ON c.id = ce.client_id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ce.next_maintenance_date <= date('now', '+30 days')
        AND (c.is_hidden = 0 OR c.is_hidden IS NULL)
        AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
        AND (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM appointments_history ah 
            WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
        )
        GROUP BY c.id
        ORDER BY maintenance_due_date ASC
    `;
    db.all(sql, [], (err, rows) => err ? res.status(500).json({error: err.message}) : res.json(rows));
});

// --- DONNÉES CARTE ---
router.get('/clients-map', requireAuth, (req, res) => {
    const sql = `
        SELECT 
            c.id, c.cabinet_name, c.contact_name, c.latitude, c.longitude, c.city, c.canton, c.address, c.postal_code, c.phone,
            
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM appointments_history ah 
                    WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
                ) THEN 'planned'
                
                WHEN EXISTS (
                    SELECT 1 FROM client_equipment ce 
                    JOIN equipment_catalog ec ON ce.equipment_id = ec.id
                    WHERE ce.client_id = c.id 
                    AND ce.next_maintenance_date < date('now')
                    AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
                    AND (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
                ) THEN 'expired'
                
                WHEN EXISTS (
                    SELECT 1 FROM client_equipment ce 
                    JOIN equipment_catalog ec ON ce.equipment_id = ec.id
                    WHERE ce.client_id = c.id 
                    AND ce.next_maintenance_date < date('now', '+30 days')
                    AND ce.next_maintenance_date >= date('now')
                    AND (ec.is_secondary = 0 OR ec.is_secondary IS NULL)
                    AND (ce.is_secondary = 0 OR ce.is_secondary IS NULL)
                ) THEN 'warning'
                
                ELSE 'ok'
            END as status

        FROM clients c
        WHERE (c.is_hidden = 0 OR c.is_hidden IS NULL)
        AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
    `;
    db.all(sql, [], (err, rows) => err ? res.status(500).json({error: err.message}) : res.json(rows));
});

module.exports = router;