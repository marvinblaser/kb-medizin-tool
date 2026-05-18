// server/routes/clients.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../config/database');
const { requireAuth, requireAdmin, requireStaff, requireRoles } = require('../middleware/auth');
const { isNonEmptyString, toInt, toFloat, toBoolInt, requireFields } = require('../utils/validators');
const log = require('../utils/logger');

// ─── Groupes de rôles ─────────────────────────────────────────────────────────
const CLIENT_EDITORS    = ['admin', 'tech', 'secretary', 'sales_tech', 'sales_director'];
const CLIENT_DESTROYERS = ['admin', 'sales_director'];
const PLANNERS          = ['admin', 'secretary'];
const TECH_EQUIPMENT    = ['admin', 'tech', 'secretary'];
const CONTRACT_MANAGERS = ['admin', 'secretary', 'sales_director'];

// ─── UPLOADS ──────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const CONTRACT_DIR = path.resolve(__dirname, '../../public/uploads/contracts');
if (!fs.existsSync(CONTRACT_DIR)) fs.mkdirSync(CONTRACT_DIR, { recursive: true });

const contractStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONTRACT_DIR),
  filename: (req, file, cb) => {
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    // Limite les extensions acceptées
    const safeExt = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg'].includes(ext) ? ext : '.bin';
    cb(null, `contrat-${Date.now()}-${random}${safeExt}`);
  },
});
const uploadContract = multer({
  storage: contractStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg',
                     'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Format de fichier non autorisé.'));
  },
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const notifyUser = (userId, type, message, link) => {
  db.run('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)',
    [userId, type, message, link],
    (err) => { if (err) console.error('Erreur Notif:', err.message); });
};

const notifyRoles = (rolesArray, type, message, link) => {
  const placeholders = rolesArray.map(() => '?').join(',');
  db.all(`SELECT id FROM users WHERE role IN (${placeholders})`, rolesArray, (err, rows) => {
    if (!err && rows) rows.forEach((u) => notifyUser(u.id, type, message, link));
  });
};

const cleanCanton = (val) => {
  if (!val) return '';
  let str = String(val).trim().toUpperCase();
  if (str.includes('LIECH') || str === 'FL') return 'FL';
  return str.substring(0, 2);
};

const formatSwissPhone = (val) => {
  if (!val) return '';
  let str = String(val).replace(/[\s.\-()]/g, '');
  if (str.startsWith('+41')) str = '0' + str.substring(3);
  else if (str.startsWith('0041')) str = '0' + str.substring(4);
  if (/^0\d{9}$/.test(str)) return str.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  return str;
};

const logActivity = (userId, action, entity, entityId, meta = {}) => {
  db.run('INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entity, entityId, JSON.stringify(meta)]);
};

// ──────────────────────────────────────────────────────────────────────────────
//                                IMPORT / EXPORT
// ──────────────────────────────────────────────────────────────────────────────
router.post('/import', requireRoles('admin', 'secretary'), upload.single('file'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni.' });

  let data;
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  } catch (e) {
    return res.status(400).json({ error: 'Fichier illisible.' });
  }
  if (!data || data.length === 0) return res.json({ success: true, count: 0 });

  // Promisify pour vraiment attendre la fin de l'insert
  const stmt = db.prepare(`INSERT INTO clients (cabinet_name, contact_name, address, postal_code, city, canton, email, phone, activity, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Autre', datetime('now'))`);
  const runP = (params) => new Promise((resolve, reject) =>
    stmt.run(...params, (err) => err ? reject(err) : resolve()));

  (async () => {
    let count = 0;
    for (const row of data) {
      const cabinet = row['Nom'] || row['Cabinet'] || row['Nom Cabinet'] || 'Cabinet Sans Nom';
      const contact = row['Contact'] || row['Nom Contact'] || '';
      const address = row['Adresse'] || row['Rue'] || '';
      const cp = row['NPA'] || row['CP'] || row['Code Postal'] || '';
      const city = row['Ville'] || row['City'] || 'Ville Inconnue';
      const email = row['Email'] || row['Mail'] || '';
      const canton = cleanCanton(row['Canton'] || row['Ct'] || row['Dpt']);
      const phone = formatSwissPhone(row['Téléphone'] || row['Tel'] || row['Phone']);
      try {
        await runP([cabinet, contact, address, cp, city, canton, email, phone]);
        count++;
      } catch (e) { console.error('Import row error:', e.message); }
    }
    stmt.finalize();
    res.json({ success: true, count });
  })().catch(next);
});

