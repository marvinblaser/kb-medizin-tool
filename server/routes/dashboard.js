/**
 * server/routes/dashboard.js
 * Logique Backend pour les statistiques
 * VERSION CORRIGÉE : Logique "RDV à fixer" stricte
 */
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

/* 1. STATISTIQUES GLOBALES */
router.get('/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // 1. Maintenances expirées (Compte les MACHINES en retard)
  const sqlExpired = `SELECT COUNT(*) as count FROM client_equipment WHERE next_maintenance_date < ?`;

  // 2. RDV à fixer (LOGIQUE STRICTE)
  // Compte les CLIENTS uniques qui :
  // A. N'ont PAS de rendez-vous futur (Date vide, nulle, ou passée)
  // B. ET possèdent au moins une machine qui est expirée OU expire dans les 30 jours
  const sqlAppointments = `
    SELECT COUNT(DISTINCT c.id) as count 
    FROM clients c
    JOIN client_equipment ce ON c.id = ce.client_id
    WHERE (c.appointment_at IS NULL OR c.appointment_at = '' OR c.appointment_at < ?)
    AND (
      ce.next_maintenance_date < ? 
      OR 
      ce.next_maintenance_date <= date(?, '+30 days')
    )
  `;

  // 3. Total clients
  const sqlTotalClients = `SELECT COUNT(*) as count FROM clients`;

  // 4. Total équipements
  const sqlTotalEquipment = `SELECT COUNT(*) as count FROM client_equipment`;
  
  // 5. Clients à jour (Ceux qui n'ont aucune machine en retard)
  const sqlUpToDate = `
    SELECT COUNT(*) as count FROM clients c
    WHERE NOT EXISTS (
      SELECT 1 FROM client_equipment ce 
      WHERE ce.client_id = c.id 
      AND (
        ce.next_maintenance_date <= date(?, '+30 days') 
        OR ce.next_maintenance_date IS NULL
      )
    )
  `;

  // Exécution
  db.get(sqlExpired, [today], (err, rowExpired) => {
    if (err) { console.error("Err Stats Expired:", err); return res.status(500).json({error: err.message}); }
    
    // On passe 'today' 3 fois pour les 3 conditions de dates dans sqlAppointments
    db.get(sqlAppointments, [today, today, today], (err, rowAppt) => {
      if (err) { console.error("Err Stats Appt:", err); return res.status(500).json({error: err.message}); }

      db.get(sqlTotalClients, [], (err, rowClients) => {
        db.get(sqlTotalEquipment, [], (err, rowEquip) => {
          db.get(sqlUpToDate, [today], (err, rowUpToDate) => {
            
            res.json({
              maintenanceExpired: rowExpired ? rowExpired.count : 0,
              appointmentsToSchedule: rowAppt ? rowAppt.count : 0, // Devrait être 0 maintenant
              clientsUpToDate: rowUpToDate ? rowUpToDate.count : 0,
              totalClients: rowClients ? rowClients.count : 0,
              equipmentInstalled: rowEquip ? rowEquip.count : 0
            });

          });
        });
      });
    });
  });
});

/* 2. RENDEZ-VOUS À VENIR */
router.get('/upcoming-appointments', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT id, cabinet_name, contact_name, appointment_at, city 
    FROM clients 
    WHERE appointment_at >= ? 
    ORDER BY appointment_at ASC 
    LIMIT 5
  `;
  db.all(sql, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/* 3. CLIENTS À CONTACTER */
router.get('/clients-to-contact', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  // Affiche les clients qui ont une urgence ET pas de RDV futur
  const sql = `
    SELECT DISTINCT c.id, c.cabinet_name, c.phone, MIN(ce.next_maintenance_date) as due_date
    FROM clients c
    JOIN client_equipment ce ON c.id = ce.client_id
    WHERE (c.appointment_at IS NULL OR c.appointment_at = '' OR c.appointment_at < ?)
    AND (ce.next_maintenance_date <= date(?, '+30 days'))
    GROUP BY c.id
    ORDER BY due_date ASC
    LIMIT 5
  `;
  db.all(sql, [today, today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/* 4. MAINTENANCES DU MOIS */
router.get('/maintenance-month', requireAuth, (req, res) => {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const sql = `
    SELECT ce.id, ce.next_maintenance_date, c.cabinet_name, 
           COALESCE(ce.name, 'Équipement') as name 
    FROM client_equipment ce
    JOIN clients c ON ce.client_id = c.id
    WHERE ce.next_maintenance_date BETWEEN ? AND ?
    ORDER BY ce.next_maintenance_date ASC
    LIMIT 5
  `;
  db.all(sql, [startOfMonth, endOfMonth], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/* 5. GARANTIES EXPIRANT */
router.get('/warranty-expiring', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const future = new Date();
  future.setDate(future.getDate() + 90);
  const futureStr = future.toISOString().split('T')[0];

  const sql = `
    SELECT ce.id, ce.warranty_until, c.cabinet_name,
           COALESCE(ce.name, 'Équipement') as name
    FROM client_equipment ce
    JOIN clients c ON ce.client_id = c.id
    WHERE ce.warranty_until BETWEEN ? AND ?
    ORDER BY ce.warranty_until ASC
    LIMIT 5
  `;
  db.all(sql, [today, futureStr], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/* 6. CARTE DES CLIENTS */
router.get('/clients-map', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  const sql = `
    SELECT c.id, c.cabinet_name, c.address, c.city, c.canton,
           MIN(ce.next_maintenance_date) as next_maintenance
    FROM clients c
    LEFT JOIN client_equipment ce ON c.id = ce.client_id
    GROUP BY c.id
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const clients = rows.map(c => {
      let status = 'ok';
      if (c.next_maintenance) {
        if (c.next_maintenance < today) status = 'expired';
        else if (c.next_maintenance < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) status = 'warning';
      }
      return { ...c, status };
    });

    res.json(clients);
  });
});

module.exports = router;