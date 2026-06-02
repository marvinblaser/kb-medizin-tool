// server/routes/rmas.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth, requireAdmin, requireStaff } = require('../middleware/auth');
const { toInt, isNonEmptyString, requireFields } = require('../utils/validators');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('../utils/logger');

// ─── UPLOADS ──────────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads/rmas');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'].includes(ext) ? ext : '.bin';
    cb(null, `${Date.now()}-${random}${safeExt}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png',
                     'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Format de fichier non autorisé.'));
  },
});

// ──────────────────────────────────────────────────────────────────────────────
//                                  RMAS
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', requireStaff, (req, res, next) => {
  const sql = `
    SELECT r.*, c.cabinet_name, ec.name as equipment_name, ec.brand, ce.serial_number
    FROM rmas r
    LEFT JOIN clients c ON r.client_id = c.id
    LEFT JOIN client_equipment ce ON r.equipment_id = ce.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    ORDER BY r.created_at DESC`;
  db.all(sql, [], (err, rmas) => {
    if (err) return next(err);
    db.all(
      'SELECT rtl.rma_id, rt.id, rt.name, rt.color FROM rma_tag_links rtl JOIN rma_tags rt ON rtl.tag_id = rt.id',
      [], (err, tags) => {
        const rmasWithTags = rmas.map((rma) => {
          rma.tags = tags ? tags.filter((t) => t.rma_id === rma.id) : [];
          return rma;
        });
        res.json(rmasWithTags);
      }
    );
  });
});

router.get('/equipment/:clientId', requireStaff, (req, res, next) => {
  const clientId = toInt(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'ID client invalide.' });
  const sql = `
    SELECT ce.id, ec.name, ec.brand, ce.serial_number
    FROM client_equipment ce
    JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE ce.client_id = ?`;
  db.all(sql, [clientId], (err, rows) => err ? next(err) : res.json(rows));
});

router.post('/', requireStaff, (req, res, next) => {
  const { client_id, description, equipment_id, supplier_name, rma_number,
          tracking_to_supplier, tracking_from_supplier, due_date,
          contact_person } = req.body;
  if (!client_id || !description) {
    return res.status(400).json({ error: 'Client et description requis.' });
  }
  const userId = req.session.userId;
 
  db.run(
    `INSERT INTO rmas (client_id, equipment_id, supplier_name, rma_number,
     tracking_to_supplier, tracking_from_supplier, description, due_date,
     contact_person, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [toInt(client_id), toInt(equipment_id) || null, supplier_name || 'Xion',
     rma_number || null, tracking_to_supplier || null, tracking_from_supplier || null,
     description, due_date || null, contact_person || null, userId],
    function (err) {
      if (err) return next(err);
 
      // ── LOG ────────────────────────────────────────────────────────────────
      const rmaId = this.lastID;
      db.get(
        `SELECT c.cabinet_name, ec.name as eq_name
         FROM clients c, client_equipment ce
         LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
         WHERE c.id = ? AND ce.id = ?`,
        [client_id, equipment_id],
        (err, info) => {
          log.create(req, 'rma', rmaId,
            `${rma_number || `#${rmaId}`} — ${info?.eq_name || 'Appareil'} — Client #${client_id}${supplier_name ? ` — ${supplier_name}` : ''}`);
        }
      );
 
      res.json({ success: true, id: rmaId });
    }
  );
});

router.put('/:id/status', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const { status } = req.body;
  if (!isNonEmptyString(status)) return res.status(400).json({ error: 'Statut requis.' });
 
  db.get('SELECT status, rma_number FROM rmas WHERE id = ?', [id], (err, old) => {
    db.run(
      'UPDATE rmas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id],
      function (err) {
        if (err) return next(err);
        if (this.changes === 0) return res.status(404).json({ error: 'RMA introuvable.' });
 
        // ── LOG ──────────────────────────────────────────────────────────────
        if (old) {
          log.status(req, 'rma', id,
            `${old.rma_number || `#${id}`} : "${old.status}" → "${status}"`);
        }
 
        res.json({ success: true });
      }
    );
  });
});

