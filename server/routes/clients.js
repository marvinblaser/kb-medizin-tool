/**
 * server/routes/clients.js
 * Version: FULL FIXED (Equipment Join + Strict Filters)
 */
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Utilitaire : Recherche floue (Accents)
const toFuzzySearch = (text) => {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[aàâäá]/g, '_').replace(/[eéèêë]/g, '_')
    .replace(/[iîïí]/g, '_').replace(/[oôöó]/g, '_')
    .replace(/[uûüú]/g, '_').replace(/[yÿ]/g, '_')
    .replace(/ç/g, '_');
};

// GET /api/clients (Liste principale)
router.get('/', requireAuth, (req, res) => {
  const { 
    page = 1, limit = 25, search, 
    sortBy = 'cabinet_name', sortOrder = 'ASC',
    brand, model, serialNumber, category,
    columnSearch 
  } = req.query;

  const offset = (page - 1) * limit;
  const params = [];
  
  let sql = `SELECT c.* FROM clients c WHERE 1=1`;

  // 1. Recherche Globale
  if (search) {
    const term = `%${toFuzzySearch(search)}%`;
    sql += ` AND (LOWER(c.cabinet_name) LIKE ? OR LOWER(c.contact_name) LIKE ? OR LOWER(c.city) LIKE ? OR LOWER(c.phone) LIKE ?)`;
    params.push(term, term, term, term);
  }

  // 2. Filtres Équipements (Jointure pour filtrer par marque/modèle)
  if (brand || model || serialNumber || category) {
    sql += ` AND EXISTS (
      SELECT 1 FROM client_equipment ce 
      LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
      WHERE ce.client_id = c.id 
      AND (
           (LOWER(ec.brand) LIKE ? OR LOWER(ce.brand) LIKE ?)
        OR (LOWER(ec.name) LIKE ? OR LOWER(ce.name) LIKE ?)
        OR (LOWER(ce.serial_number) LIKE ?)
        OR (LOWER(ec.type) LIKE ? OR LOWER(ce.type) LIKE ?)
      )
    )`;
    
    if(brand) params.push(`%${toFuzzySearch(brand)}%`, `%${toFuzzySearch(brand)}%`);
    if(model) params.push(`%${toFuzzySearch(model)}%`, `%${toFuzzySearch(model)}%`);
    if(serialNumber) params.push(`%${toFuzzySearch(serialNumber)}%`);
    if(category) params.push(`%${toFuzzySearch(category)}%`, `%${toFuzzySearch(category)}%`);
  }

  // 3. Filtres Colonnes (Strict pour Canton)
  if (columnSearch) {
    try {
      const cols = JSON.parse(columnSearch);
      Object.keys(cols).forEach(key => {
        if (cols[key] && cols[key].trim() !== '') {
          const safeKey = key.replace(/[^a-z0-9_]/gi, '');
          
          if (safeKey === 'canton') {
             // Recherche STRICTE pour le canton
             sql += ` AND LOWER(c.canton) = ?`;
             params.push(cols[key].toLowerCase());
          } else {
             // Recherche floue pour le reste
             sql += ` AND LOWER(c.${safeKey}) LIKE ?`;
             params.push(`%${toFuzzySearch(cols[key])}%`);
          }
        }
      });
    } catch (e) { console.error("JSON Parse error", e); }
  }

  // Pagination
  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  
  db.get(countSql, params, (err, rowCount) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const total = rowCount.total;
    const totalPages = Math.ceil(total / limit);
    
    const safeSortCol = sortBy.replace(/[^a-z0-9_]/gi, '');
    sql += ` ORDER BY c.${safeSortCol} ${sortOrder === 'DESC' ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ clients: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages } });
    });
  });
});

// GET Un client
router.get('/:id', requireAuth, (req, res) => {
  db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    res.json(row);
  });
});

// GET Equipements (CORRECTION CRITIQUE : Jointure pour avoir Brand/Type)
router.get('/:id/equipment', requireAuth, (req, res) => {
  const sql = `
    SELECT 
      ce.*, 
      ec.name as catalog_name,
      ec.brand as catalog_brand,
      ec.type as catalog_type
    FROM client_equipment ce
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.client_id = ? 
    ORDER BY ce.next_maintenance_date ASC
  `;
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Nettoyage des données avant envoi
    const cleanRows = rows.map(row => ({
      ...row,
      // Si le nom local est vide, on prend celui du catalogue
      name: row.name || row.catalog_name,
      brand: row.brand || row.catalog_brand,
      type: row.type || row.catalog_type
    }));

    res.json(cleanRows);
  });
});

// GET Historique
router.get('/:id/appointments', requireAuth, (req, res) => {
  db.run(`CREATE TABLE IF NOT EXISTS client_appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, appointment_date DATE,
    task_description TEXT, technician_id INTEGER, equipment_ids TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  )`, (err) => {
    const sql = `SELECT ca.*, u.name as technician_name FROM client_appointments ca LEFT JOIN users u ON ca.technician_id = u.id WHERE ca.client_id = ? ORDER BY ca.appointment_date DESC`;
    db.all(sql, [req.params.id], (err, rows) => { if(err) return res.json([]); res.json(rows); });
  });
});

// POST Client
router.post('/', requireAuth, (req, res) => {
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes } = req.body;
  const sql = `INSERT INTO clients (cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
  db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes], function(err) {
    if(err) return res.status(500).json({error: err.message});
    res.json({id: this.lastID});
  });
});

