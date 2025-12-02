const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Fonction helper pour géocoder une adresse via Nominatim (OpenStreetMap)
async function geocodeAddress(address, postalCode, city) {
  try {
    // Construction de la requête standard
    const query = `${address}, ${postalCode} ${city}, Switzerland`;
    console.log(`🌍 Géocodage auto pour: "${query}"`);
    
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    
    // Header User-Agent obligatoire pour Nominatim
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'KB-Medizin-Tool/1.0 (internal-tool)',
        'Accept-Language': 'fr-CH, fr;q=0.9' 
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        console.log(`✅ Trouvé: ${data[0].lat}, ${data[0].lon}`);
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      } else {
        console.log('⚠️ Aucune correspondance exacte trouvée par l\'API.');
      }
    }
  } catch (error) {
    console.error('❌ Erreur technique Géocodage:', error.message);
  }
  return { lat: null, lon: null };
}

// GET /api/clients - Liste avec recherche et pagination
router.get('/', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const offset = (page - 1) * limit;
  
  const search = req.query.search || '';
  const sortBy = req.query.sortBy || 'cabinet_name';
  const sortOrder = req.query.sortOrder || 'ASC';

  let sql = `SELECT * FROM clients WHERE 1=1`;
  let params = [];

  if (search) {
    sql += ` AND (cabinet_name LIKE ? OR city LIKE ? OR contact_name LIKE ? OR phone LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  // Column search
  if (req.query.columnSearch) {
    try {
      const colSearch = JSON.parse(req.query.columnSearch);
      for (const [key, value] of Object.entries(colSearch)) {
        if (value) {
          sql += ` AND ${key} LIKE ?`;
          params.push(`%${value}%`);
        }
      }
    } catch (e) {}
  }

  // Equipment filters
  if (req.query.brand || req.query.model || req.query.serialNumber || req.query.category) {
    sql += ` AND id IN (SELECT client_id FROM client_equipment ce JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE 1=1`;
    if (req.query.brand) { sql += ` AND ec.brand LIKE ?`; params.push(`%${req.query.brand}%`); }
    if (req.query.model) { sql += ` AND ec.model LIKE ?`; params.push(`%${req.query.model}%`); }
    if (req.query.category) { sql += ` AND ec.type LIKE ?`; params.push(`%${req.query.category}%`); }
    if (req.query.serialNumber) { sql += ` AND ce.serial_number LIKE ?`; params.push(`%${req.query.serialNumber}%`); }
    sql += `)`;
  }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
  
  db.get(countSql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const totalItems = row.count;
    const totalPages = Math.ceil(totalItems / limit);

    sql += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        clients: rows,
        pagination: { page, limit, totalItems, totalPages }
      });
    });
  });
});

// GET /api/clients/:id - Un seul client
router.get('/:id', requireAuth, (req, res) => {
  db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(row);
  });
});

// POST /api/clients - Créer (AVEC GÉOCODAGE HYBRIDE)
router.post('/', requireAuth, async (req, res) => {
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude } = req.body;
  const techId = technician_id ? parseInt(technician_id) : null;

  let finalLat = latitude;
  let finalLon = longitude;

  // Si pas de coordonnées manuelles, on tente l'auto
  if (!finalLat || !finalLon) {
    const coords = await geocodeAddress(address, postal_code || '', city);
    if (coords.lat) {
      finalLat = coords.lat;
      finalLon = coords.lon;
    }
  }

  const sql = `INSERT INTO clients (cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, techId, notes, finalLat, finalLon], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Client créé' });
  });
});

// PUT /api/clients/:id - Modifier (AVEC GÉOCODAGE HYBRIDE)
router.put('/:id', requireAuth, async (req, res) => {
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude } = req.body;
  const techId = technician_id ? parseInt(technician_id) : null;

  let finalLat = latitude;
  let finalLon = longitude;

  // Si pas de coordonnées manuelles fournies, on retente l'auto
  // Note: Si l'utilisateur veut corriger une position auto, il doit remplir les champs manuels.
  if (!finalLat || !finalLon) {
     const coords = await geocodeAddress(address, postal_code || '', city);
     if (coords.lat) {
       finalLat = coords.lat;
       finalLon = coords.lon;
     }
  }

  const sql = `UPDATE clients SET cabinet_name=?, contact_name=?, activity=?, address=?, postal_code=?, city=?, canton=?, phone=?, email=?, appointment_at=?, technician_id=?, notes=?, latitude=?, longitude=? WHERE id=?`;
  
  db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, techId, notes, finalLat, finalLon, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Client mis à jour' });
  });
});

