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

// ==========================================
// 1. PLANNING GLOBAL (Vue Excel Optimisée)
// ==========================================
router.get('/planning', requireAuth, (req, res) => {
    const { 
        search, status, canton, category, 
        brand, model, serial, year, device,
        sortBy, sortOrder 
    } = req.query; 
    
    let where = ["ce.next_maintenance_date IS NOT NULL"];
    let params = [];

    // Recherche Textuelle Globale
    if (search) {
        where.push(`(c.cabinet_name LIKE ? OR c.city LIKE ? OR ec.brand LIKE ? OR ec.model LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }

    // Filtres Spécifiques
    if (canton) { where.push("c.canton = ?"); params.push(canton); }
    if (category) { where.push("ec.type = ?"); params.push(category); }
    if (device) { where.push("ec.device_type LIKE ?"); params.push(`%${device}%`); }
    if (brand) { where.push("ec.brand LIKE ?"); params.push(`%${brand}%`); }
    if (model) { where.push("ec.model LIKE ?"); params.push(`%${model}%`); }
    if (serial) { where.push("ce.serial_number LIKE ?"); params.push(`%${serial}%`); }
    if (year) { where.push("strftime('%Y', ce.installed_at) = ?"); params.push(year); }

    // Filtre Statut (Urgence)
    if (status) {
        if (status === 'overdue') where.push("date(ce.next_maintenance_date) < date('now')");
        else if (status === 'soon') where.push("date(ce.next_maintenance_date) BETWEEN date('now') AND date('now', '+30 days')");
        else if (status === 'future') where.push("date(ce.next_maintenance_date) > date('now', '+30 days')");
    }

    // Gestion du Tri
    let orderBy = "ce.next_maintenance_date ASC"; 
    
    if (sortBy && sortOrder) {
        const map = {
            'cabinet_name': 'c.cabinet_name',
            'canton': 'c.canton',
            'catalog_name': 'ec.name', 
            'type': 'ec.type',
            'last_maintenance_date': 'ce.last_maintenance_date',
            'next_maintenance_date': 'ce.next_maintenance_date',
            'days_remaining': 'days_remaining'
        };
        
        if (map[sortBy]) {
            orderBy = `${map[sortBy]} ${sortOrder}`;
        }
    }

    const sql = `
        SELECT 
            ce.*,
            c.id as client_id, c.cabinet_name, c.city, c.canton,
            ec.name as catalog_name, ec.brand, ec.model, ec.type, ec.device_type,
            CAST(julianday(ce.next_maintenance_date) - julianday('now') AS INTEGER) as days_remaining
        FROM client_equipment ce
        JOIN clients c ON ce.client_id = c.id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
    `;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==========================================
// 2. ANNUAIRE CLIENTS (Avec Aperçu Parc)
// ==========================================
router.get('/', requireAuth, (req, res) => {
  const { 
    page = 1, limit = 25, search, 
    sortBy = 'cabinet_name', sortOrder = 'ASC',
    brand, model, serialNumber, category, device, columnSearch 
  } = req.query;
  
  const offset = (page - 1) * limit;
  let params = [];
  let where = ["1=1"];

  if (search) {
    where.push(`(cabinet_name LIKE ? OR city LIKE ? OR contact_name LIKE ? OR phone LIKE ?)`);
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (columnSearch) { try { const cols = JSON.parse(columnSearch); for (const [k, v] of Object.entries(cols)) { where.push(`${k} LIKE ?`); params.push(`%${v}%`); } } catch (e) {} }
  if (brand || model || serialNumber || category || device) {
      let eqWhere = [];
      if (brand) eqWhere.push(`ec.brand LIKE '%${brand}%'`);
      if (model) eqWhere.push(`ec.model LIKE '%${model}%'`);
      if (serialNumber) eqWhere.push(`ce.serial_number LIKE '%${serialNumber}%'`);
      if (category) eqWhere.push(`ec.type LIKE '%${category}%'`);
      if (device) eqWhere.push(`ec.device_type LIKE '%${device}%'`);
      if (eqWhere.length > 0) where.push(`EXISTS (SELECT 1 FROM client_equipment ce JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ce.client_id = clients.id AND ${eqWhere.join(' AND ')})`);
  }

  const sql = `
    SELECT clients.*, 
    (
        SELECT GROUP_CONCAT(
            COALESCE(ec.device_type, ec.type) || '__' || 
            COALESCE(ec.brand, '') || '__' || 
            COALESCE(ec.model, '') || '__' || 
            COALESCE(ce.serial_number, ''), 
            ';;'
        )
        FROM client_equipment ce
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ce.client_id = clients.id
    ) as equipment_summary
    FROM clients 
    WHERE ${where.join(' AND ')} 
    ORDER BY ${sortBy} ${sortOrder} 
    LIMIT ? OFFSET ?`;
    
  const countSql = `SELECT count(*) as count FROM clients WHERE ${where.join(' AND ')}`;

  db.get(countSql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const totalItems = row ? row.count : 0;
    const totalPages = Math.ceil(totalItems / limit);

    db.all(sql, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ clients: rows, pagination: { page: parseInt(page), totalPages, totalItems } });
    });
  });
});

// GET ONE CLIENT
router.get('/:id', requireAuth, (req, res) => {
  db.get("SELECT * FROM clients WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Client introuvable" });
    res.json(row);
  });
});

// CREATE CLIENT
router.post('/', requireAuth, (req, res) => {
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude } = req.body;
  const sql = `INSERT INTO clients (cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity(req.session.userId, 'create', 'client', this.lastID, { cabinet_name });
    res.json({ id: this.lastID });
  });
});

// UPDATE CLIENT
router.put('/:id', requireAuth, (req, res) => {
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude } = req.body;
  const sql = `UPDATE clients SET cabinet_name=?, contact_name=?, activity=?, address=?, postal_code=?, city=?, canton=?, phone=?, email=?, appointment_at=?, technician_id=?, notes=?, latitude=?, longitude=? WHERE id=?`;
  db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, appointment_at, technician_id, notes, latitude, longitude, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity(req.session.userId, 'update', 'client', req.params.id, { cabinet_name });
    res.json({ success: true });
  });
});

