// server/routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const xlsx = require('xlsx');
const { db } = require('../config/database');
const { requireAdmin, requireAuth, requireStaff, requireRoles } = require('../middleware/auth');
const { isNonEmptyString, isValidEmail, toInt, toBoolInt, requireFields } = require('../utils/validators');
const log = require('../utils/logger');

// Rôles autorisés à gérer le catalogue (matériel, équipement, secteurs)
const CATALOG_MANAGERS = ['admin', 'secretary'];

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
const notifyUser = (userId, type, message, link) => {
  db.run(
    'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)',
    [userId, type, message, link],
    (err) => { if (err) console.error('Erreur Notif:', err.message); }
  );
};
const notifyRoles = (rolesArray, type, message, link) => {
  const placeholders = rolesArray.map(() => '?').join(',');
  db.all(`SELECT id FROM users WHERE role IN (${placeholders})`, rolesArray, (err, rows) => {
    if (!err && rows) rows.forEach((u) => notifyUser(u.id, type, message, link));
  });
};

// ─── UPLOADS ──────────────────────────────────────────────────────────────────
// Génération de nom de fichier sécurisée (crypto au lieu de Math.random)
const safeFilename = (prefix, originalname) => {
  const random = crypto.randomBytes(16).toString('hex');
  const ext = path.extname(originalname).toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
  return `${prefix}-${Date.now()}-${random}${safeExt}`;
};

const storageAvatar = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/uploads/avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, safeFilename('avatar', file.originalname)),
});
const uploadAvatar = multer({
  storage: storageAvatar,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Images uniquement'));
  },
});
const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max pour les imports
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const parsePrice = (raw) => {
  if (raw === null || raw === undefined || raw === '') return 0;
  let str = String(raw).trim();
  if (str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); }
  str = str.replace(/[^0-9.-]/g, '');
  const val = parseFloat(str);
  return isNaN(val) ? 0 : Math.round(val * 100) / 100;
};

// ──────────────────────────────────────────────────────────────────────────────
//                                MATERIALS
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/materials/all', requireAdmin, (req, res, next) => {
  db.serialize(() => {
    db.run('DELETE FROM materials');
    db.run("DELETE FROM sqlite_sequence WHERE name='materials'");
    db.run(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
      [req.session.userId, 'DELETE_ALL_MATERIALS', 'Material', 0],
      (err) => err ? next(err) : res.json({ success: true, message: 'Tout le matériel a été supprimé.' })
    );
  });
});

router.post('/materials/import', requireStaff, uploadFile.single('file'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni.' });

  let workbook, data;
  try {
    workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false });
  } catch (e) {
    return res.status(400).json({ error: 'Fichier illisible.' });
  }

  if (!data || data.length === 0) return res.json({ success: true, count: 0 });

  // Promisify pour pouvoir vraiment attendre la fin
  const runAsync = (stmt, params) => new Promise((resolve, reject) => {
    stmt.run(...params, (err) => err ? reject(err) : resolve());
  });
  const getAsync = (stmt, params) => new Promise((resolve, reject) => {
    stmt.get(...params, (err, row) => err ? reject(err) : resolve(row));
  });

  (async () => {
    const checkStmt = db.prepare('SELECT id FROM materials WHERE product_code = ?');
    const updateStmt = db.prepare('UPDATE materials SET name = ?, unit_price = ? WHERE id = ?');
    const insertStmt = db.prepare('INSERT INTO materials (product_code, name, unit_price) VALUES (?, ?, ?)');

    let count = 0;
    try {
      for (const row of data) {
        const normalized = {};
        Object.keys(row).forEach((k) => normalized[k.trim().toLowerCase()] = row[k]);
        const code = normalized['code produit'] || normalized['code'] || normalized['product_code'];
        const designation = normalized['désignation'] || normalized['designation'] || normalized['nom'] || normalized['name'];
        const priceRaw = normalized['prix'] || normalized['price'] || normalized['unit_price'];

        if (!code || !designation) continue;

        const price = parsePrice(priceRaw);
        const existing = await getAsync(checkStmt, [String(code)]);
        if (existing) await runAsync(updateStmt, [String(designation), price, existing.id]);
        else await runAsync(insertStmt, [String(code), String(designation), price]);
        count++;
      }
    } finally {
      checkStmt.finalize();
      updateStmt.finalize();
      insertStmt.finalize();
    }

    db.run(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
      [req.session.userId, 'IMPORT_MATERIALS', 'Material', 0]
    );
    res.json({ success: true, count });
  })().catch(next);
});