router.get('/export-excel', requireRoles('admin', 'sales_director', 'secretary'), (req, res, next) => {
  const sql = `SELECT c.*, ce.serial_number, ce.installed_at, ce.last_maintenance_date, ce.next_maintenance_date,
               ec.name as equip_name, ec.brand as equip_brand, ec.model as equip_model
               FROM clients c
               LEFT JOIN client_equipment ce ON c.id = ce.client_id
               LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
               ORDER BY c.cabinet_name`;
  db.all(sql, [], (err, rows) => {
    if (err) return next(err);
    const map = {};
    rows.forEach((row) => {
      if (!map[row.id]) {
        map[row.id] = {
          Cabinet: row.cabinet_name, Contact: row.contact_name, Secteur: row.activity,
          Adresse: row.address, NPA: row.postal_code, Ville: row.city, Canton: row.canton,
          Téléphone: row.phone, Email: row.email, 'Parc Machines': [],
        };
      }
      if (row.equip_name) {
        const dateExp = row.next_maintenance_date ? ` - Exp: ${row.next_maintenance_date}` : '';
        map[row.id]['Parc Machines'].push(
          `• ${row.equip_brand} ${row.equip_name} (${row.equip_model || '-'}) [SN:${row.serial_number || '?'}]${dateExp}`
        );
      }
    });
    const exportData = Object.values(map).map((c) => ({ ...c, 'Parc Machines': c['Parc Machines'].join('\n') }));
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 15 }, { wch: 25 }, { wch: 80 }];
    xlsx.utils.book_append_sheet(wb, ws, 'Liste Clients');
    res.setHeader('Content-Disposition', `attachment; filename="Export_Clients_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//                                  LECTURE
// ──────────────────────────────────────────────────────────────────────────────
router.get('/technicians', requireStaff, (req, res, next) =>
  db.all('SELECT id, name, role FROM users ORDER BY name ASC', [], (err, rows) =>
    err ? next(err) : res.json(rows)));

router.get('/planning', requireStaff, (req, res, next) => {
  const { search, status, canton, category, showHidden, brand, model, serialNumber } = req.query;
  const where = [
    'ce.next_maintenance_date IS NOT NULL',
    '(ce.is_secondary = 0 OR ce.is_secondary IS NULL)',
    '(ec.is_secondary = 0 OR ec.is_secondary IS NULL)',
  ];
  const params = [];
  if (showHidden !== 'true') where.push('(c.is_hidden = 0 OR c.is_hidden IS NULL)');
  if (search) {
    where.push('(c.cabinet_name LIKE ? OR c.city LIKE ? OR ec.brand LIKE ? OR ec.model LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (canton) { where.push('c.canton = ?'); params.push(canton); }
  if (category) { where.push('c.activity = ?'); params.push(category); }

  // Filtres avancés : marque, modèle, n° série
  if (brand && brand.trim()) {
    where.push('ec.brand LIKE ?');
    params.push(`%${brand}%`);
  }
  if (model && model.trim()) {
    where.push('(ec.model LIKE ? OR ec.name LIKE ?)');
    params.push(`%${model}%`, `%${model}%`);
  }
  if (serialNumber && serialNumber.trim()) {
    where.push('ce.serial_number LIKE ?');
    params.push(`%${serialNumber}%`);
  }

  const sql = `
    SELECT ce.id as equipment_id, ce.next_maintenance_date, ce.serial_number, ce.location,
    c.id as client_id, c.cabinet_name, c.city, c.address, c.canton, c.phone,
    ec.name as catalog_name, ec.brand, ec.model,
    (julianday(ce.next_maintenance_date) - julianday('now')) as days_remaining,
    (SELECT id FROM appointments_history ah WHERE ah.client_id = c.id AND ah.appointment_date >= date('now') ORDER BY ah.appointment_date ASC LIMIT 1) as future_rdv_id,
    (SELECT appointment_date FROM appointments_history ah WHERE ah.client_id = c.id AND ah.appointment_date >= date('now') ORDER BY ah.appointment_date ASC LIMIT 1) as future_rdv_date
    FROM client_equipment ce
    JOIN clients c ON ce.client_id = c.id
    JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ${where.join(' AND ')}
    ORDER BY c.canton ASC, c.city ASC, ce.next_maintenance_date ASC`;

  db.all(sql, params, (err, rows) => {
    if (err) return next(err);
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.client_id)) {
        map.set(row.client_id, {
          client_id: row.client_id, cabinet_name: row.cabinet_name, city: row.city,
          canton: row.canton, address: row.address, phone: row.phone,
          machines: [], worst_status_score: 0, earliest_date: row.next_maintenance_date,
          has_future_rdv: !!row.future_rdv_id,
        });
      }
      const c = map.get(row.client_id);
      let st = 'ok';
      if (row.days_remaining < 0) st = 'expired';
      else if (row.days_remaining <= 60) st = 'warning';
      let score = st === 'expired' ? 2 : (st === 'warning' ? 1 : 0);
      if (row.future_rdv_id) { score = 0; c.future_rdv_id = row.future_rdv_id; c.future_rdv_date = row.future_rdv_date; st = 'planned'; }
      if (score > c.worst_status_score) c.worst_status_score = score;
      if (row.next_maintenance_date < c.earliest_date) c.earliest_date = row.next_maintenance_date;
      c.machines.push({
        id: row.equipment_id, name: `${row.brand} ${row.catalog_name}`, model: row.model,
        serial: row.serial_number, location: row.location, next_date: row.next_maintenance_date,
        status: st, days: Math.round(row.days_remaining),
      });
    });
    let result = Array.from(map.values());
    if (status === 'expired') result = result.filter((c) => c.worst_status_score === 2);
    else if (status === 'warning') result = result.filter((c) => c.worst_status_score === 1);
    else if (status === 'ok') result = result.filter((c) => c.worst_status_score === 0);
    result.sort((a, b) => b.worst_status_score - a.worst_status_score
                      || a.earliest_date.localeCompare(b.earliest_date));
    res.json({ data: result });
  });
});

router.get('/', requireStaff, (req, res, next) => {
  const { search, canton, category, sortBy, sortOrder, showHidden, brand, model, serialNumber } = req.query;
  const where = ['1=1'];
  const params = [];
  if (showHidden !== 'true') where.push('(c.is_hidden = 0 OR c.is_hidden IS NULL)');
  if (search) {
    where.push('(c.cabinet_name LIKE ? OR c.city LIKE ? OR c.contact_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (canton) { where.push('c.canton = ?'); params.push(canton); }
  if (category) { where.push('c.activity = ?'); params.push(category); }

  // Filtres avancés : marque, modèle, n° série
  if (brand) {
    where.push('EXISTS (SELECT 1 FROM client_equipment ce JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ce.client_id = c.id AND ec.brand LIKE ?)');
    params.push(`%${brand}%`);
  }
  if (model) {
    where.push('EXISTS (SELECT 1 FROM client_equipment ce JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ce.client_id = c.id AND (ec.model LIKE ? OR ec.name LIKE ?))');
    params.push(`%${model}%`, `%${model}%`);
  }
  if (serialNumber) {
    where.push('EXISTS (SELECT 1 FROM client_equipment ce WHERE ce.client_id = c.id AND ce.serial_number LIKE ?)');
    params.push(`%${serialNumber}%`);
  }

  let order = 'c.cabinet_name ASC';
  const allowedSort = ['cabinet_name', 'city', 'appointment_at', 'created_at'];
  if (sortBy && allowedSort.includes(sortBy)) {
    order = `c.${sortBy} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
  }

  const sql = `
    SELECT c.*,
    (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ';;') FROM client_equipment ce JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ce.client_id = c.id) as equipment_summary,
    EXISTS (SELECT 1 FROM appointments_history ah WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')) as has_future_rdv,
    EXISTS (SELECT 1 FROM client_equipment ce WHERE ce.client_id = c.id AND ce.next_maintenance_date < date('now')) as has_expired_machines
    FROM clients c WHERE ${where.join(' AND ')} GROUP BY c.id ORDER BY ${order}`;
  db.all(sql, params, (err, rows) => {
    if (err) return next(err);
    res.json({ clients: rows, count: rows.length });
  });
});

