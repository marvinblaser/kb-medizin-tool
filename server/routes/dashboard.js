const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Stats globales
router.get('/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // 1. Total clients
  const sqlClients = `SELECT count(*) as count FROM clients`;
  
  // 2. Maintenances expirées (basé sur les équipements)
  const sqlExpired = `
    SELECT count(*) as count 
    FROM client_equipment 
    WHERE next_maintenance_date < ?
  `;

  // 3. RDV à fixer (Clients avec maintenance dépassée mais sans RDV futur)
  // Simplification: on compte les clients avec équipement expiré
  const sqlAppointments = `
    SELECT count(DISTINCT client_id) as count
    FROM client_equipment
    WHERE next_maintenance_date < ?
  `;

  // 4. Équipements installés
  const sqlEquipment = `SELECT count(*) as count FROM client_equipment`;

  // 5. Calcul précis des clients à jour
  // Un client est à jour s'il n'a AUCUN équipement expiré
  const sqlClientsStatus = `
    SELECT 
      c.id,
      COUNT(ce.id) as total_eq,
      SUM(CASE WHEN ce.next_maintenance_date < ? THEN 1 ELSE 0 END) as expired_eq
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

        db.get(sqlAppointments, [today], (err, row) => {
          stats.appointmentsToSchedule = row.count; // Simplifié

          db.get(sqlEquipment, [], (err, row) => {
            stats.equipmentInstalled = row.count;

            // Calcul Up To Date
            db.all(sqlClientsStatus, [today], (err, rows) => {
              // Un client est "Up to Date" s'il a des équipements et 0 expiré
              // Ou s'il n'a pas d'équipement (discutable, mais disons OK pour l'instant)
              // Ici on va compter : Client OK = expired_eq == 0
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

// Clients à contacter (Maintenance expirée)
router.get('/clients-to-contact', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  // On prend les clients qui ont au moins un équipement expiré
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
  
  // On récupère tous les clients et on détermine leur statut global
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
        const days = Math.ceil((new Date(row.next_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (days <= 30) status = 'warning';
      }
      
      return {
        ...row,
        status
      };
    });
    
    res.json(clients);
  });
});

module.exports = router;