router.get('/materials', requireStaff, (req, res, next) =>
  db.all('SELECT * FROM materials ORDER BY name', [], (err, rows) =>
    err ? next(err) : res.json(rows)));

router.post('/materials', requireStaff, (req, res, next) => {
  const err = requireFields(req.body, ['name', 'product_code']);
  if (err) return res.status(400).json({ error: err });
  const { name, product_code, unit_price } = req.body;
 
  db.run(
    'INSERT INTO materials (name, product_code, unit_price) VALUES (?, ?, ?)',
    [name.trim(), product_code.trim(), parsePrice(unit_price)],
    function (err) {
      if (err) return next(err);
      // ── LOG ────────────────────────────────────────────────────────────────
      log.create(req, 'matériel', this.lastID,
        `"${name}" — Code: ${product_code} — Prix: ${parsePrice(unit_price)} CHF`);
      res.json({ id: this.lastID });
    }
  );
});

router.put('/materials/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const err = requireFields(req.body, ['name', 'product_code']);
  if (err) return res.status(400).json({ error: err });
  const { name, product_code, unit_price } = req.body;
 
  db.run(
    'UPDATE materials SET name=?, product_code=?, unit_price=? WHERE id=?',
    [name.trim(), product_code.trim(), parsePrice(unit_price), id],
    function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Matériel introuvable.' });
      // ── LOG ────────────────────────────────────────────────────────────────
      log.update(req, 'matériel', id,
        `"${name}" — Code: ${product_code} — Prix: ${parsePrice(unit_price)} CHF`);
      res.json({ success: true });
    }
  );
});