// DELETE CLIENT
router.delete('/:id', requireAuth, (req, res) => {
  db.run("DELETE FROM clients WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity(req.session.userId, 'delete', 'client', req.params.id);
    res.json({ success: true });
  });
});

// GET EQUIPMENT
router.get('/:id/equipment', requireAuth, (req, res) => {
  const sql = `
    SELECT ce.*, ec.name as catalog_name, ec.brand, ec.model, ec.type, ec.device_type,
           COALESCE(ec.name, 'Inconnu') as final_name,
           COALESCE(ec.brand, '') as final_brand,
           COALESCE(ec.type, '') as final_type,
           COALESCE(ec.device_type, '') as final_device_type,
           CAST(julianday(ce.next_maintenance_date) - julianday('now') AS INTEGER) as days_remaining
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
  const { equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval } = req.body;
  let next_date = null;
  if(last_maintenance_date && maintenance_interval) {
      const d = new Date(last_maintenance_date);
      d.setMonth(d.getMonth() + (parseInt(maintenance_interval) * 12)); 
      next_date = d.toISOString().split('T')[0];
  }
  db.run(
    "INSERT INTO client_equipment (client_id, equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_maintenance_date) VALUES (?,?,?,?,?,?,?,?)",
    [req.params.id, equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_date],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.session.userId, 'create', 'equipment', this.lastID, { client_id: req.params.id, equipment_id });
      res.json({ id: this.lastID });
    }
  );
});

// UPDATE EQUIPMENT
router.put('/:clientId/equipment/:equipmentId', requireAuth, (req, res) => {
  const { equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval } = req.body;
  let next_date = null;
  if(last_maintenance_date && maintenance_interval) {
      const d = new Date(last_maintenance_date);
      d.setMonth(d.getMonth() + (parseInt(maintenance_interval) * 12));
      next_date = d.toISOString().split('T')[0];
  }
  db.run(
    "UPDATE client_equipment SET equipment_id=?, serial_number=?, installed_at=?, warranty_until=?, last_maintenance_date=?, maintenance_interval=?, next_maintenance_date=? WHERE id=?",
    [equipment_id, serial_number, installed_at, warranty_until, last_maintenance_date, maintenance_interval, next_date, req.params.equipmentId],
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

// =================================================================
// 3. HISTORIQUE UNIFIÉ (AMÉLIORÉ AVEC MACHINES)
// =================================================================
router.get('/:id/appointments', requireAuth, (req, res) => {
  const sql = `
    /* 1. Rendez-vous manuels (Table appointments_history) */
    SELECT 
        ah.id, 
        ah.appointment_date, 
        ah.task_description, 
        u.name as technician_name, 
        r_linked.report_number, 
        ah.report_id,
        'appointment' as source_type,
        /* Sous-requête pour récupérer les noms des machines liées */
        (
            SELECT GROUP_CONCAT(COALESCE(ec.name, ec.brand || ' ' || ec.model), ', ')
            FROM appointment_equipment ae
            JOIN client_equipment ce ON ae.equipment_id = ce.id
            LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
            WHERE ae.appointment_id = ah.id
        ) as machines
    FROM appointments_history ah
    LEFT JOIN users u ON ah.technician_id = u.id
    LEFT JOIN reports r_linked ON ah.report_id = r_linked.id
    WHERE ah.client_id = ?

    UNION ALL

    /* 2. Rapports directs (Table reports) */
    SELECT 
        900000 + r.id as id,
        COALESCE(r.technician_signature_date, r.created_at) as appointment_date,
        'Rapport : ' || COALESCE(r.work_type, 'Intervention') as task_description,
        u2.name as technician_name,
        r.report_number,
        r.id as report_id,
        'report' as source_type,
        r.installation as machines /* Dans les rapports, le champ installation contient souvent le nom de la machine */
    FROM reports r
    LEFT JOIN users u2 ON r.author_id = u2.id
    WHERE r.client_id = ? 
    AND r.id NOT IN (SELECT report_id FROM appointments_history WHERE report_id IS NOT NULL)
    
    ORDER BY appointment_date DESC
  `;
  
  db.all(sql, [req.params.id, req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ADD MANUAL APPOINTMENT
router.post('/:id/appointments', requireAuth, (req, res) => {
  const { appointment_date, task_description, technician_id, report_id, equipment_ids } = req.body;
  db.serialize(() => {
    db.run("INSERT INTO appointments_history (client_id, appointment_date, task_description, technician_id, report_id) VALUES (?,?,?,?,?)", [req.params.id, appointment_date, task_description, technician_id, report_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const appId = this.lastID;
        if (equipment_ids && equipment_ids.length > 0) { const placeholders = equipment_ids.map(() => '(?, ?)').join(','); const values = []; equipment_ids.forEach(eid => { values.push(appId, eid); }); db.run(`INSERT INTO appointment_equipment (appointment_id, equipment_id) VALUES ${placeholders}`, values); }
        db.run("UPDATE clients SET appointment_at = ? WHERE id = ?", [appointment_date, req.params.id]);
        res.json({ id: appId });
    });
  });
});

// DELETE MANUAL APPOINTMENT
router.delete('/:clientId/appointments/:apptId', requireAuth, (req, res) => {
  db.run("DELETE FROM appointments_history WHERE id = ?", [req.params.apptId], function(err) {
    if (err) return res.status(500).json({ error: err.message }); res.json({ success: true });
  });
});

module.exports = router;