router.get('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const sql = `
    SELECT c.*,
    (SELECT appointment_date FROM appointments_history ah WHERE ah.client_id = c.id AND ah.appointment_date >= date('now') ORDER BY appointment_date ASC LIMIT 1) as next_rdv_date,
    (SELECT name FROM users u JOIN appointments_history ah ON u.id = ah.technician_id WHERE ah.client_id = c.id AND ah.appointment_date >= date('now') ORDER BY appointment_date ASC LIMIT 1) as next_rdv_tech
    FROM clients c WHERE c.id = ?`;
  db.get(sql, [id], (err, row) => {
    if (err) return next(err);
    if (!row) return res.status(404).json({ error: 'Client introuvable.' });
    res.json(row);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//                            CRUD CLIENTS (sécurisé)
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', requireRoles(...CLIENT_EDITORS), (req, res, next) => {
  const err = requireFields(req.body, ['cabinet_name', 'contact_name', 'activity', 'address', 'canton', 'city']);
  if (err) return res.status(400).json({ error: err });
 
  const { cabinet_name, contact_name, activity, address, postal_code, city, canton,
          phone, email, notes, latitude, longitude } = req.body;
 
  db.run(
    `INSERT INTO clients (cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, notes, latitude, longitude)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [cabinet_name, contact_name, activity, address, postal_code, city, canton,
     phone, email, notes, toFloat(latitude), toFloat(longitude)],
    function (err) {
      if (err) return next(err);
      const newId = this.lastID;
 
      // ── LOG ────────────────────────────────────────────────────────────────
      logActivity(req.session.userId, 'create', 'client', newId, { name: cabinet_name });
      log.create(req, 'client', newId, `"${cabinet_name}" — ${city} (${canton})`);
 
      notifyRoles(['admin', 'secretary'], 'success',
        `Nouveau client ajouté : ${cabinet_name} (${city})`, `/clients.html?open=${newId}`);
 
      res.json({ id: newId });
    }
  );
});