router.delete('/materials/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
 
  db.get('SELECT name FROM materials WHERE id = ?', [id], (err, mat) => {
    db.run('DELETE FROM materials WHERE id = ?', [id], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Matériel introuvable.' });
      // ── LOG ────────────────────────────────────────────────────────────────
      log.delete(req, 'matériel', id, `"${mat?.name || '—'}" supprimé`);
      res.json({ success: true });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//                                  USERS
// ──────────────────────────────────────────────────────────────────────────────
// Liste des utilisateurs : ADMIN UNIQUEMENT (avant : requireAuth = fuite d'info)
router.get('/users', requireAdmin, (req, res, next) =>
  db.all(
    'SELECT id, email, role, name, phone, photo_url, is_active, last_login_at FROM users ORDER BY name',
    [], (err, rows) => err ? next(err) : res.json(rows)
  )
);

// Liste des techniciens (accessible à tout le staff)
router.get('/technicians', requireStaff, (req, res, next) =>
  db.all(
    'SELECT id, name, role FROM users WHERE role IN (?, ?, ?, ?) ORDER BY name',
    ['admin', 'tech', 'sales_tech', 'verifier'],
    (err, rows) => err ? next(err) : res.json(rows)
  )
);

// Création utilisateur — admin uniquement, avec validation stricte
router.post('/users', requireAdmin, uploadAvatar.single('photo'), async (req, res, next) => {
  const { email, password, role, name, phone, is_active } = req.body;
 
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email invalide.' });
  if (!isNonEmptyString(password) || password.length < 6)
    return res.status(400).json({ error: 'Mot de passe requis (6 caractères minimum).' });
  if (!isNonEmptyString(name)) return res.status(400).json({ error: 'Nom requis.' });
  if (!isNonEmptyString(role)) return res.status(400).json({ error: 'Rôle requis.' });
 
  db.get('SELECT slug FROM roles WHERE slug = ?', [role], async (err, roleRow) => {
    if (err) return next(err);
    if (!roleRow) return res.status(400).json({ error: 'Rôle inconnu.' });
 
    try {
      const hash      = await bcrypt.hash(password, 10);
      const photo_url = req.file ? `/uploads/avatars/${req.file.filename}` : null;
 
      db.run(
        'INSERT INTO users (email, password_hash, role, name, phone, photo_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [email.trim(), hash, role, name.trim(), phone || null, photo_url, toBoolInt(is_active)],
        function (err) {
          if (err) {
            const msg = err.message.includes('UNIQUE') ? 'Email déjà utilisé' : 'Erreur BDD';
            return res.status(400).json({ error: msg });
          }
          const newId = this.lastID;
          // ── LOG ────────────────────────────────────────────────────────────
          log.create(req, 'utilisateur', newId,
            `"${name}" — Rôle: ${role} — Email: ${email.trim()}`);
          notifyRoles(['admin'], 'success', `👤 Nouvel utilisateur créé : ${name} (${role})`, '/admin.html');
          res.json({ id: newId });
        }
      );
    } catch (e) { next(e); }
  });
});

// Modification d'un utilisateur — admin, avec protection anti-lockout
router.put('/users/:id', requireAdmin, uploadAvatar.single('photo'), (req, res, next) => {
  const targetId = toInt(req.params.id);
  if (!targetId) return res.status(400).json({ error: 'ID invalide.' });
  const { role, name, phone, is_active, email } = req.body;
 
  if (targetId === req.session.userId && role && role !== 'admin')
    return res.status(400).json({ error: 'Vous ne pouvez pas changer votre propre rôle d\'admin.' });
  if (targetId === req.session.userId && is_active !== undefined && !toBoolInt(is_active))
    return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
  if (email !== undefined && !isValidEmail(email))
    return res.status(400).json({ error: 'Email invalide.' });
  if (role !== undefined && !isNonEmptyString(role))
    return res.status(400).json({ error: 'Rôle invalide.' });
 
  const checkRole = (cb) => {
    if (role === undefined) return cb();
    db.get('SELECT slug FROM roles WHERE slug = ?', [role], (err, row) => {
      if (err) return next(err);
      if (!row) return res.status(400).json({ error: 'Rôle inconnu.' });
      cb();
    });
  };
 
  checkRole(() => {
    let sql    = 'UPDATE users SET role=?, name=?, phone=?, is_active=?, email=?';
    const params = [role, name, phone, toBoolInt(is_active), email];
    if (req.file) { sql += ', photo_url=?'; params.push(`/uploads/avatars/${req.file.filename}`); }
    sql += ' WHERE id=?';
    params.push(targetId);
 
    db.run(sql, params, function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Utilisateur introuvable.' });
 
      // ── LOG ────────────────────────────────────────────────────────────────
      log.update(req, 'utilisateur', targetId,
        `"${name}" — Rôle: ${role}${!toBoolInt(is_active) ? ' — DÉSACTIVÉ' : ''}`);
 
      res.json({ success: true });
    });
  });
});

router.post('/users/:id/reset-password', requireAdmin, async (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const { password } = req.body;
  if (!isNonEmptyString(password) || password.length < 6)
    return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum).' });
 
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run('UPDATE users SET password_hash=? WHERE id=?', [hash, id], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Utilisateur introuvable.' });
 
      // ── LOG ────────────────────────────────────────────────────────────────
      log(req, 'UPDATE', 'utilisateur', id, `Mot de passe réinitialisé par admin pour utilisateur #${id}`);
 
      res.json({ success: true });
    });
  } catch (e) { next(e); }
});

