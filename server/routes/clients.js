const express = require('express');
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ========== GET UN SEUL CLIENT (DOIT ÊTRE AVANT GET /) ==========
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  // Vérifier que l'ID est un nombre
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'ID invalide' });
  }
  
  db.get('SELECT * FROM clients WHERE id = ?', [id], (err, client) => {
    if (err) {
      console.error('Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    res.json(client);
  });
});

// ========== GET LISTE DES CLIENTS (AVEC FILTRES) ==========
router.get('/', requireAuth, (req, res) => {
  const {
    page = 1,
    limit = 25,
    search = '',
    sortBy = 'cabinet_name',
    sortOrder = 'ASC',
    brand = '',
    model = '',
    serialNumber = '',
    columnSearch = '{}'
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  let conditions = [];
  let params = [];

  if (search) {
    conditions.push(`(
      c.cabinet_name LIKE ? OR 
      c.contact_name LIKE ? OR 
      c.activity LIKE ? OR 
      c.city LIKE ? OR 
      c.canton LIKE ? OR 
      c.email LIKE ? OR 
      c.phone LIKE ?
    )`);
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  try {
    const colSearch = JSON.parse(columnSearch);
    Object.entries(colSearch).forEach(([col, val]) => {
      if (val && val.trim()) {
        conditions.push(`c.${col} LIKE ?`);
        params.push(`%${val}%`);
      }
    });
  } catch (e) {
    // Ignorer erreur parsing JSON
  }

  if (brand || model || serialNumber) {
    conditions.push(`c.id IN (
      SELECT ce.client_id FROM client_equipment ce
      JOIN equipment_catalog eq ON ce.equipment_id = eq.id
      WHERE 1=1
      ${brand ? 'AND eq.brand LIKE ?' : ''}
      ${model ? 'AND eq.model LIKE ?' : ''}
      ${serialNumber ? 'AND ce.serial_number LIKE ?' : ''}
    )`);
    if (brand) params.push(`%${brand}%`);
    if (model) params.push(`%${model}%`);
    if (serialNumber) params.push(`%${serialNumber}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  db.get(`SELECT COUNT(*) as total FROM clients c ${whereClause}`, params, (err, countRow) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    const total = countRow.total;

    const query = `
      SELECT 
        c.*,
        COUNT(ce.id) as equipment_count
      FROM clients c
      LEFT JOIN client_equipment ce ON c.id = ce.client_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    db.all(query, [...params, parseInt(limit), offset], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      res.json({
        clients: rows || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    });
  });
});

// ========== POST CRÉER UN CLIENT ==========
router.post('/', requireAuth, (req, res) => {
  const {
    cabinet_name,
    contact_name,
    activity,
    address,
    postal_code,
    canton,
    city,
    phone,
    email,
    maintenance_due_date,
    appointment_at,
    notes
  } = req.body;

  if (!cabinet_name || !contact_name || !activity || !address || !city) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  db.run(
    `INSERT INTO clients (
      cabinet_name, contact_name, activity, address, postal_code, canton, 
      city, phone, email, maintenance_due_date, appointment_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cabinet_name,
      contact_name,
      activity,
      address,
      postal_code || null,
      canton || '',
      city,
      phone || null,
      email || null,
      maintenance_due_date || null,
      appointment_at || null,
      notes || null
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la création' });
      }

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) 
         VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, 'create', 'client', this.lastID, JSON.stringify({ cabinet_name })]
      );

      res.json({ success: true, id: this.lastID });
    }
  );
});

// ========== PUT MODIFIER UN CLIENT ==========
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    cabinet_name,
    contact_name,
    activity,
    address,
    postal_code,
    canton,
    city,
    phone,
    email,
    maintenance_due_date,
    appointment_at,
    technician_id,
    notes
  } = req.body;

  db.run(
    `UPDATE clients SET 
      cabinet_name = ?, contact_name = ?, activity = ?, 
      address = ?, postal_code = ?, canton = ?, city = ?, phone = ?, 
      email = ?, maintenance_due_date = ?, appointment_at = ?, 
      technician_id = ?, notes = ?
    WHERE id = ?`,
    [
      cabinet_name,
      contact_name,
      activity,
      address,
      postal_code || null,
      canton,
      city,
      phone,
      email,
      maintenance_due_date,
      appointment_at,
      technician_id || null,
      notes,
      id
    ],
    function (err) {
      if (err) {
        console.error('Erreur UPDATE client:', err);
        return res.status(500).json({ error: 'Erreur lors de la modification' });
      }

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) 
         VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, 'update', 'client', id, JSON.stringify({ cabinet_name })]
      );

      res.json({ success: true });
    }
  );
});

// ========== DELETE SUPPRIMER UN CLIENT ==========
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM clients WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la suppression' });
    }

    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id) 
       VALUES (?, ?, ?, ?)`,
      [req.session.userId, 'delete', 'client', id]
    );

    res.json({ success: true });
  });
});

// ========== GET ÉQUIPEMENTS D'UN CLIENT ==========
router.get('/:id/equipment', requireAuth, (req, res) => {
  const { id } = req.params;

  db.all(
    `SELECT 
      ce.id, ce.serial_number, ce.installed_at, ce.warranty_until,
      ce.last_maintenance_date, ce.maintenance_interval, ce.next_maintenance_date,
      ce.equipment_id,
      eq.name, eq.brand, eq.model, eq.type
    FROM client_equipment ce
    JOIN equipment_catalog eq ON ce.equipment_id = eq.id
    WHERE ce.client_id = ?
    ORDER BY eq.name ASC`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      res.json(rows || []);
    }
  );
});

