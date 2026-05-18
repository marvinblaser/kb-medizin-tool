// server/routes/reports.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth, requireAdmin, requireStaff, requireRoles } = require('../middleware/auth');
const { toInt, toBoolInt } = require('../utils/validators');
const log = require('../utils/logger');

// Rôles autorisés à créer/modifier des rapports
const REPORT_AUTHORS = ['admin', 'tech'];
// Rôles capables de valider/refuser un rapport
const VALIDATORS     = ['admin', 'verifier', 'sales_director'];
// Rôles capables d'archiver
const ARCHIVERS      = ['admin', 'secretary'];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const run = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const all = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

const logActivity = (userId, action, entity, entityId, meta = {}) =>
  db.run('INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entity, entityId, JSON.stringify(meta)]);

const notifyUser = (userId, type, message, link) =>
  db.run('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)',
    [userId, type, message, link]);

const notifyRoles = (rolesArray, type, message, link) => {
  const placeholders = rolesArray.map(() => '?').join(',');
  db.all(`SELECT id FROM users WHERE role IN (${placeholders})`, rolesArray, (err, rows) => {
    if (!err && rows) rows.forEach((u) => notifyUser(u.id, type, message, link));
  });
};

// ─── ROUTES ───────────────────────────────────────────────────────────────────
router.get('/stats', requireStaff, async (req, res, next) => {
  try {
    const rows = await all('SELECT status, COUNT(*) as count FROM reports GROUP BY status');
    const stats = { draft: 0, pending: 0, validated: 0, archived: 0 };
    rows.forEach((r) => {
      const s = r.status || 'draft';
      if (stats[s] !== undefined) stats[s] = r.count;
    });
    res.json(stats);
  } catch (err) { next(err); }
});

router.get('/', requireStaff, async (req, res, next) => {
  try {
    const { page = 1, search, type, status, client_id } = req.query;
    const limit = client_id ? 200 : Math.min(toInt(req.query.limit, 25), 200);
    const offset = (toInt(page, 1) - 1) * limit;
    const where = ['1=1'];
    const params = [];
    if (search) {
      const s = `%${search}%`;
      where.push('(r.cabinet_name LIKE ? OR r.city LIKE ? OR r.report_number LIKE ?)');
      params.push(s, s, s);
    }
    if (type)      { where.push('r.work_type = ?'); params.push(type); }
    if (status)    { where.push('r.status = ?'); params.push(status); }
    if (client_id) { where.push('r.client_id = ?'); params.push(toInt(client_id)); }

    const whereSQL = where.join(' AND ');
    const countRow = await get(`SELECT count(*) as count FROM reports r WHERE ${whereSQL}`, params);

    const sql = `
      SELECT r.*,
        COALESCE(u.name, 'Non défini') as validator_name,
        COALESCE(a.name, 'Non défini') as author_name,
        COALESCE(r.archived_at, r.created_at) as archived_at_safe,
        COALESCE(r.validated_at, r.created_at) as validated_at_safe
      FROM reports r
      LEFT JOIN users u ON r.validator_id = u.id
      LEFT JOIN users a ON r.author_id = a.id
      WHERE ${whereSQL}
      ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;

    const rows = await all(sql, [...params, limit, offset]);
    res.json({
      reports: rows,
      pagination: {
        page: toInt(page, 1),
        totalPages: Math.ceil((countRow?.count || 0) / limit),
        totalItems: countRow?.count || 0,
      },
    });
  } catch (err) { next(err); }
});

router.get('/:id', requireStaff, async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide.' });

    const report = await get(
      `SELECT r.*, COALESCE(u.name, '') as validator_name, COALESCE(a.name, '') as author_name
       FROM reports r LEFT JOIN users u ON r.validator_id = u.id LEFT JOIN users a ON r.author_id = a.id
       WHERE r.id = ?`, [id]
    );
    if (!report) return res.status(404).json({ error: 'Introuvable.' });

    const [techs, mats, eqs, stk_rows] = await Promise.all([
      all('SELECT * FROM report_technicians WHERE report_id = ?', [id]),
      all('SELECT * FROM report_materials WHERE report_id = ?', [id]),
      all('SELECT equipment_id FROM report_equipment WHERE report_id = ?', [id]),
      all('SELECT device_name, price, is_included FROM report_stk_tests WHERE report_id = ?', [id]),
    ]);

    report.technicians = techs;
    report.materials = mats;
    report.equipment_ids = eqs.map((e) => e.equipment_id).filter((id) => id != null);
    report.stk_tests = stk_rows.map((row) => ({
      test_name: 'Test de sécurité électrique obligatoire i.O - ' + row.device_name,
      price: row.price,
      included: row.is_included === 1,
    }));
    res.json(report);
  } catch (e) { next(e); }
});

// ─── CHANGEMENT DE STATUT (PATCH) ─────────────────────────────────────────────
router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const reportId = toInt(req.params.id);
    if (!reportId) return res.status(400).json({ error: 'ID invalide.' });
    const { status, reason } = req.body;
    const userId = req.session.userId;
    const role = req.session.role;

    // Vérification permissions
    if (status === 'validated' && !VALIDATORS.includes(role))
      return res.status(403).json({ error: 'Permission refusée.' });
    if (status === 'draft' && reason && !VALIDATORS.includes(role))
      return res.status(403).json({ error: 'Permission refusée.' });
    if (status === 'archived' && !ARCHIVERS.includes(role))
      return res.status(403).json({ error: 'Permission refusée.' });

    // Construction de la requête
    let sql = 'UPDATE reports SET status = ?';
    const params = [status];
    if (status === 'validated') {
      sql += ", validator_id = ?, validated_at = datetime('now'), rejection_reason = NULL";
      params.push(userId);
    } else if (status === 'draft' && reason) {
      sql += ', rejection_reason = ?';
      params.push(reason);
    } else if (status === 'archived') {
      sql += ", archived_at = datetime('now')";
    }
    sql += ' WHERE id = ?';
    params.push(reportId);

    const result = await run(sql, params);
    if (result.changes === 0) return res.status(404).json({ error: 'Rapport introuvable.' });

    logActivity(userId, 'update_status', 'report', reportId, { status, reason });

    // Notifications
    const reportInfo = await get('SELECT author_id, cabinet_name FROM reports WHERE id = ?', [reportId]);
    if (reportInfo) {
      const link = `/reports.html?id=${reportId}`;
      const cabinetName = reportInfo.cabinet_name || 'Client';
      if (status === 'validated' && reportInfo.author_id) {
        notifyUser(reportInfo.author_id, 'success', `✅ Rapport validé pour ${cabinetName}`, link);
      } else if (status === 'draft' && reason && reportInfo.author_id) {
        notifyUser(reportInfo.author_id, 'error',
          `❌ Rapport refusé pour ${cabinetName}. Motif : ${reason}`, link);
      } else if (status === 'pending') {
        const author = await get('SELECT name FROM users WHERE id=?', [userId]);
        notifyRoles(VALIDATORS, 'warning',
          `📝 ${author?.name || 'Un utilisateur'} a soumis un rapport pour : ${cabinetName}`, link);
      } else if (status === 'archived') {
        notifyRoles(['tech'], 'info',
          `📂 Rapport validé pour ${cabinetName}. À déplacer dans le NAS.`, link);
        if (reportInfo.author_id) {
          notifyUser(reportInfo.author_id, 'info',
            `📂 Votre rapport pour ${cabinetName} est archivé. Pensez à le mettre sur le NAS.`, link);
        }
      }
    }

    // Auto-update maintenance dates lors d'une validation
    if (status === 'validated') {
      const row = await get(`
        SELECT r.technician_signature_date, r.created_at, r.work_type,
          (SELECT work_date FROM report_technicians WHERE report_id = r.id ORDER BY work_date ASC LIMIT 1) as tech_work_date
        FROM reports r WHERE r.id = ?`, [reportId]);
      if (row) {
        const workType = (row.work_type || '').toLowerCase();
        const maintenanceTypes = [
          "service d'entretien", 'service-wartung',
          'première validation', 'erste validierung',
          're-validation', 're-validierung',
        ];
        if (maintenanceTypes.some((t) => workType.includes(t))) {
          let rawDate = row.tech_work_date || row.technician_signature_date || row.created_at;
          if (rawDate && rawDate.includes('T')) rawDate = rawDate.split('T')[0];
          await run(
            `UPDATE client_equipment
             SET last_maintenance_date = ?, next_maintenance_date = date(?, '+' || COALESCE(maintenance_interval, 1) || ' years')
             WHERE id IN (SELECT equipment_id FROM report_equipment WHERE report_id = ?)`,
            [rawDate, rawDate, reportId]
          );
          console.log(`✅ Date maintenance (${rawDate}) mise à jour pour rapport #${reportId}`);
        }
      }
    }

    res.json({ success: true, status });
  } catch (err) { next(err); }
});