// Suppression d'utilisateur — anti-lockout : ne pas supprimer le dernier admin
router.delete('/users/:id', requireAdmin, (req, res, next) => {
  const targetId = toInt(req.params.id);
  if (!targetId) return res.status(400).json({ error: 'ID invalide.' });
  if (targetId === req.session.userId)
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
 
  db.get('SELECT role, name FROM users WHERE id = ?', [targetId], (err, target) => {
    if (err) return next(err);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
 
    const proceed = () => db.run('DELETE FROM users WHERE id=?', [targetId], (err) => {
      if (err) return next(err);
      // ── LOG ────────────────────────────────────────────────────────────────
      log.delete(req, 'utilisateur', targetId,
        `"${target.name}" (${target.role}) supprimé`);
      res.json({ success: true });
    });
 
    if (target.role === 'admin') {
      db.get('SELECT COUNT(*) as cnt FROM users WHERE role=\'admin\' AND is_active=1', [], (err, row) => {
        if (err) return next(err);
        if (row.cnt <= 1)
          return res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur.' });
        proceed();
      });
    } else proceed();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//                                  ROLES
// ──────────────────────────────────────────────────────────────────────────────
router.get('/roles', requireAdmin, (req, res, next) =>
  db.all('SELECT * FROM roles ORDER BY name', [], (err, rows) => err ? next(err) : res.json(rows)));

router.post('/roles', requireAdmin, (req, res, next) => {
  const { name, permissions } = req.body;
  if (!isNonEmptyString(name)) return res.status(400).json({ error: 'Nom requis.' });
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
  db.run(
    'INSERT INTO roles (slug, name, permissions) VALUES (?, ?, ?)',
    [slug, name, permissions || ''],
    (err) => err ? res.status(400).json({ error: 'Existe déjà' }) : res.json({ slug, name })
  );
});

router.put('/roles/:slug', requireAdmin, (req, res, next) => {
  const { name, permissions } = req.body;
  if (!isNonEmptyString(name)) return res.status(400).json({ error: 'Nom requis.' });
  db.run(
    'UPDATE roles SET name=?, permissions=? WHERE slug=?',
    [name, permissions, req.params.slug],
    (err) => err ? next(err) : res.json({ success: true })
  );
});

// Suppression de rôle — protégée par is_removable
router.delete('/roles/:slug', requireAdmin, (req, res, next) => {
  const slug = req.params.slug;
  db.get('SELECT is_removable FROM roles WHERE slug = ?', [slug], (err, role) => {
    if (err) return next(err);
    if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });
    if (!role.is_removable) return res.status(403).json({ error: 'Ce rôle système ne peut pas être supprimé.' });

    // Vérifier qu'aucun utilisateur n'utilise encore ce rôle
    db.get('SELECT COUNT(*) as cnt FROM users WHERE role = ?', [slug], (err, row) => {
      if (err) return next(err);
      if (row.cnt > 0) {
        return res.status(409).json({ error: `Impossible : ${row.cnt} utilisateur(s) ont encore ce rôle.` });
      }
      db.run('DELETE FROM roles WHERE slug=?', [slug], (err) =>
        err ? next(err) : res.json({ success: true })
      );
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//                       SECTORS / DEVICE TYPES / EQUIPMENT
// ──────────────────────────────────────────────────────────────────────────────
router.get('/sectors', requireStaff, (req, res, next) =>
  db.all('SELECT * FROM sectors ORDER BY name', [], (err, rows) => err ? next(err) : res.json(rows)));

router.post('/sectors', requireRoles(...CATALOG_MANAGERS), (req, res, next) => {
  if (!isNonEmptyString(req.body.name)) return res.status(400).json({ error: 'Nom requis.' });
  const slug = req.body.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  db.run(
    'INSERT INTO sectors (name, slug) VALUES (?, ?)',
    [req.body.name.trim(), slug],
    function (err) {
      if (err) return res.status(400).json({ error: 'Erreur (peut-être déjà existant).' });
      res.json({ id: this.lastID });
    }
  );
});

router.delete('/sectors/:id', requireRoles(...CATALOG_MANAGERS), (req, res, next) =>
  db.run('DELETE FROM sectors WHERE id=?', [toInt(req.params.id)], (err) =>
    err ? next(err) : res.json({ success: true })));

router.get('/device-types', requireStaff, (req, res, next) =>
  db.all('SELECT * FROM device_types ORDER BY name', [], (err, rows) =>
    err ? next(err) : res.json(rows)));

router.post('/device-types', requireRoles(...CATALOG_MANAGERS), (req, res, next) => {
  if (!isNonEmptyString(req.body.name)) return res.status(400).json({ error: 'Nom requis.' });
  db.run('INSERT INTO device_types (name) VALUES (?)', [req.body.name.trim()], function (err) {
    if (err) return res.status(400).json({ error: 'Erreur (peut-être déjà existant).' });
    res.json({ id: this.lastID });
  });
});

router.delete('/device-types/:id', requireRoles(...CATALOG_MANAGERS), (req, res, next) =>
  db.run('DELETE FROM device_types WHERE id=?', [toInt(req.params.id)], (err) =>
    err ? next(err) : res.json({ success: true })));

// Catalogue d'équipement — lecture pour tout le staff, écriture pour gestionnaires
router.get('/equipment', requireStaff, (req, res, next) =>
  db.all('SELECT * FROM equipment_catalog ORDER BY name', [], (err, rows) =>
    err ? next(err) : res.json(rows)));

router.post('/equipment', requireRoles(...CATALOG_MANAGERS), (req, res, next) => {
  const err = requireFields(req.body, ['name', 'brand', 'type']);
  if (err) return res.status(400).json({ error: err });
  const { name, name_de, brand, model, type, device_type, is_secondary } = req.body;
  db.run(
    'INSERT INTO equipment_catalog (name, name_de, brand, model, type, device_type, is_secondary) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name.trim(), name_de || null, brand.trim(), model || null, type, device_type || null, toBoolInt(is_secondary)],
    function (err) {
      if (err) return next(err);
      res.json({ id: this.lastID });
    }
  );
});

router.put('/equipment/:id', requireRoles(...CATALOG_MANAGERS), (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const { name, name_de, brand, model, type, device_type, is_secondary } = req.body;
  db.run(
    'UPDATE equipment_catalog SET name=?, name_de=?, brand=?, model=?, type=?, device_type=?, is_secondary=? WHERE id=?',
    [name, name_de, brand, model, type, device_type, toBoolInt(is_secondary), id],
    function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Équipement introuvable.' });
      res.json({ success: true });
    }
  );
});

router.delete('/equipment/:id', requireRoles(...CATALOG_MANAGERS), (req, res, next) =>
  db.run('DELETE FROM equipment_catalog WHERE id=?', [toInt(req.params.id)], function (err) {
    if (err) {
      if (err.message?.includes('FOREIGN KEY')) {
        return res.status(409).json({
          error: 'Cet équipement est utilisé par des clients ou des rapports. Retirez-le d\'abord des fiches clients.'
        });
      }
      return next(err);
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Équipement introuvable.' });
    res.json({ success: true });
  }));

// ──────────────────────────────────────────────────────────────────────────────
//                                  EXPORT / LOGS
// ──────────────────────────────────────────────────────────────────────────────
router.get('/export/clients', requireRoles('admin', 'sales_director'), (req, res, next) => {
  const sql = `SELECT c.*, ce.serial_number, ec.name as equip_name, ec.brand as equip_brand
               FROM clients c
               LEFT JOIN client_equipment ce ON c.id=ce.client_id
               LEFT JOIN equipment_catalog ec ON ce.equipment_id=ec.id
               ORDER BY c.cabinet_name`;
  db.all(sql, [], (err, rows) => {
    if (err) return next(err);
    const map = {};
    rows.forEach((row) => {
      if (!map[row.id]) map[row.id] = { ...row, Machines: [] };
      if (row.equip_name) map[row.id].Machines.push(`${row.equip_brand} ${row.equip_name} [${row.serial_number}]`);
    });
    const exportData = Object.values(map).map((c) => ({
      Cabinet: c.cabinet_name, Ville: c.city, Machines: c.Machines.join('\n'),
    }));
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 60 }];
    xlsx.utils.book_append_sheet(wb, ws, 'Clients');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  });
});

router.get('/logs', requireAdmin, (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  const days  = parseInt(req.query.days) || 30;
 
  const since = days > 0
    ? `AND al.created_at >= datetime('now', '-${days} days')`
    : '';
 
  const sql = `
    SELECT
      al.id,
      al.action,
      al.entity,
      al.entity_id,
      al.details,
      al.created_at,
      COALESCE(u.name, 'Système') as user_name,
      u.role as user_role
    FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1 ${since}
    ORDER BY al.created_at DESC
    LIMIT ?
  `;
 
  db.all(sql, [limit], (err, rows) => {
    if (err) return next(err);
    res.json(rows || []);
  });
});

module.exports = router;
