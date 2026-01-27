// server/routes/dashboard.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// --- STATISTIQUES GLOBALES ---
router.get('/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // Requêtes SQL
  const sqlClients = `SELECT count(*) as count FROM clients`;
  const sqlExpired = `SELECT count(*) as count FROM client_equipment WHERE next_maintenance_date < ?`;
  
  // "RDV à fixer" = Machines qui expirent dans les 60 prochains jours (et pas avant aujourd'hui)
  const sqlWarning = `
    SELECT count(*) as count 
    FROM client_equipment 
    WHERE next_maintenance_date >= ? 
    AND next_maintenance_date <= date(?, '+60 days')
  `;

  const sqlEquipment = `SELECT count(*) as count FROM client_equipment`;

  // Clients à jour = Ceux qui n'ont AUCUNE machine expirée
  const sqlClientsStatus = `
    SELECT c.id, SUM(CASE WHEN ce.next_maintenance_date < ? THEN 1 ELSE 0 END) as expired_eq
    FROM clients c
    LEFT JOIN client_equipment ce ON c.id = ce.client_id
    GROUP BY c.id
  `;

  db.serialize(() => {
    let stats = {};

    db.get(sqlClients, [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      stats.totalClients = row.count;

      db.get(sqlExpired, [today], (err, row) => {
        stats.maintenanceExpired = row.count;

        db.get(sqlWarning, [today, today], (err, row) => {
          stats.appointmentsToSchedule = row.count;

          db.get(sqlEquipment, [], (err, row) => {
            stats.equipmentInstalled = row.count;

            db.all(sqlClientsStatus, [today], (err, rows) => {
              const upToDateCount = rows.filter(r => r.expired_eq === 0).length;
              stats.clientsUpToDate = upToDateCount;
              res.json(stats);
            });
          });
        });
      });
    });
  });
});

// --- DÉTAILS POUR LES POPUPS (NOUVEAU) ---
router.get('/details', requireAuth, (req, res) => {
    const { type } = req.query; // 'expired' ou 'warning'
    const today = new Date().toISOString().split('T')[0];
    
    let sql = `
        SELECT 
            c.id as client_id, c.cabinet_name, c.city, c.phone,
            ce.id as equipment_id, ce.serial_number, ce.location, ce.next_maintenance_date,
            ec.name, ec.brand, ec.model
        FROM client_equipment ce
        JOIN clients c ON ce.client_id = c.id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE 1=1
    `;
    
    let params = [];

    if (type === 'expired') {
        // Strictement expiré (< Aujourd'hui)
        sql += ` AND ce.next_maintenance_date < ?`;
        params.push(today);
    } else if (type === 'warning') {
        // Strictement bientôt (Entre Aujourd'hui et +60 jours)
        sql += ` AND ce.next_maintenance_date >= ? AND ce.next_maintenance_date <= date(?, '+60 days')`;
        params.push(today, today);
    } else {
        return res.json([]);
    }

    sql += ` ORDER BY ce.next_maintenance_date ASC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- WIDGETS ---

// Prochains RDV
router.get('/upcoming-appointments', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT c.cabinet_name, c.city, c.phone, c.appointment_at, u.name as technician_name
    FROM clients c
    LEFT JOIN users u ON c.technician_id = u.id
    WHERE c.appointment_at >= ?
    ORDER BY c.appointment_at ASC
    LIMIT 5
  `;
  db.all(sql, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Clients à contacter (Maintenance expirée - Top 5)
router.get('/clients-to-contact', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT DISTINCT c.cabinet_name, c.phone, MIN(ce.next_maintenance_date) as maintenance_due_date
    FROM clients c
    JOIN client_equipment ce ON c.id = ce.client_id
    WHERE ce.next_maintenance_date < ?
    GROUP BY c.id
    ORDER BY maintenance_due_date ASC
    LIMIT 5
  `;
  db.all(sql, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Carte
router.get('/clients-map', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT 
      c.id, c.cabinet_name, c.contact_name, c.address, c.city, c.postal_code, c.phone, c.canton,
      c.latitude, c.longitude,
      SUM(CASE WHEN ce.next_maintenance_date < ? THEN 1 ELSE 0 END) as expired_count,
      MIN(ce.next_maintenance_date) as next_date
    FROM clients c
    LEFT JOIN client_equipment ce ON c.id = ce.client_id
    GROUP BY c.id
  `;

  db.all(sql, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const clients = rows.map(row => {
      let status = 'ok';
      if (row.expired_count > 0) status = 'expired';
      else if (row.next_date) {
        // Pour la carte, on peut garder 60 jours aussi pour être cohérent
        const days = Math.ceil((new Date(row.next_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (days >= 0 && days <= 60) status = 'warning';
      }
      return { ...row, status };
    });
    
    res.json(clients);
  });
});

module.exports = router;