// DELETE /api/clients/:id
router.delete('/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM clients WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Client supprimé' });
  });
});

// GET /api/clients/:id/equipment
router.get('/:id/equipment', requireAuth, (req, res) => {
  const sql = `
    SELECT ce.*, ec.name, ec.brand, ec.model, ec.type,
           ec.name as final_name, ec.brand as final_brand, ec.type as final_type
    FROM client_equipment ce
    JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.client_id = ?
  `;
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST /api/clients/:id/equipment (FIX ERROR 500)
router.post('/:id/equipment', requireAuth, (req, res) => {
  const clientId = parseInt(req.params.id);
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
    return res.status(400).json({ error: 'ID équipement requis' });
  }

  const sql = `
    INSERT INTO client_equipment (
      client_id, equipment_id, serial_number, installed_at, warranty_until,
      last_maintenance_date, maintenance_interval, next_maintenance_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Sécurisation des données (parseInt pour éviter les erreurs SQL sur les nombres)
  const params = [
    clientId, 
    parseInt(equipment_id),
    serial_number || null, 
    installed_at || null, 
    warranty_until || null,
    last_maintenance_date || null,
    parseInt(maintenance_interval) || 1, 
    next_maintenance_date || null
  ];

  db.run(sql, params, function(err) {
    if (err) {
      console.error('SERVER SQL ERROR:', err.message);
      return res.status(500).json({ error: 'Erreur base de données: ' + err.message });
    }
    res.json({ id: this.lastID, message: 'Équipement ajouté' });
  });
});

// PUT /api/clients/:id/equipment/:itemId
router.put('/:id/equipment/:itemId', requireAuth, (req, res) => {
  const { 
    serial_number, installed_at, warranty_until,
    last_maintenance_date, maintenance_interval, next_maintenance_date 
  } = req.body;

  const sql = `UPDATE client_equipment SET serial_number=?, installed_at=?, warranty_until=?, last_maintenance_date=?, maintenance_interval=?, next_maintenance_date=? WHERE id=?`;
  
  db.run(sql, [serial_number, installed_at, warranty_until, last_maintenance_date, parseInt(maintenance_interval)||1, next_maintenance_date, req.params.itemId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Mis à jour' });
  });
});

// DELETE /api/clients/:id/equipment/:itemId
router.delete('/:id/equipment/:itemId', requireAuth, (req, res) => {
  db.run('DELETE FROM client_equipment WHERE id = ?', [req.params.itemId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Supprimé' });
  });
});

// GET /api/clients/:id/appointments (Historique avec infos Rapport)
router.get('/:id/appointments', requireAuth, (req, res) => {
  const sql = `
    SELECT ah.*, 
           u.name as technician_name,
           r.report_number
    FROM appointments_history ah
    LEFT JOIN users u ON ah.technician_id = u.id
    LEFT JOIN reports r ON ah.report_id = r.id
    WHERE ah.client_id = ? 
    ORDER BY ah.appointment_date DESC
  `;
  
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST /api/clients/:id/appointments (Avec report_id)
router.post('/:id/appointments', requireAuth, (req, res) => {
  const { appointment_date, task_description, technician_id, report_id, equipment_ids } = req.body;
  
  // Sécurisation des IDs
  const techId = technician_id ? parseInt(technician_id) : null;
  const repId = report_id ? parseInt(report_id) : null;
  
  db.run(`INSERT INTO appointments_history (client_id, appointment_date, task_description, technician_id, report_id) VALUES (?, ?, ?, ?, ?)`, 
    [req.params.id, appointment_date, task_description, techId, repId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const appointmentId = this.lastID;
      
      if (equipment_ids && equipment_ids.length > 0) {
        const placeholders = equipment_ids.map(() => '(?, ?)').join(',');
        const values = [];
        equipment_ids.forEach(eqId => { values.push(appointmentId, eqId); });
        
        db.run(`INSERT INTO appointment_equipment (appointment_id, equipment_id) VALUES ${placeholders}`, values);
      }
      
      res.json({ message: 'Historique ajouté' });
  });
});

module.exports = router;