// ========== POST AJOUTER UN ÉQUIPEMENT ==========
router.post('/:clientId/equipment', requireAuth, async (req, res) => {
  const { clientId } = req.params;
  const {
    equipment_id,
    serial_number,
    installed_at,
    warranty_until,
    last_maintenance_date,
    maintenance_interval,
    next_maintenance_date
  } = req.body;

  if (!equipment_id) {
    return res.status(400).json({ error: 'Équipement requis' });
  }

  try {
    db.run(
      `INSERT INTO client_equipment (
        client_id, equipment_id, serial_number, 
        installed_at, warranty_until, last_maintenance_date,
        maintenance_interval, next_maintenance_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        equipment_id,
        serial_number || null,
        installed_at || null,
        warranty_until || null,
        last_maintenance_date || null,
        maintenance_interval || 1,
        next_maintenance_date || null
      ],
      function (err) {
        if (err) {
          console.error('Erreur INSERT equipment:', err);
          return res.status(500).json({ error: "Erreur lors de l'ajout" });
        }

        db.run(
          `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            req.session.userId,
            'create',
            'equipment',
            this.lastID,
            JSON.stringify({ client_id: clientId, equipment_id })
          ]
        );

        res.json({ success: true, id: this.lastID });
      }
    );
  } catch (error) {
    console.error('Erreur ajout équipement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========== PUT MODIFIER UN ÉQUIPEMENT ==========
router.put('/:clientId/equipment/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    equipment_id,
    serial_number,
    installed_at,
    warranty_until,
    last_maintenance_date,
    maintenance_interval,
    next_maintenance_date
  } = req.body;

  db.run(
    `UPDATE client_equipment SET 
      equipment_id = ?, serial_number = ?, installed_at = ?, 
      warranty_until = ?, last_maintenance_date = ?, 
      maintenance_interval = ?, next_maintenance_date = ?
    WHERE id = ?`,
    [
      equipment_id,
      serial_number,
      installed_at,
      warranty_until,
      last_maintenance_date,
      maintenance_interval || 1,
      next_maintenance_date,
      id
    ],
    function (err) {
      if (err) {
        console.error('Erreur UPDATE equipment:', err);
        return res.status(500).json({ error: 'Erreur lors de la modification' });
      }

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id) 
         VALUES (?, ?, ?, ?)`,
        [req.session.userId, 'update', 'equipment', id]
      );

      res.json({ success: true });
    }
  );
});

// ========== DELETE SUPPRIMER UN ÉQUIPEMENT ==========
router.delete('/:clientId/equipment/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM client_equipment WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la suppression' });
    }

    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id) 
       VALUES (?, ?, ?, ?)`,
      [req.session.userId, 'delete', 'equipment', id]
    );

    res.json({ success: true });
  });
});

// ========== GET HISTORIQUE DES RENDEZ-VOUS ==========
router.get('/:id/appointments', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.all(
    `SELECT 
      ah.id, ah.appointment_date, ah.task_description, ah.created_at,
      u.name as technician_name
    FROM appointments_history ah
    LEFT JOIN users u ON ah.technician_id = u.id
    WHERE ah.client_id = ?
    ORDER BY ah.appointment_date DESC
    LIMIT 50`,
    [id],
    (err, appointments) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      
      // Charger les équipements pour chaque rendez-vous
      const appointmentsWithEquipment = appointments.map(apt => {
        return new Promise((resolve) => {
          db.all(
            `SELECT ce.id, eq.name
             FROM appointment_equipment ae
             JOIN client_equipment ce ON ae.equipment_id = ce.id
             JOIN equipment_catalog eq ON ce.equipment_id = eq.id
             WHERE ae.appointment_id = ?`,
            [apt.id],
            (err, eqRows) => {
              apt.equipment_names = err ? [] : eqRows.map(r => r.name);
              resolve(apt);
            }
          );
        });
      });
      
      Promise.all(appointmentsWithEquipment).then(results => {
        res.json(results);
      });
    }
  );
});