router.put('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
 
  const { contact_person, status, client_id, equipment_id, supplier_name,
          rma_number, tracking_to_supplier, tracking_from_supplier,
          description, due_date } = req.body;
 
  const safeContactPerson = (contact_person && contact_person.trim())                    || null;
  const safeEquipment = toInt(equipment_id)                                        || null;
  const safeRmaNumber = (rma_number && rma_number.trim())                          || null;
  const safeTrackTo   = (tracking_to_supplier && tracking_to_supplier.trim())      || null;
  const safeTrackFrom = (tracking_from_supplier && tracking_from_supplier.trim())  || null;
  const safeDueDate   = (due_date && due_date.trim())                              || null;
 
  db.get(
    `SELECT r.*, c.cabinet_name, ec.name as equipment_name
     FROM rmas r
     LEFT JOIN clients c ON r.client_id = c.id
     LEFT JOIN client_equipment ce ON r.equipment_id = ce.id
     LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
     WHERE r.id = ?`,
    [id],
    (err, old) => {
      if (err) return next(err);
      if (!old) return res.status(404).json({ error: 'RMA introuvable.' });
 
      db.run(
        `UPDATE rmas
         SET contact_person = ?, status = ?, client_id = ?, equipment_id = ?,
             supplier_name = ?, rma_number = ?, tracking_to_supplier = ?,
             tracking_from_supplier = ?, description = ?, due_date = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [safeContactPerson, status, toInt(client_id), safeEquipment, supplier_name,
         safeRmaNumber, safeTrackTo, safeTrackFrom, description, safeDueDate, id],
        function (err) {
          if (err) return next(err);
          if (this.changes === 0) return res.status(404).json({ error: 'RMA introuvable.' });
 
          // ── Changelog commentaire système ────────────────────────────────
          const changes = [];
          const userId  = req.session.userId;
 
          if (old.status !== status)
            changes.push(`📋 Statut : "${old.status}" → "${status}"`);
          if ((old.contact_person || '') !== (safeContactPerson || ''))
            changes.push(`👤 Contact : "${old.contact_person || '—'}" → "${safeContactPerson || '—'}"`);
          if ((old.supplier_name || '') !== (supplier_name || ''))
            changes.push(`🏭 Fournisseur : "${old.supplier_name || '—'}" → "${supplier_name || '—'}"`);
          if ((old.rma_number || '') !== (safeRmaNumber || ''))
            changes.push(`🔢 N° RMA : ${old.rma_number || '—'} → ${safeRmaNumber || '—'}`);
          if ((old.due_date || '') !== (safeDueDate || '')) {
            const fmt = d => d ? new Date(d).toLocaleDateString('fr-CH') : '—';
            changes.push(`📅 Échéance : ${fmt(old.due_date)} → ${fmt(safeDueDate)}`);
          }
          if ((old.tracking_to_supplier || '') !== (safeTrackTo || ''))
            changes.push(`🚚 Tracking aller : "${old.tracking_to_supplier || '—'}" → "${safeTrackTo || '—'}"`);
          if ((old.tracking_from_supplier || '') !== (safeTrackFrom || ''))
            changes.push(`📦 Tracking retour : "${old.tracking_from_supplier || '—'}" → "${safeTrackFrom || '—'}"`);
          if ((old.description || '') !== (description || ''))
            changes.push(`📝 Description mise à jour`);
 
          if (changes.length > 0) {
            const changeText = changes.join('\n');
            db.run(
              `INSERT INTO rma_comments (rma_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)`,
              [id, userId, changeText]
            );
            // ── LOG activité ────────────────────────────────────────────────
            if (old.status !== status) {
              log.status(req, 'rma', id,
                `${old.rma_number || `#${id}`} : "${old.status}" → "${status}"`);
            } else {
              log.update(req, 'rma', id,
                `${old.rma_number || `#${id}`} — ${changes.length} champ(s) modifié(s)`);
            }
          }
 
          res.json({ success: true });
        }
      );
    }
  );
});

// ── Colonnes Kanban ───────────────────────────────────────────────────────────

// GET /api/rmas/columns
router.get('/columns', requireStaff, (req, res, next) => {
  db.all('SELECT * FROM rma_columns ORDER BY position ASC', [], (err, rows) => {
    if (err) return next(err);
    res.json(rows || []);
  });
});

// POST /api/rmas/columns
router.post('/columns', requireStaff, (req, res, next) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis.' });
  db.get('SELECT MAX(position) as maxPos FROM rma_columns', [], (err, row) => {
    if (err) return next(err);
    const pos = (row?.maxPos ?? -1) + 1;
    db.run(
      'INSERT INTO rma_columns (name, color, position) VALUES (?, ?, ?)',
      [name.trim(), color || '#6366f1', pos],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ce nom existe déjà.' });
          return next(err);
        }
        res.json({ success: true, id: this.lastID, name: name.trim(), color: color || '#6366f1', position: pos, is_protected: 0 });
      }
    );
  });
});

// PUT /api/rmas/columns/:id — renommer, recolorer, réordonner
// PUT /api/rmas/columns/reorder — réordonnement en masse (AVANT /:id)
router.put('/columns/reorder', requireStaff, (req, res, next) => {
  const { order } = req.body; // [{ id, position }]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Format invalide.' });
  db.serialize(() => {
    const stmt = db.prepare('UPDATE rma_columns SET position=? WHERE id=?');
    order.forEach(({ id, position }) => stmt.run(position, id));
    stmt.finalize((err) => {
      if (err) return next(err);
      res.json({ success: true });
    });
  });
});

router.put('/columns/:id', requireStaff, (req, res, next) => {
  const id = parseInt(req.params.id);
  const { name, color, position } = req.body;

  db.get('SELECT * FROM rma_columns WHERE id = ?', [id], (err, col) => {
    if (err) return next(err);
    if (!col) return res.status(404).json({ error: 'Colonne introuvable.' });
    if (col.is_protected && name && name !== col.name)
      return res.status(403).json({ error: 'Impossible de renommer une colonne protégée.' });

    const newName  = (name ?? col.name).trim();
    const newColor = color ?? col.color;
    const newPos   = position ?? col.position;

    db.serialize(() => {
      if (newName !== col.name) {
        db.run('UPDATE rmas SET status = ? WHERE status = ?', [newName, col.name]);
      }
      db.run(
        'UPDATE rma_columns SET name=?, color=?, position=? WHERE id=?',
        [newName, newColor, newPos, id],
        function(err) {
          if (err) return next(err);
          res.json({ success: true });
        }
      );
    });
  });
});

// DELETE /api/rmas/columns/:id
router.delete('/columns/:id', requireStaff, (req, res, next) => {
  const id = parseInt(req.params.id);
  db.get('SELECT * FROM rma_columns WHERE id = ?', [id], (err, col) => {
    if (err) return next(err);
    if (!col) return res.status(404).json({ error: 'Colonne introuvable.' });
    if (col.is_protected) return res.status(403).json({ error: 'Cette colonne est protégée.' });

    db.get('SELECT COUNT(*) as count FROM rmas WHERE status = ?', [col.name], (err, row) => {
      if (err) return next(err);
      if (row?.count > 0)
        return res.status(409).json({ error: `Impossible : ${row.count} RMA(s) dans cette colonne.` });
      db.run('DELETE FROM rma_columns WHERE id = ?', [id], function(err) {
        if (err) return next(err);
        res.json({ success: true });
      });
    });
  });
});

router.get('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const sql = `
    SELECT r.*, c.cabinet_name, ec.name as equipment_name, ec.brand, ce.serial_number
    FROM rmas r
    LEFT JOIN clients c ON r.client_id = c.id
    LEFT JOIN client_equipment ce ON r.equipment_id = ce.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE r.id = ?`;
  db.get(sql, [id], (err, rma) => {
    if (err) return next(err);
    if (!rma) return res.status(404).json({ error: 'RMA introuvable.' });
    db.all(
      'SELECT * FROM rma_tags rt JOIN rma_tag_links rtl ON rt.id = rtl.tag_id WHERE rtl.rma_id = ?',
      [id], (err, tags) => {
        rma.tags = tags || [];
        db.all(
          'SELECT rc.*, u.name as user_name FROM rma_comments rc JOIN users u ON rc.user_id = u.id WHERE rc.rma_id = ? ORDER BY rc.created_at ASC',
          [id], (err, comments) => {
            rma.comments = comments || [];
            db.all('SELECT * FROM rma_attachments WHERE rma_id = ? ORDER BY created_at DESC',
              [id], (err, attachments) => {
                rma.attachments = attachments || [];
                // ── Prêt lié ──────────────────────────────────────────────
                db.get(`
                  SELECT l.*, d.name as device_name, d.brand as device_brand,
                    d.serial_number as device_serial
                  FROM loans l
                  LEFT JOIN loan_devices d ON l.device_id = d.id
                  WHERE l.rma_id = ?
                  ORDER BY l.created_at DESC LIMIT 1`,
                  [id], (err, linked_loan) => {
                    rma.linked_loan = linked_loan || null;
                    res.json(rma);
                  });
              });
          });
      });
  });
});

router.post('/:id/comments', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const { comment } = req.body;
  if (!isNonEmptyString(comment)) return res.status(400).json({ error: 'Commentaire requis.' });
  db.run('INSERT INTO rma_comments (rma_id, user_id, comment) VALUES (?, ?, ?)',
    [id, req.session.userId, comment], (err) =>
      err ? next(err) : res.json({ success: true }));
});

// DELETE : tout le staff (secrétaires incluses) peut supprimer un RMA
router.delete('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
 
  db.get('SELECT rma_number, status FROM rmas WHERE id = ?', [id], (err, rma) => {
    db.run('DELETE FROM rmas WHERE id = ?', [id], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'RMA introuvable.' });
 
      // ── LOG ────────────────────────────────────────────────────────────────
      log.delete(req, 'rma', id,
        `${rma?.rma_number || `#${id}`} supprimé (était : ${rma?.status || '—'})`);
 
      res.json({ success: true });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//                                  TAGS
// ──────────────────────────────────────────────────────────────────────────────
router.get('/tags/all', requireStaff, (req, res, next) =>
  db.all('SELECT * FROM rma_tags ORDER BY name ASC', [], (err, rows) =>
    err ? next(err) : res.json(rows)));

router.post('/tags', requireStaff, (req, res, next) => {
  const { name, color } = req.body;
  if (!isNonEmptyString(name)) return res.status(400).json({ error: 'Nom requis.' });
  db.run('INSERT INTO rma_tags (name, color) VALUES (?, ?)',
    [name.trim(), color || '#3b82f6'], function (err) {
      if (err) return next(err);
      res.json({ success: true, id: this.lastID, name, color });
    });
});

// Suppression globale : tout le staff autorisé
router.delete('/tags/:tagId/global', requireStaff, (req, res, next) => {
  const id = toInt(req.params.tagId);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  db.run('DELETE FROM rma_tags WHERE id = ?', [id], function (err) {
    if (err) return next(err);
    if (this.changes === 0) return res.status(404).json({ error: 'Tag introuvable.' });
    res.json({ success: true });
  });
});

router.post('/:id/tags', requireStaff, (req, res, next) => {
  const rmaId = toInt(req.params.id);
  const tagId = toInt(req.body.tag_id);
  if (!rmaId || !tagId) return res.status(400).json({ error: 'IDs invalides.' });
  db.run('INSERT OR IGNORE INTO rma_tag_links (rma_id, tag_id) VALUES (?, ?)',
    [rmaId, tagId], (err) => err ? next(err) : res.json({ success: true }));
});

router.delete('/:id/tags/:tagId', requireStaff, (req, res, next) => {
  const rmaId = toInt(req.params.id);
  const tagId = toInt(req.params.tagId);
  if (!rmaId || !tagId) return res.status(400).json({ error: 'IDs invalides.' });
  db.run('DELETE FROM rma_tag_links WHERE rma_id = ? AND tag_id = ?',
    [rmaId, tagId], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Lien introuvable.' });
      res.json({ success: true });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
//                              PIÈCES JOINTES
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/attachments', requireStaff, upload.single('file'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const filePath = `/uploads/rmas/${req.file.filename}`;
  db.run(
    'INSERT INTO rma_attachments (rma_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)',
    [id, req.file.originalname, filePath, req.file.mimetype],
    function (err) {
      if (err) return next(err);
      res.json({ success: true, id: this.lastID });
    }
  );
});

router.delete('/attachments/:attachmentId', requireStaff, (req, res, next) => {
  const id = toInt(req.params.attachmentId);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  db.get('SELECT file_path FROM rma_attachments WHERE id = ?', [id], (err, row) => {
    if (err) return next(err);
    if (row && row.file_path) {
      // Protection path traversal : vérifier que le fichier est bien dans UPLOAD_DIR
      const filename = path.basename(row.file_path);
      const safePath = path.join(UPLOAD_DIR, filename);
      if (safePath.startsWith(UPLOAD_DIR) && fs.existsSync(safePath)) {
        try { fs.unlinkSync(safePath); }
        catch (e) { console.error('Échec suppression fichier:', e.message); }
      }
    }
    db.run('DELETE FROM rma_attachments WHERE id = ?', [id], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
      res.json({ success: true });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//                              STATISTIQUES
// ──────────────────────────────────────────────────────────────────────────────
router.get('/stats/dashboard', requireStaff, (req, res, next) => {
  const stats = {};
  db.all(
    "SELECT status, COUNT(*) as count FROM rmas WHERE status != 'Archives' GROUP BY status",
    [], (err, statusData) => {
      if (err) return next(err);
      stats.statusDistribution = statusData || [];
      db.all(
        'SELECT supplier_name, COUNT(*) as count FROM rmas GROUP BY supplier_name',
        [], (err, supplierData) => {
          stats.supplierDistribution = supplierData || [];
          db.all(
            `SELECT c.cabinet_name, COUNT(r.id) as count FROM rmas r
             JOIN clients c ON r.client_id = c.id GROUP BY r.client_id ORDER BY count DESC LIMIT 5`,
            [], (err, clientData) => {
              stats.topClients = clientData || [];
              db.all(
                `SELECT ec.name, ec.brand, COUNT(r.id) as count FROM rmas r
                 JOIN client_equipment ce ON r.equipment_id = ce.id
                 JOIN equipment_catalog ec ON ce.equipment_id = ec.id
                 GROUP BY ec.id ORDER BY count DESC LIMIT 5`,
                [], (err, eqData) => {
                  stats.topEquipment = eqData || [];
                  res.json(stats);
                });
            });
        });
    });
});

// ── Modification d'un commentaire (auteur ou admin) ──────────────────────────
router.put('/comments/:commentId', requireStaff, (req, res, next) => {
  const id = toInt(req.params.commentId);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });
  const { comment } = req.body;
  if (!isNonEmptyString(comment)) return res.status(400).json({ error: 'Commentaire requis.' });

  db.get('SELECT user_id, is_system FROM rma_comments WHERE id = ?', [id], (err, row) => {
    if (err) return next(err);
    if (!row) return res.status(404).json({ error: 'Commentaire introuvable.' });
    if (row.is_system) return res.status(403).json({ error: 'Impossible de modifier un commentaire système.' });
    if (row.user_id !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres commentaires.' });
    }
    db.run('UPDATE rma_comments SET comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [comment.trim(), id],
      function (err) {
        if (err) return next(err);
        res.json({ success: true });
      }
    );
  });
});

// ── Suppression d'un commentaire (auteur ou admin) ────────────────────────────
router.delete('/comments/:commentId', requireStaff, (req, res, next) => {
  const id = toInt(req.params.commentId);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  db.get('SELECT user_id, is_system FROM rma_comments WHERE id = ?', [id], (err, row) => {
    if (err) return next(err);
    if (!row) return res.status(404).json({ error: 'Commentaire introuvable.' });
    if (row.is_system) return res.status(403).json({ error: 'Impossible de supprimer un commentaire système.' });
    if (row.user_id !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres commentaires.' });
    }
    db.run('DELETE FROM rma_comments WHERE id = ?', [id], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Commentaire introuvable.' });
      res.json({ success: true });
    });
  });
});

module.exports = router;