// ─── CRÉATION / MODIFICATION ──────────────────────────────────────────────────
const saveReportData = async (req, res, reportId, isUpdate) => {
  const userId = req.session.userId;
  const role = req.session.role;
  const {
    client_id, title, language = 'fr', work_type, status, cabinet_name, address,
    postal_code, city, interlocutor, installation, remarks, travel_costs = 0,
    travel_included = 0, travel_location, technician_signature_date, work_accomplished,
    technicians, materials, equipment_ids,
  } = req.body;

  // Si on met à jour, vérifier l'ownership pour les techniciens
  if (isUpdate && role === 'tech') {
    const existing = await get('SELECT author_id, status FROM reports WHERE id = ?', [reportId]);
    if (!existing) return res.status(404).json({ error: 'Rapport introuvable.' });
    if (existing.author_id !== userId) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres rapports.' });
    }
    if (!['draft', 'pending'].includes(existing.status)) {
      return res.status(403).json({ error: 'Rapport déjà validé : non modifiable.' });
    }
  }

  const currentStatus = status || 'draft';

  try {
    await run('BEGIN TRANSACTION');
    let finalId = reportId;

    const params = [
      toInt(client_id), title, language, work_type, currentStatus, cabinet_name, address,
      postal_code, city, interlocutor, installation, remarks, travel_costs,
      toBoolInt(travel_included), travel_location, technician_signature_date, work_accomplished,
    ];

    if (isUpdate) {
      await run(
        `UPDATE reports SET client_id=?, title=?, language=?, work_type=?, status=?, cabinet_name=?, address=?, postal_code=?, city=?, interlocutor=?, installation=?, remarks=?, travel_costs=?, travel_included=?, travel_location=?, technician_signature_date=?, work_accomplished=? WHERE id=?`,
        [...params, reportId]
      );
    } else {
      const result = await run(
        `INSERT INTO reports (client_id, title, language, work_type, status, cabinet_name, address, postal_code, city, interlocutor, installation, remarks, travel_costs, travel_included, travel_location, technician_signature_date, work_accomplished, author_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...params, userId]
      );
      finalId = result.lastID;
    }

    await run('DELETE FROM report_technicians WHERE report_id=?', [finalId]);
    await run('DELETE FROM report_stk_tests WHERE report_id=?', [finalId]);
    await run('DELETE FROM report_materials WHERE report_id=?', [finalId]);
    await run('DELETE FROM report_equipment WHERE report_id=?', [finalId]);

    if (Array.isArray(technicians)) {
      for (const t of technicians) {
        if (t.technician_id) {
          await run(
            'INSERT INTO report_technicians (report_id, technician_id, technician_name, work_date, hours_normal, hours_extra, included) VALUES (?,?,?,?,?,?,?)',
            [finalId, toInt(t.technician_id), t.technician_name, t.work_date,
             t.hours_normal, t.hours_extra, toBoolInt(t.included)]
          );
        }
      }
    }

    if (Array.isArray(equipment_ids)) {
      for (const eid of equipment_ids) {
        const eqRow = await get(
          `SELECT ce.id, ec.brand, ec.name, ce.serial_number FROM client_equipment ce
           LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ce.id = ?`,
          [toInt(eid)]
        );
        if (eqRow) {
          const info = `${eqRow.brand || ''} ${eqRow.name || 'Appareil'} ${eqRow.serial_number ? `[SN:${eqRow.serial_number}]` : ''}`.trim();
          await run('INSERT INTO report_equipment (report_id, equipment_id, equipment_info) VALUES (?, ?, ?)',
            [finalId, toInt(eid), info]);
        }
      }
    }

    if (Array.isArray(materials)) {
      for (const m of materials) {
        await run(
          'INSERT INTO report_materials (report_id, material_id, material_name, product_code, quantity, unit_price, discount, total_price, included) VALUES (?,?,?,?,?,?,?,?,?)',
          [finalId, toInt(m.material_id), m.material_name, m.product_code,
           m.quantity, m.unit_price, m.discount || 0, m.total_price, toBoolInt(m.included)]
        );
      }
    }

    if (Array.isArray(req.body.stk_tests)) {
      for (const stk of req.body.stk_tests) {
        const deviceName = String(stk.test_name || '').replace('Test de sécurité électrique obligatoire i.O - ', '');
        await run('INSERT INTO report_stk_tests (report_id, device_name, price, is_included) VALUES (?, ?, ?, ?)',
          [finalId, deviceName, stk.price, toBoolInt(stk.included)]);
      }
    }

    if (!isUpdate) {
      const reportNumber = `${new Date().getFullYear()}-${String(finalId).padStart(4, '0')}`;
      await run('UPDATE reports SET report_number = ? WHERE id = ?', [reportNumber, finalId]);
    }

    logActivity(userId, isUpdate ? 'update' : 'create', 'report', finalId, { cabinet_name, work_type });

    if (currentStatus === 'pending') {
      const author = await get('SELECT name FROM users WHERE id=?', [userId]);
      notifyRoles(VALIDATORS, 'warning',
        `📝 ${author?.name || 'Un utilisateur'} a soumis un rapport pour : ${cabinet_name}`,
        `/reports.html?id=${finalId}`);
    } else if (currentStatus === 'archived') {
      notifyRoles(['tech'], 'info',
        `📂 Rapport validé pour ${cabinet_name}. À déplacer dans le NAS.`,
        `/reports.html?id=${finalId}`);
    }

    await run('COMMIT');
    res.json({ success: true, id: finalId });
  } catch (err) {
    await run('ROLLBACK').catch(() => {});
    console.error('❌ Erreur Save Report:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement.' });
  }
};

router.post('/', requireRoles(...REPORT_AUTHORS), async (req, res) =>
  saveReportData(req, res, null, false));

router.put('/:id', requireAuth, async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  // Note : la fonction saveReportData fait elle-même la vérification d'ownership
  // pour les rôles 'tech'. Les autres rôles doivent passer par le workflow normal.
  if (!REPORT_AUTHORS.includes(req.session.role) && !VALIDATORS.includes(req.session.role)) {
    return res.status(403).json({ error: 'Permission refusée.' });
  }
  saveReportData(req, res, id, true);
});

// DELETE — tout le monde sauf secrétaires
router.delete('/:id', requireRoles('admin', 'tech', 'sales_tech', 'sales_director', 'verifier'), async (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  try {
    const result = await run('DELETE FROM reports WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Rapport introuvable.' });
    logActivity(req.session.userId, 'delete', 'report', id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
