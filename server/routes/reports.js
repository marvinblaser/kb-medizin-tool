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

// LISTE RAPPORTS
router.get('/', requireAuth, (req, res) => {
  const { page = 1, limit = 25, search, type, status } = req.query;
  const offset = (page - 1) * limit;
  
  let where = ["1=1"];
  let params = [];

  if (search) {
    where.push(`(r.report_number LIKE ? OR r.cabinet_name LIKE ? OR r.city LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (type) { where.push("r.work_type = ?"); params.push(type); }
  if (status) { where.push("r.status = ?"); params.push(status); }

  const sql = `
    SELECT r.*, 
    (SELECT COUNT(*) FROM report_technicians rt WHERE rt.report_id = r.id) as technicians_count
    FROM reports r 
    WHERE ${where.join(' AND ')} 
    ORDER BY r.created_at DESC 
    LIMIT ? OFFSET ?
  `;
  
  const countSql = `SELECT count(*) as count FROM reports r WHERE ${where.join(' AND ')}`;

  db.get(countSql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const totalItems = row.count;
    const totalPages = Math.ceil(totalItems / limit);

    db.all(sql, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ reports: rows, pagination: { page: parseInt(page), totalPages, totalItems } });
    });
  });
});

// GET ONE
router.get('/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  
  const sqlReport = "SELECT * FROM reports WHERE id = ?";
  const sqlTechs = "SELECT * FROM report_technicians WHERE report_id = ?";
  const sqlMats = "SELECT * FROM report_materials WHERE report_id = ?";
  const sqlTests = "SELECT * FROM report_stk_tests WHERE report_id = ?";

  db.get(sqlReport, [id], (err, report) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!report) return res.status(404).json({ error: "Rapport introuvable" });

    Promise.all([
      new Promise((resolve) => db.all(sqlTechs, [id], (e, r) => resolve(r || []))),
      new Promise((resolve) => db.all(sqlMats, [id], (e, r) => resolve(r || []))),
      new Promise((resolve) => db.all(sqlTests, [id], (e, r) => resolve(r || [])))
    ]).then(([techs, mats, tests]) => {
      report.technicians = techs;
      report.materials = mats;
      report.stk_tests = tests;
      res.json(report);
    });
  });
});

// CREATE
router.post('/', requireAuth, (req, res) => {
  const data = req.body;
  
  // Génération numéro rapport (Ex: RE-2025-0001)
  const typeMap = { 'Mise en marche': 'IN', 'Service d\'entretien': 'SE', 'Réparation': 'RE', 'Contrôle': 'CO', 'Montage': 'MO' };
  const prefix = typeMap[data.work_type] || 'RP';
  const year = new Date().getFullYear();
  
  // Trouver le dernier numéro pour cette année
  db.get("SELECT report_number FROM reports WHERE report_number LIKE ? ORDER BY id DESC LIMIT 1", [`${prefix}-${year}-%`], (err, row) => {
    let nextNum = 1;
    if (row && row.report_number) {
      const parts = row.report_number.split('-');
      nextNum = parseInt(parts[2]) + 1;
    }
    const reportNumber = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;

    db.run(
      `INSERT INTO reports (
        report_number, client_id, cabinet_name, address, postal_code, city, interlocutor,
        work_type, installation, work_accomplished, travel_location, travel_costs, travel_included,
        remarks, status, technician_signature_date, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        reportNumber, data.client_id, data.cabinet_name, data.address, data.postal_code, data.city, data.interlocutor,
        data.work_type, data.installation, data.work_accomplished, data.travel_location, data.travel_costs, data.travel_included ? 1 : 0,
        data.remarks, data.status || 'draft', data.technician_signature_date, req.session.userId
      ],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const reportId = this.lastID;
        
        insertRelatedData(reportId, data);
        logActivity(req.session.userId, 'create', 'report', reportId, { report_number: reportNumber });
        res.json({ id: reportId, report_number: reportNumber });
      }
    );
  });
});

// UPDATE
router.put('/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  const data = req.body;

  db.run(
    `UPDATE reports SET 
      client_id=?, cabinet_name=?, address=?, postal_code=?, city=?, interlocutor=?,
      work_type=?, installation=?, work_accomplished=?, travel_location=?, travel_costs=?, travel_included=?,
      remarks=?, status=?, technician_signature_date=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?`,
    [
      data.client_id, data.cabinet_name, data.address, data.postal_code, data.city, data.interlocutor,
      data.work_type, data.installation, data.work_accomplished, data.travel_location, data.travel_costs, data.travel_included ? 1 : 0,
      data.remarks, data.status, data.technician_signature_date, id
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Supprimer anciennes données liées pour recréer (plus simple)
      db.run("DELETE FROM report_technicians WHERE report_id=?", [id]);
      db.run("DELETE FROM report_materials WHERE report_id=?", [id]);
      db.run("DELETE FROM report_stk_tests WHERE report_id=?", [id]);
      
      insertRelatedData(id, data);
      logActivity(req.session.userId, 'update', 'report', id);
      res.json({ success: true });
    }
  );
});

// DELETE (CORRIGÉ POUR ÉVITER ERREUR 500)
router.delete('/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  
  db.serialize(() => {
    // 1. Délier les rendez-vous de l'historique (pour éviter contrainte FK)
    db.run("UPDATE appointments_history SET report_id = NULL WHERE report_id = ?", [id]);
    
    // 2. Supprimer le rapport (Cascade s'occupera des matériaux/techniciens)
    db.run("DELETE FROM reports WHERE id = ?", [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.session.userId, 'delete', 'report', id);
      res.json({ success: true });
    });
  });
});

// Helper insertion
function insertRelatedData(reportId, data) {
  if (data.technicians && data.technicians.length > 0) {
    const stmt = db.prepare("INSERT INTO report_technicians (report_id, technician_id, technician_name, work_date, hours_normal, hours_extra) VALUES (?,?,?,?,?,?)");
    data.technicians.forEach(t => stmt.run(reportId, t.technician_id, t.technician_name, t.work_date, t.hours_normal, t.hours_extra));
    stmt.finalize();
  }

  if (data.materials && data.materials.length > 0) {
    const stmt = db.prepare("INSERT INTO report_materials (report_id, material_id, material_name, product_code, quantity, unit_price, total_price) VALUES (?,?,?,?,?,?,?)");
    data.materials.forEach(m => stmt.run(reportId, m.material_id, m.material_name, m.product_code, m.quantity, m.unit_price, m.total_price));
    stmt.finalize();
  }

  if (data.stk_tests && data.stk_tests.length > 0) {
    const stmt = db.prepare("INSERT INTO report_stk_tests (report_id, test_name, price, included) VALUES (?,?,?,?)");
    data.stk_tests.forEach(t => stmt.run(reportId, t.test_name, t.price, t.included ? 1 : 0));
    stmt.finalize();
  }
}

module.exports = router;