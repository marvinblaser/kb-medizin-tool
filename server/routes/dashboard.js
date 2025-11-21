const express = require('express');
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', requireAuth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const stats = {
    maintenanceExpired: 0,
    appointmentsToSchedule: 0,
    clientsUpToDate: 0,
    totalClients: 0,
    equipmentInstalled: 0
  };

  // Maintenances expirées
  db.get(
    `SELECT COUNT(*) as count FROM clients 
     WHERE maintenance_due_date < ?`,
    [today],
    (err, row) => {
      if (!err) stats.maintenanceExpired = row.count;

      // RDV à fixer
      db.get(
        `SELECT COUNT(*) as count FROM clients 
         WHERE appointment_at IS NULL OR appointment_at < ?`,
        [today],
        (err, row) => {
          if (!err) stats.appointmentsToSchedule = row.count;

          // Total clients
          db.get('SELECT COUNT(*) as count FROM clients', (err, row) => {
            if (!err) stats.totalClients = row.count;

            // 🔥 NOUVEAU : Calculer les clients avec TOUS les équipements à jour
            db.all('SELECT id FROM clients', async (err, clients) => {
              if (err) {
                stats.clientsUpToDate = 0;
                stats.equipmentInstalled = 0;
                return res.json(stats);
              }

              let upToDateCount = 0;

              // Pour chaque client, vérifier si TOUS ses équipements sont OK
              const promises = clients.map(client => {
                return new Promise((resolve) => {
                  db.all(
                    `SELECT next_maintenance_date 
                     FROM client_equipment 
                     WHERE client_id = ?`,
                    [client.id],
                    (err, equipment) => {
                      if (err || equipment.length === 0) {
                        resolve(false);
                        return;
                      }

                      // Tous les équipements doivent être à jour
                      const allUpToDate = equipment.every(eq => 
                        eq.next_maintenance_date && eq.next_maintenance_date >= today
                      );

                      resolve(allUpToDate);
                    }
                  );
                });
              });

              const results = await Promise.all(promises);
              stats.clientsUpToDate = results.filter(v => v === true).length;

              // Équipements installés
              db.get(
                'SELECT COUNT(*) as count FROM client_equipment',
                (err, row) => {
                  if (!err) stats.equipmentInstalled = row.count;
                  res.json(stats);
                }
              );
            });
          });
        }
      );
    }
  );
});

// GET /api/dashboard/upcoming-appointments
router.get('/upcoming-appointments', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  db.all(
    `SELECT id, cabinet_name, contact_name, appointment_at, phone
     FROM clients 
     WHERE appointment_at >= ?
     ORDER BY appointment_at ASC
     LIMIT 10`,
    [today],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      res.json(rows || []);
    }
  );
});

// GET /api/dashboard/clients-to-contact
router.get('/clients-to-contact', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysLater = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split('T')[0];

  db.all(
    `SELECT id, cabinet_name, contact_name, maintenance_due_date, phone
     FROM clients 
     WHERE maintenance_due_date BETWEEN ? AND ?
     ORDER BY maintenance_due_date ASC
     LIMIT 10`,
    [today, thirtyDaysLater],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      res.json(rows || []);
    }
  );
});

// GET /api/dashboard/clients-map
router.get('/clients-map', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  db.all(
    `SELECT 
      c.id, c.cabinet_name, c.contact_name, c.address, 
      c.city, c.canton, c.maintenance_due_date, c.phone, c.email,
      c.postal_code
     FROM clients c`,
    async (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      // Pour chaque client, récupérer ses équipements et calculer le statut
      const clientsWithEquipment = await Promise.all(
        rows.map(async (client) => {
          return new Promise((resolve) => {
            db.all(
              `SELECT ce.next_maintenance_date, eq.name, eq.brand, eq.model, ce.serial_number
               FROM client_equipment ce
               JOIN equipment_catalog eq ON ce.equipment_id = eq.id
               WHERE ce.client_id = ?`,
              [client.id],
              (err, equipment) => {
                if (err || equipment.length === 0) {
                  // Pas d'équipement = statut basé sur maintenance_due_date
                  const status = !client.maintenance_due_date ? 'ok'
                    : client.maintenance_due_date < today ? 'expired'
                    : client.maintenance_due_date <= thirtyDaysLater ? 'warning'
                    : 'ok';
                  
                  resolve({ ...client, equipment: [], status });
                  return;
                }

                // 🔥 NOUVEAU : Le statut est le PIRE statut parmi tous les équipements
                let worstStatus = 'ok';
                
                equipment.forEach(eq => {
                  if (!eq.next_maintenance_date) {
                    // Pas de date = warning
                    if (worstStatus === 'ok') worstStatus = 'warning';
                  } else if (eq.next_maintenance_date < today) {
                    // Expiré = toujours le pire
                    worstStatus = 'expired';
                  } else if (eq.next_maintenance_date <= thirtyDaysLater && worstStatus !== 'expired') {
                    // À renouveler bientôt
                    worstStatus = 'warning';
                  }
                  // Sinon reste 'ok'
                });

                resolve({ ...client, equipment, status: worstStatus });
              }
            );
          });
        })
      );

      res.json(clientsWithEquipment);
    }
  );
});

// GET /api/dashboard/recent-activity
router.get('/recent-activity', requireAuth, (req, res) => {
  db.all(
    `SELECT 
      al.id, al.action, al.entity, al.entity_id, 
      al.created_at, u.name as user_name
     FROM activity_logs al
     LEFT JOIN users u ON al.user_id = u.id
     ORDER BY al.created_at DESC
     LIMIT 20`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      res.json(rows || []);
    }
  );
});

module.exports = router;