router.put('/bulk-update', requireStaff, (req, res, next) => {
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Aucune sélection.' });
  const cleanIds = ids.map((i) => toInt(i)).filter((n) => n !== null);
  if (cleanIds.length === 0) return res.status(400).json({ error: 'IDs invalides.' });

  const placeholders = cleanIds.map(() => '?').join(',');
  let sql;
  if (action === 'hide')        sql = `UPDATE clients SET is_hidden = 1 WHERE id IN (${placeholders})`;
  else if (action === 'show')   sql = `UPDATE clients SET is_hidden = 0 WHERE id IN (${placeholders})`;
  else if (action === 'delete') sql = `DELETE FROM clients WHERE id IN (${placeholders})`;
  else return res.status(400).json({ error: 'Action inconnue.' });

  db.run(sql, cleanIds, function (err) {
    if (err) return next(err);
    logActivity(req.session.userId, `bulk_${action}`, 'client', 0, { count: this.changes });
    res.json({ success: true, count: this.changes });
  });
});

// ─── PUT /:id — Modification client ──────────────────────────────────────────
router.put('/:id', requireRoles(...CLIENT_EDITORS), (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
 
  const { cabinet_name, activity, contact_name, phone, email, address,
          postal_code, city, canton, latitude, longitude, notes, has_contract } = req.body;
 
  db.run(
    `UPDATE clients SET cabinet_name=?, activity=?, contact_name=?, phone=?, email=?,
     address=?, postal_code=?, city=?, canton=?, latitude=?, longitude=?, notes=?, has_contract=? WHERE id=?`,
    [cabinet_name, activity, contact_name, phone, email, address, postal_code, city, canton,
     toFloat(latitude), toFloat(longitude), notes, toBoolInt(has_contract), id],
    function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Client introuvable.' });
 
      // ── LOG ────────────────────────────────────────────────────────────────
      log.update(req, 'client', id, `"${cabinet_name}" — ${city} (${canton})`);
 
      res.json({ success: true });
    }
  );
});
router.delete('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
 
  db.get('SELECT cabinet_name, city FROM clients WHERE id = ?', [id], (err, client) => {
    db.run('DELETE FROM clients WHERE id = ?', [id], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Client introuvable.' });
 
      // ── LOG ────────────────────────────────────────────────────────────────
      logActivity(req.session.userId, 'delete', 'client', id);
      log.delete(req, 'client', id,
        `"${client?.cabinet_name || '—'}" (${client?.city || '—'}) supprimé`);
 
      res.json({ success: true });
    });
  });
});

