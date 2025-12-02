const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Stats globales
router.get('/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  const queries = {
    maintenanceExpired: "SELECT COUNT(*) as count FROM client_equipment WHERE next_maintenance_date < ?",
    appointmentsToSchedule: `SELECT COUNT(DISTINCT c.id) as count FROM clients c JOIN client_equipment ce ON c.id = ce.client_id WHERE ce.next_maintenance_date < ? AND (c.appointment_at IS NULL OR c.appointment_at < ?)`,
    totalClients: "SELECT COUNT(*) as count FROM clients",
    clientsUpToDate: `SELECT COUNT(DISTINCT client_id) as count FROM client_equipment WHERE next_maintenance_date >= ?`,
    equipmentInstalled: "SELECT COUNT(*) as count FROM client_equipment"
  };

  db.serialize(() => {
    const results = {};
    let completed = 0;
    const keys = Object.keys(queries);
    keys.forEach(key => {
      let params = (key === 'appointmentsToSchedule') ? [today, today] : [today];
      if (key === 'totalClients' || key === 'equipmentInstalled') params = [];
      
      db.get(queries[key], params, (err, row) => {
        if (err) console.error(err);
        results[key] = row ? row.count : 0;
        completed++;
        if (completed === keys.length) res.json(results);
      });
    });
  });
});

// Prochains RDV (FIX: JOIN pour afficher le nom du technicien)
router.get('/upcoming-appointments', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT c.cabinet_name, c.appointment_at, c.phone, c.city, u.name as technician_name 
    FROM clients c
    LEFT JOIN users u ON c.technician_id = u.id
    WHERE c.appointment_at >= ?
    ORDER BY c.appointment_at ASC
    LIMIT 10
  `;
  db.all(sql, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Clients à contacter
router.get('/clients-to-contact', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT DISTINCT c.id, c.cabinet_name, c.phone, c.maintenance_due_date, c.city
    FROM clients c
    JOIN client_equipment ce ON c.id = ce.client_id
    WHERE ce.next_maintenance_date < ?
    AND (c.appointment_at IS NULL OR c.appointment_at < ?)
    ORDER BY ce.next_maintenance_date ASC
    LIMIT 10
  `;
  db.all(sql, [today, today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Carte des clients (Avec Lat/Lon pour placement précis)
router.get('/clients-map', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const warningDate = new Date();
  warningDate.setDate(warningDate.getDate() + 30);
  const warningStr = warningDate.toISOString().split('T')[0];

  const sql = `
    SELECT 
      c.id, c.cabinet_name, c.contact_name, c.activity, 
      c.address, c.postal_code, c.city, c.canton, 
      c.phone, c.email, c.latitude, c.longitude,
      MIN(ce.next_maintenance_date) as next_maint
    FROM clients c
    LEFT JOIN client_equipment ce ON c.id = ce.client_id
    GROUP BY c.id
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const clients = rows.map(c => {
      let status = 'ok';
      if (!c.next_maint) status = 'ok';
      else if (c.next_maint < today) status = 'expired';
      else if (c.next_maint <= warningStr) status = 'warning';
      return { ...c, status };
    });
    res.json(clients);
  });
});

module.exports = router;