// ========== GET UN RENDEZ-VOUS SPÉCIFIQUE ==========
router.get('/:id/appointments/:appointmentId', requireAuth, (req, res) => {
  const { appointmentId } = req.params;
  
  db.get(
    `SELECT 
      ah.id, ah.client_id, ah.appointment_date, ah.task_description, ah.technician_id, ah.created_at
    FROM appointments_history ah
    WHERE ah.id = ?`,
    [appointmentId],
    (err, appointment) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      if (!appointment) {
        return res.status(404).json({ error: 'Rendez-vous non trouvé' });
      }
      
      // Charger les équipements liés
      db.all(
        `SELECT equipment_id FROM appointment_equipment WHERE appointment_id = ?`,
        [appointmentId],
        (err, eqRows) => {
          appointment.equipment_ids = err ? [] : eqRows.map(r => r.equipment_id);
          res.json(appointment);
        }
      );
    }
  );
});

// ========== POST AJOUTER UN RENDEZ-VOUS À L'HISTORIQUE ==========
router.post('/:id/appointments', requireAuth, (req, res) => {
  const { id } = req.params;
  const { appointment_date, task_description, technician_id, equipment_ids } = req.body;
  
  if (!appointment_date) {
    return res.status(400).json({ error: 'Date requise' });
  }
  
  db.run(
    `INSERT INTO appointments_history (client_id, appointment_date, task_description, technician_id) 
     VALUES (?, ?, ?, ?)`,
    [id, appointment_date, task_description, technician_id || null],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de l\'ajout' });
      }
      
      const appointmentId = this.lastID;
      
      // Ajouter les liens avec les équipements
      if (equipment_ids && equipment_ids.length > 0) {
        const stmt = db.prepare('INSERT INTO appointment_equipment (appointment_id, equipment_id) VALUES (?, ?)');
        equipment_ids.forEach(eqId => {
          stmt.run(appointmentId, eqId);
        });
        stmt.finalize();
      }
      
      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) 
         VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, 'create', 'appointment', appointmentId, JSON.stringify({ client_id: id })]
      );
      
      res.json({ success: true, id: appointmentId });
    }
  );
});

// ========== PUT MODIFIER UN RENDEZ-VOUS ==========
router.put('/:id/appointments/:appointmentId', requireAuth, (req, res) => {
  const { appointmentId } = req.params;
  const { appointment_date, task_description, technician_id, equipment_ids } = req.body;
  
  if (!appointment_date) {
    return res.status(400).json({ error: 'Date requise' });
  }
  
  db.run(
    `UPDATE appointments_history 
     SET appointment_date = ?, task_description = ?, technician_id = ?
     WHERE id = ?`,
    [appointment_date, task_description, technician_id || null, appointmentId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la modification' });
      }
      
      // Supprimer les anciens liens équipements
      db.run('DELETE FROM appointment_equipment WHERE appointment_id = ?', [appointmentId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Erreur mise à jour équipements' });
        }
        
        // Ajouter les nouveaux liens
        if (equipment_ids && equipment_ids.length > 0) {
          const stmt = db.prepare('INSERT INTO appointment_equipment (appointment_id, equipment_id) VALUES (?, ?)');
          equipment_ids.forEach(eqId => {
            stmt.run(appointmentId, eqId);
          });
          stmt.finalize();
        }
        
        db.run(
          `INSERT INTO activity_logs (user_id, action, entity, entity_id) 
           VALUES (?, ?, ?, ?)`,
          [req.session.userId, 'update', 'appointment', appointmentId]
        );
        
        res.json({ success: true });
      });
    }
  );
});

// ========== DELETE SUPPRIMER UN RENDEZ-VOUS ==========
router.delete('/:id/appointments/:appointmentId', requireAuth, (req, res) => {
  const { appointmentId } = req.params;
  
  db.run('DELETE FROM appointments_history WHERE id = ?', [appointmentId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
    
    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id) 
       VALUES (?, ?, ?, ?)`,
      [req.session.userId, 'delete', 'appointment', appointmentId]
    );
    
    res.json({ success: true });
  });
});

module.exports = router;