router.put('/:id/toggle-hidden', requireRoles(...PLANNERS), (req, res, next) => {
  db.run('UPDATE clients SET is_hidden = ? WHERE id = ?',
    [toBoolInt(req.body.is_hidden), toInt(req.params.id)],
    function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Client introuvable.' });
      res.json({ success: true });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
//                              ÉQUIPEMENTS
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id/equipment', requireStaff, (req, res, next) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT ce.*, ec.name, ec.name_de, ec.brand, ec.model, ec.type,
    ec.is_secondary as catalog_is_secondary,
    (ec.name || ' ' || COALESCE(ec.model, '')) as final_name,
    ec.brand as final_brand,
    (julianday(ce.next_maintenance_date) - julianday(?)) as days_remaining
    FROM client_equipment ce
    JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.client_id = ?
    ORDER BY ce.location ASC, ce.next_maintenance_date ASC`;
  db.all(sql, [today, toInt(req.params.id)], (err, rows) =>
    err ? next(err) : res.json(rows));
});

router.post('/:id/equipment', requireRoles(...TECH_EQUIPMENT), (req, res, next) => {
  const clientId = toInt(req.params.id);
  if (!clientId) return res.status(400).json({ error: 'Client invalide.' });
  const { equipment_id, serial_number, installed_at, last_maintenance_date,
          maintenance_interval, location, notes, is_secondary } = req.body;
  let nextDate = null;
  if (last_maintenance_date && maintenance_interval) {
    const d = new Date(last_maintenance_date);
    if (!isNaN(d)) {
      d.setFullYear(d.getFullYear() + parseInt(maintenance_interval));
      nextDate = d.toISOString().split('T')[0];
    }
  }
  db.run(
    `INSERT INTO client_equipment (client_id, equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, next_maintenance_date, location, notes, is_secondary)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [clientId, toInt(equipment_id), serial_number, installed_at, last_maintenance_date,
     toInt(maintenance_interval), nextDate, location, notes, toBoolInt(is_secondary)],
    function (err) {
      if (err) return next(err);
      const newId = this.lastID;
      db.get(
        'SELECT c.cabinet_name, ec.name, ec.brand FROM clients c, equipment_catalog ec WHERE c.id = ? AND ec.id = ?',
        [clientId, equipment_id],
        (err, row) => {
          if (row) notifyRoles(['admin', 'secretary'], 'info',
            `Nouvel équipement (${row.brand} ${row.name}) ajouté chez : ${row.cabinet_name}`,
            `/clients.html?open=${clientId}`);
        }
      );
      res.json({ id: newId });
    }
  );
});

router.put('/:clientId/equipment/:eqId', requireRoles(...TECH_EQUIPMENT), (req, res, next) => {
  const { equipment_id, serial_number, installed_at, last_maintenance_date,
          maintenance_interval, location, notes, is_secondary } = req.body;
  let nextDate = null;
  if (last_maintenance_date && maintenance_interval) {
    const d = new Date(last_maintenance_date);
    if (!isNaN(d)) {
      d.setFullYear(d.getFullYear() + parseInt(maintenance_interval));
      nextDate = d.toISOString().split('T')[0];
    }
  }
  db.run(
    `UPDATE client_equipment SET equipment_id=?, serial_number=?, installed_at=?, last_maintenance_date=?,
     maintenance_interval=?, next_maintenance_date=?, location=?, notes=?, is_secondary=?
     WHERE id=? AND client_id=?`,
    [toInt(equipment_id), serial_number, installed_at, last_maintenance_date,
     toInt(maintenance_interval), nextDate, location, notes, toBoolInt(is_secondary),
     toInt(req.params.eqId), toInt(req.params.clientId)],
    function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Équipement introuvable.' });
      res.json({ success: true });
    }
  );
});

