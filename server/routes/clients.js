// server/routes/clients.js

const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Helper Logs
const logActivity = (userId, action, entity, entityId, meta = {}) => {
  db.run(
    "INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)",
    [userId, action, entity, entityId, JSON.stringify(meta)]
  );
};

// LISTE CLIENTS (AVEC FILTRES AVANCÉS)
router.get('/', requireAuth, (req, res) => {
  const { 
    page = 1, limit = 25, search, 
    sortBy = 'cabinet_name', sortOrder = 'ASC',
    brand, model, serialNumber, 
    category, // Correspond au Secteur (type dans la DB)
    device,   // Correspond à l'Appareil (device_type dans la DB)
    columnSearch 
  } = req.query;
  
  const offset = (page - 1) * limit;
  let params = [];
  let where = ["1=1"];

  // Recherche globale
  if (search) {
    where.push(`(cabinet_name LIKE ? OR city LIKE ? OR contact_name LIKE ? OR phone LIKE ?)`);
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  // Filtres colonnes spécifiques
  if (columnSearch) {
    try {
      const cols = JSON.parse(columnSearch);
      for (const [key, val] of Object.entries(cols)) {
        where.push(`${key} LIKE ?`);
        params.push(`%${val}%`);
      }
    } catch (e) { console.error("Erreur parsing columnSearch", e); }
  }

  // Filtres avancés par équipement
  if (brand || model || serialNumber || category || device) {
    let eqWhere = [];
    if (brand) eqWhere.push(`ec.brand LIKE '%${brand}%'`);
    if (model) eqWhere.push(`ec.model LIKE '%${model}%'`);
    if (serialNumber) eqWhere.push(`ce.serial_number LIKE '%${serialNumber}%'`);
    if (category) eqWhere.push(`ec.type LIKE '%${category}%'`); // Mapping Secteur -> type
    if (device) eqWhere.push(`ec.device_type LIKE '%${device}%'`); // Mapping Appareil -> device_type

    // Sous-requête pour trouver les clients possédant ces équipements
    if (eqWhere.length > 0) {
      where.push(`EXISTS (
        SELECT 1 FROM client_equipment ce 
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id 
        WHERE ce.client_id = clients.id AND ${eqWhere.join(' AND ')}
      )`);
    }
  }

  const sql = `SELECT * FROM clients WHERE ${where.join(' AND ')} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
  const countSql = `SELECT count(*) as count FROM clients WHERE ${where.join(' AND ')}`;

  db.get(countSql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const totalItems = row.count;
    const totalPages = Math.ceil(totalItems / limit);

    db.all(sql, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ clients: rows, pagination: { page: parseInt(page), totalPages, totalItems } });
    });
  });
});

// GET ONE
router.get('/:id', requireAuth, (req, res) => {
  db.get("SELECT * FROM clients WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Client introuvable" });
    res.json(row);
  });
});

// CREATE
router.post('/', requireAuth, (req, res) => {
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude } = req.body;
  const sql = `INSERT INTO clients (cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity(req.session.userId, 'create', 'client', this.lastID, { cabinet_name });
    res.json({ id: this.lastID });
  });
});

// UPDATE
router.put('/:id', requireAuth, (req, res) => {
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude } = req.body;
  const sql = `UPDATE clients SET cabinet_name=?, contact_name=?, activity=?, address=?, postal_code=?, city=?, canton=?, phone=?, email=?, appointment_at=?, technician_id=?, notes=?, latitude=?, longitude=? WHERE id=?`;
  db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity(req.session.userId, 'update', 'client', req.params.id, { cabinet_name });
    res.json({ success: true });
  });
});

// DELETE
router.delete('/:id', requireAuth, (req, res) => {
  db.run("DELETE FROM clients WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity(req.session.userId, 'delete', 'client', req.params.id);
    res.json({ success: true });
  });
});

// GET EQUIPMENT FOR CLIENT
router.get('/:id/equipment', requireAuth, (req, res) => {
  const sql = `
    SELECT ce.*, ec.name as catalog_name, ec.brand, ec.model, ec.type, ec.device_type,
           COALESCE(ec.name, 'Inconnu') as final_name,
           COALESCE(ec.brand, '') as final_brand,
           COALESCE(ec.type, '') as final_type,
           COALESCE(ec.device_type, '') as final_device_type
    FROM client_equipment ce
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.client_id = ?
    ORDER BY ce.next_maintenance_date ASC
  `;
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ADD EQUIPMENT
router.post('/:id/equipment', requireAuth, (req, res) => {
  const { equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date } = req.body;
  db.run(
    "INSERT INTO client_equipment (client_id, equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date) VALUES (?,?,?,?,?,?,?,?)",
    [req.params.id, equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.session.userId, 'create', 'equipment', this.lastID, { client_id: req.params.id, equipment_id });
      res.json({ id: this.lastID });
    }
  );
});

// UPDATE EQUIPMENT
router.put('/:clientId/equipment/:equipmentId', requireAuth, (req, res) => {
  const { equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date } = req.body;
  db.run(
    "UPDATE client_equipment SET equipment_id=?, serial_number=?, installed_at=?, warranty_until=?, last_maintenance_date=?, maintenance_interval=?, next_maintenance_date=? WHERE id=?",
    [equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date, req.params.equipmentId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.session.userId, 'update', 'equipment', req.params.equipmentId);
      res.json({ success: true });
    }
  );
});

// DELETE EQUIPMENT
router.delete('/:clientId/equipment/:equipmentId', requireAuth, (req, res) => {
  db.run("DELETE FROM client_equipment WHERE id=?", [req.params.equipmentId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// GET HISTORY
router.get('/:id/appointments', requireAuth, (req, res) => {
  const sql = `
    SELECT ah.*, u.name as technician_name, r.report_number 
    FROM appointments_history ah
    LEFT JOIN users u ON ah.technician_id = u.id
    LEFT JOIN reports r ON ah.report_id = r.id
    WHERE ah.client_id = ?
    ORDER BY ah.appointment_date DESC
  `;
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) {
      // AJOUT : On log l'erreur dans le terminal pour comprendre ce qui se passe
      console.error("Erreur SQL (GET History) :", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// ADD HISTORY
router.post('/:id/appointments', requireAuth, (req, res) => {
  const { appointment_date, task_description, technician_id, report_id, equipment_ids } = req.body;
  
  db.serialize(() => {
    db.run(
      "INSERT INTO appointments_history (client_id, appointment_date, task_description, technician_id, report_id) VALUES (?,?,?,?,?)",
      [req.params.id, appointment_date, task_description, technician_id, report_id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const appId = this.lastID;
        
        if (equipment_ids && equipment_ids.length > 0) {
          const placeholders = equipment_ids.map(() => '(?, ?)').join(',');
          const values = [];
          equipment_ids.forEach(eid => { values.push(appId, eid); });
          db.run(`INSERT INTO appointment_equipment (appointment_id, equipment_id) VALUES ${placeholders}`, values);
        }
        
        db.run("UPDATE clients SET appointment_at = ? WHERE id = ?", [appointment_date, req.params.id]);
        
        res.json({ id: appId });
      }
    );
  });
});

// DELETE HISTORY
router.delete('/:clientId/appointments/:apptId', requireAuth, (req, res) => {
  db.run("DELETE FROM appointments_history WHERE id = ?", [req.params.apptId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;