// PUT Client
router.put('/:id', requireAuth, (req, res) => {
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes } = req.body;
  const sql = `UPDATE clients SET cabinet_name=?, contact_name=?, activity=?, address=?, postal_code=?, city=?, canton=?, phone=?, email=?, appointment_at=?, technician_id=?, notes=? WHERE id=?`;
  db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, req.params.id], function(err) {
    if(err) return res.status(500).json({error: err.message});
    res.json({success: true});
  });
});

// DELETE Client
router.delete('/:id', requireAuth, (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM client_equipment WHERE client_id = ?', [req.params.id]);
    db.run('DELETE FROM client_appointments WHERE client_id = ?', [req.params.id]);
    db.run('DELETE FROM clients WHERE id = ?', [req.params.id], function(err) {
      if(err) return res.status(500).json({error: err.message});
      res.json({success: true});
    });
  });
});

// POST Equipement
router.post('/:id/equipment', requireAuth, (req, res) => {
  const { equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date } = req.body;
  
  // On récupère les infos du catalogue
  db.get('SELECT name, brand, type FROM equipment_catalog WHERE id = ?', [equipment_id], (err, cat) => {
    if(err || !cat) return res.status(400).json({error: "Equipment not found in catalog"});
    
    // On sauvegarde aussi brand/type/name dans la table client_equipment pour éviter les trous
    const sql = `INSERT INTO client_equipment (
      client_id, equipment_id, name, brand, type, 
      serial_number, installed_at, warranty_until, 
      last_maintenance_date, maintenance_interval, next_maintenance_date
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
    
    db.run(sql, [
      req.params.id, equipment_id, cat.name, cat.brand, cat.type, 
      serial_number, installed_at, warranty_until, 
      last_maintenance_date, maintenance_interval, next_maintenance_date
    ], function(err) {
      if(err) return res.status(500).json({error: err.message});
      res.json({id: this.lastID});
    });
  });
});

// PUT Equipement
router.put('/:id/equipment/:eqId', requireAuth, (req, res) => {
  const { serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date } = req.body;
  db.run(`UPDATE client_equipment SET serial_number=?, installed_at=?, warranty_until=?, last_maintenance_date=?, maintenance_interval=?, next_maintenance_date=? WHERE id=?`, [serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date, req.params.eqId], function(err) {
    if(err) return res.status(500).json({error: err.message});
    res.json({success: true});
  });
});

// DELETE Equipement
router.delete('/:id/equipment/:eqId', requireAuth, (req, res) => {
  db.run('DELETE FROM client_equipment WHERE id = ?', [req.params.eqId], function(err) {
    if(err) return res.status(500).json({error: err.message});
    res.json({success: true});
  });
});

// POST Historique
router.post('/:id/appointments', requireAuth, (req, res) => {
  const { appointment_date, task_description, technician_id, equipment_ids } = req.body;
  db.run(`INSERT INTO client_appointments (client_id, appointment_date, task_description, technician_id, equipment_ids) VALUES (?,?,?,?,?)`, [req.params.id, appointment_date, task_description, technician_id, JSON.stringify(equipment_ids||[])], function(err) {
    if(err) return res.status(500).json({error: err.message});
    res.json({id: this.lastID});
  });
});

// DELETE Historique
router.delete('/:id/appointments/:appId', requireAuth, (req, res) => {
  db.run('DELETE FROM client_appointments WHERE id = ?', [req.params.appId], function(err) {
    if(err) return res.status(500).json({error: err.message});
    res.json({success: true});
  });
});

module.exports = router;