router.delete('/:clientId/equipment/:eqId', requireRoles(...TECH_EQUIPMENT), (req, res, next) => {
  db.run('DELETE FROM client_equipment WHERE id=? AND client_id=?',
    [toInt(req.params.eqId), toInt(req.params.clientId)],
    function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Équipement introuvable.' });
      res.json({ success: true });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
//                            HISTORIQUE & RDV
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id/appointments', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const sql = `
    SELECT 'report' as source_type, r.id as id_unique, r.id as report_id, r.report_number,
           r.technician_signature_date as appointment_date, r.work_accomplished as task_description,
           u.name as tech_name,
           (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ', ') FROM report_equipment re JOIN equipment_catalog ec ON re.equipment_id = ec.id WHERE re.report_id = r.id) as machines
    FROM reports r LEFT JOIN users u ON r.author_id = u.id
    WHERE r.client_id = ? AND r.status IN ('validated', 'archived')
    UNION ALL
    SELECT 'rdv' as source_type, ah.id as id_unique, ah.report_id as report_id, NULL as report_number,
           ah.appointment_date, ah.task_description,
           (SELECT group_concat(u.name, ', ') FROM appointment_technicians at JOIN users u ON at.user_id = u.id WHERE at.appointment_id = ah.id) as tech_name,
           (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ', ') FROM appointment_equipment ae JOIN client_equipment ce ON ae.equipment_id = ce.id JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ae.appointment_id = ah.id) as machines
    FROM appointments_history ah WHERE ah.client_id = ?
    ORDER BY appointment_date DESC`;
  db.all(sql, [id, id], (err, rows) => err ? next(err) : res.json(rows));
});

router.post('/:id/appointments', requireRoles(...PLANNERS), (req, res, next) => {
  const clientId = toInt(req.params.id);
  if (!clientId) return res.status(400).json({ error: 'Client invalide.' });
  const { appointment_date, technician_ids, task_description } = req.body;
  if (!isNonEmptyString(appointment_date)) return res.status(400).json({ error: 'Date requise.' });

  db.serialize(() => {
    db.run('INSERT INTO appointments_history (client_id, appointment_date, task_description) VALUES (?, ?, ?)',
      [clientId, appointment_date, task_description], function (err) {
        if (err) return next(err);
        const rdvId = this.lastID;

        if (Array.isArray(technician_ids) && technician_ids.length > 0) {
          const placeholders = technician_ids.map(() => '(?, ?)').join(',');
          const values = [];
          technician_ids.forEach((uid) => values.push(rdvId, toInt(uid)));
          db.run(`INSERT INTO appointment_technicians (appointment_id, user_id) VALUES ${placeholders}`, values);

          db.get('SELECT cabinet_name FROM clients WHERE id=?', [clientId], (err, row) => {
            const cab = row ? row.cabinet_name : 'un client';
            const dateFr = new Date(appointment_date).toLocaleDateString('fr-CH');
            technician_ids.forEach((uid) =>
              notifyUser(toInt(uid), 'info',
                `📅 Nouveau RDV assigné le ${dateFr} pour : ${cab}`,
                `/clients.html?open=${clientId}`));
          });
        }
        db.run('UPDATE clients SET appointment_at = ? WHERE id = ?', [appointment_date, clientId]);
        res.json({ message: 'RDV créé', id: rdvId });
      });
  });
});

router.delete('/appointments/:id', requireRoles(...PLANNERS), (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  db.get(
    'SELECT ah.appointment_date, c.cabinet_name FROM appointments_history ah JOIN clients c ON ah.client_id = c.id WHERE ah.id = ?',
    [id], (err, rdv) => {
      if (rdv) {
        db.all('SELECT user_id FROM appointment_technicians WHERE appointment_id = ?', [id], (err, techs) => {
          if (techs && techs.length > 0) {
            const dateFr = new Date(rdv.appointment_date).toLocaleDateString('fr-CH');
            techs.forEach((t) => notifyUser(t.user_id, 'error',
              `❌ RDV ANNULÉ : L'intervention du ${dateFr} pour ${rdv.cabinet_name} a été annulée.`,
              '/clients.html?view=planning'));
          }
          db.run('DELETE FROM appointment_technicians WHERE appointment_id = ?', [id]);
          db.run('DELETE FROM appointments_history WHERE id = ?', [id], (err) =>
            err ? next(err) : res.json({ message: 'RDV supprimé' }));
        });
      } else {
        db.run('DELETE FROM appointments_history WHERE id = ?', [id], (err) =>
          err ? next(err) : res.json({ message: 'RDV supprimé' }));
      }
    });
});

router.get('/appointments/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const sql = `SELECT ah.*, (SELECT group_concat(user_id) FROM appointment_technicians WHERE appointment_id = ah.id) as technician_ids
               FROM appointments_history ah WHERE id = ?`;
  db.get(sql, [id], (err, row) => {
    if (err) return next(err);
    if (!row) return res.status(404).json({ error: 'RDV introuvable.' });
    row.technician_ids = row.technician_ids ? row.technician_ids.split(',').map(Number) : [];
    res.json(row);
  });
});

router.put('/appointments/:id', requireRoles(...PLANNERS), (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const { appointment_date, technician_ids, task_description } = req.body;
  db.serialize(() => {
    db.run('UPDATE appointments_history SET appointment_date = ?, task_description = ? WHERE id = ?',
      [appointment_date, task_description, id]);
    db.run('DELETE FROM appointment_technicians WHERE appointment_id = ?', [id]);

    if (Array.isArray(technician_ids) && technician_ids.length > 0) {
      const placeholders = technician_ids.map(() => '(?, ?)').join(',');
      const values = [];
      technician_ids.forEach((uid) => values.push(id, toInt(uid)));
      db.run(`INSERT INTO appointment_technicians (appointment_id, user_id) VALUES ${placeholders}`, values);

      db.get(
        'SELECT c.cabinet_name FROM appointments_history ah JOIN clients c ON ah.client_id = c.id WHERE ah.id=?',
        [id], (err, row) => {
          const cab = row ? row.cabinet_name : 'un client';
          const dateFr = new Date(appointment_date).toLocaleDateString('fr-CH');
          technician_ids.forEach((uid) => notifyUser(toInt(uid), 'warning',
            `🔄 Modification de votre RDV du ${dateFr} pour : ${cab}`,
            '/clients.html?view=planning'));
        });
    }
    db.get('SELECT client_id FROM appointments_history WHERE id = ?', [id], (err, row) => {
      if (row) db.run('UPDATE clients SET appointment_at = ? WHERE id = ?',
        [appointment_date, row.client_id]);
      res.json({ message: 'RDV mis à jour' });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//                              CONTRATS
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/contract', requireRoles(...CONTRACT_MANAGERS), uploadContract.single('file'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const filePath = `/uploads/contracts/${req.file.filename}`;
  db.run('UPDATE clients SET contract_file = ? WHERE id = ?', [filePath, id], function (err) {
    if (err) return next(err);
    if (this.changes === 0) return res.status(404).json({ error: 'Client introuvable.' });
    res.json({ success: true, filePath });
  });
});

router.delete('/:id/contract', requireRoles(...CONTRACT_MANAGERS), (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  db.get('SELECT contract_file FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) return next(err);
    if (row && row.contract_file) {
      // Sécurité : vérifier que le fichier est bien dans CONTRACT_DIR
      // (protection contre path traversal)
      const filename = path.basename(row.contract_file);
      const safePath = path.join(CONTRACT_DIR, filename);
      if (safePath.startsWith(CONTRACT_DIR) && fs.existsSync(safePath)) {
        try { fs.unlinkSync(safePath); }
        catch (e) { console.error('Échec suppression fichier:', e.message); }
      }
    }
    db.run('UPDATE clients SET contract_file = NULL WHERE id = ?', [id], (err) =>
      err ? next(err) : res.json({ success: true }));
  });
});

router.get('/:id/history', requireAuth, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
 
  const results = {};
  let pending = 4;
 
  const done = (key, data) => {
    results[key] = data;
    if (--pending === 0) {
      const all = [
        ...(results.rdv     || []),
        ...(results.tickets || []),
        ...(results.rmas    || []),
        ...(results.loans   || []),
      ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      res.json(all);
    }
  };
 
  // ── RAPPORTS + RDVs ───────────────────────────────────────────────────────
  db.all(`
    SELECT
      'rapport'   AS type,
      r.id        AS id,
      COALESCE(
        NULLIF(r.technician_signature_date, ''),
        NULLIF(r.validated_at, ''),
        r.created_at
      )           AS date,
      COALESCE(
        NULLIF(r.title, ''),
        NULLIF(r.report_number, ''),
        'Rapport d''intervention'
      )           AS description,
      u.name      AS tech_name,
      r.status    AS status,
      r.report_number AS ref,
      r.id        AS link_id,
      (SELECT GROUP_CONCAT(ec.name || ' (' || ec.brand || ')', ', ')
         FROM report_equipment re
         JOIN equipment_catalog ec ON re.equipment_id = ec.id
        WHERE re.report_id = r.id) AS machines
    FROM reports r
    LEFT JOIN users u ON r.author_id = u.id
    WHERE r.client_id = ?
      AND r.status IN ('archived', 'validated')
 
    UNION ALL
 
    SELECT
      'rdv'       AS type,
      ah.id       AS id,
      ah.appointment_date AS date,
      COALESCE(NULLIF(ah.task_description, ''), 'Rendez-vous') AS description,
      (SELECT GROUP_CONCAT(u2.name, ', ')
         FROM appointment_technicians att
         JOIN users u2 ON att.user_id = u2.id
        WHERE att.appointment_id = ah.id) AS tech_name,
      NULL        AS status,
      NULL        AS ref,
      NULL        AS link_id,
      (SELECT GROUP_CONCAT(ec.name || ' (' || ec.brand || ')', ', ')
         FROM appointment_equipment ae
         JOIN client_equipment ce ON ae.equipment_id = ce.id
         JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ae.appointment_id = ah.id) AS machines
    FROM appointments_history ah
    WHERE ah.client_id = ?
    ORDER BY date DESC`,
    [id, id],
    (err, rows) => {
      if (err) console.error('history/rdv:', err.message);
      done('rdv', err ? [] : rows);
    }
  );
 
  // ── TICKETS ───────────────────────────────────────────────────────────────
  db.all(`
    SELECT
      'ticket'    AS type,
      t.id        AS id,
      t.created_at AS date,
      COALESCE(NULLIF(t.title, ''), 'Ticket #' || t.id) AS description,
      u.name      AS tech_name,
      t.status    AS status,
      t.id        AS ref,
      t.id        AS link_id,
      NULL        AS machines
    FROM tickets t
    LEFT JOIN users u ON t.creator_id = u.id
    WHERE t.client_id = ?
    ORDER BY t.created_at DESC`,
    [id], (err, rows) => {
      if (err) console.error('history/tickets:', err.message);
      done('tickets', err ? [] : rows);
    }
  );
 
  // ── RMAs ──────────────────────────────────────────────────────────────────
  db.all(`
    SELECT
      'rma'       AS type,
      rma.id      AS id,
      rma.created_at AS date,
      COALESCE(NULLIF(ec.name, ''), 'Appareil inconnu') AS description,
      u.name      AS tech_name,
      rma.status  AS status,
      COALESCE(NULLIF(rma.rma_number, ''), CAST(rma.id AS TEXT)) AS ref,
      rma.id      AS link_id,
      NULL        AS machines
    FROM rmas rma
    LEFT JOIN client_equipment ce  ON rma.equipment_id = ce.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id  = ec.id
    LEFT JOIN users u              ON rma.created_by   = u.id
    WHERE rma.client_id = ?
    ORDER BY rma.created_at DESC`,
    [id], (err, rows) => {
      if (err) console.error('history/rmas:', err.message);
      done('rmas', err ? [] : rows);
    }
  );
 
  // ── PRÊTS ─────────────────────────────────────────────────────────────────
  db.all(`
    SELECT
      'pret'      AS type,
      l.id        AS id,
      l.start_date AS date,
      COALESCE(NULLIF(d.name, ''), 'Appareil prêté') AS description,
      NULL        AS tech_name,
      l.status    AS status,
      l.id        AS ref,
      l.id        AS link_id,
      NULL        AS machines
    FROM loans l
    LEFT JOIN loan_devices d ON l.device_id = d.id
    WHERE l.client_id = ?
    ORDER BY l.start_date DESC`,
    [id], (err, rows) => {
      if (err) console.error('history/loans:', err.message);
      done('loans', err ? [] : rows);
    }
  );
});

module.exports = router;