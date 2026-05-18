// server/routes/tickets.js — VERSION COMPLÈTE AVEC LOGS
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { db }  = require('../config/database');
const { requireAuth, requireAdmin, requireStaff } = require('../middleware/auth');
const { toInt, isNonEmptyString, requireFields }  = require('../utils/validators');
const { sendMail } = require('../utils/mailer');
const log = require('../utils/logger'); // ← AJOUT

// ─── UPLOADS ──────────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads/tickets');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const random  = crypto.randomBytes(16).toString('hex');
    const ext     = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.pdf','.jpg','.jpeg','.png','.doc','.docx'].includes(ext) ? ext : '.bin';
    cb(null, `${Date.now()}-${random}${safeExt}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','image/jpeg','image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Format de fichier non autorisé.'));
  },
});

// ─── HELPER MENTIONS ──────────────────────────────────────────────────────────
const notifyMention = (commentText, ticketId, ticketTitle) => {
  if (!commentText) return;
  const mentions = commentText.match(/@([a-zA-ZÀ-ÿ0-9_\-\.]+)/g);
  if (!mentions) return;
  mentions.forEach((m) => {
    const name = m.substring(1);
    db.get('SELECT id, name, email FROM users WHERE REPLACE(name, \' \', \'\') LIKE ?',
      [`%${name}%`], (err, user) => {
        if (!user) return;
        db.run('INSERT INTO notifications (user_id, type, message, link) VALUES (?, \'info\', ?, ?)',
          [user.id, `On vous a mentionné dans le ticket : ${ticketTitle}`,
           `/tickets.html?open=${ticketId}`]);
        if (user.email) {
          const subject = `[KB Med] Vous avez été mentionné : ${ticketTitle}`;
          const htmlMsg = `<div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:10px;">
            <h2 style="color:#0f172a;border-bottom:2px solid #2563eb;padding-bottom:10px;">Bonjour ${user.name},</h2>
            <p>Vous avez été mentionné dans le ticket : <strong>${ticketTitle}</strong>.</p>
            <div style="padding:15px;background:#f8fafc;border-left:4px solid #2563eb;font-style:italic;margin:20px 0;">"${commentText}"</div>
            <a href="https://app.kbmed.ch/tickets.html?open=${ticketId}" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Ouvrir le ticket</a>
          </div>`;
          sendMail(user.email, subject, htmlMsg);
        }
      });
  });
};

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get('/', requireStaff, (req, res, next) => {
  const search = req.query.search || '';
  const sql = `
    SELECT t.*, u1.name as creator_name, c.cabinet_name, ec.brand, ec.name as eq_name,
    (SELECT GROUP_CONCAT(u.name, ', ') FROM ticket_assignees ta JOIN users u ON ta.user_id = u.id WHERE ta.ticket_id = t.id) as assigned_names,
    (SELECT GROUP_CONCAT(user_id) FROM ticket_assignees WHERE ticket_id = t.id) as assigned_ids
    FROM tickets t
    LEFT JOIN users u1 ON t.creator_id = u1.id
    LEFT JOIN clients c ON t.client_id = c.id
    LEFT JOIN client_equipment ce ON t.equipment_id = ce.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    WHERE t.title LIKE ? OR t.description LIKE ? OR c.cabinet_name LIKE ?
    ORDER BY t.is_urgent DESC,
      CASE t.status WHEN 'Ouvert' THEN 1 WHEN 'En attente' THEN 2 WHEN 'Clôturé' THEN 3 END,
      t.created_at DESC`;
  const p = `%${search}%`;
  db.all(sql, [p, p, p], (err, rows) => err ? next(err) : res.json(rows));
});

// ─── POST / ───────────────────────────────────────────────────────────────────
router.post('/', requireStaff, (req, res, next) => {
  const err = requireFields(req.body, ['title', 'description']);
  if (err) return res.status(400).json({ error: err });

  const { title, description, client_id, equipment_id, assigned_to, is_urgent, priority } = req.body;
  const safePriority = ['Urgente','Haute','Normale','Basse'].includes(priority) ? priority : 'Normale';

  db.run(
    `INSERT INTO tickets (title, description, client_id, equipment_id, is_urgent, priority, creator_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [title, description, toInt(client_id) || null, toInt(equipment_id) || null,
     is_urgent ? 1 : 0, safePriority, req.session.userId],
    function (err) {
      if (err) return next(err);
      const ticketId = this.lastID;

      // ── LOG ────────────────────────────────────────────────────────────────
      log.create(req, 'ticket', ticketId,
        `"${title}" — Priorité: ${safePriority}${is_urgent ? ' 🚨 URGENT' : ''}${client_id ? ` — Client #${client_id}` : ''}`);

      // Assignations + e-mails
      if (Array.isArray(assigned_to) && assigned_to.length > 0) {
        assigned_to.forEach((uid) =>
          db.run('INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)', [ticketId, toInt(uid)]));

        const placeholders = assigned_to.map(() => '?').join(',');
        db.all(
          `SELECT email FROM users WHERE id IN (${placeholders}) AND email IS NOT NULL AND pref_mail_assign = 1`,
          assigned_to, (err, users) => {
            if (users && users.length > 0) {
              const emailList = users.map((u) => u.email).join(', ');
              const subject   = `[KB Med] ${is_urgent ? '🚨 URGENT : ' : ''}Nouveau ticket assigné - ${title}`;
              const htmlMsg   = `<div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:10px;">
                <h2 style="color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:10px;">Nouveau Ticket Assigné</h2>
                <p>Un nouveau ticket vous a été assigné dans <strong>KB Med</strong>.</p>
                <div style="padding:15px;background:#f8fafc;border-radius:8px;margin:20px 0;border:1px solid #e2e8f0;">
                  <p><strong>Sujet :</strong> ${title}</p>
                  <p><strong>Urgence :</strong> ${is_urgent ? '🚨 Haute' : 'Normale'}</p>
                </div>
                <a href="https://app.kbmed.ch/tickets.html?open=${ticketId}" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Voir le ticket</a>
              </div>`;
              sendMail(emailList, subject, htmlMsg);
            }
          });
      }

      res.json({ success: true, id: ticketId });
    }
  );
});

router.get('/badge', requireAuth, (req, res, next) => {
  const adminRoles = ['admin', 'secretary', 'sales_director', 'verifier'];
  const isAdmin    = adminRoles.includes(req.session.role);

  // Admins → tous les tickets ouverts
  // Autres → seulement ceux qui leur sont assignés
  const sql = isAdmin
    ? `SELECT COUNT(*) as count FROM tickets WHERE status = 'Ouvert'`
    : `SELECT COUNT(DISTINCT t.id) as count FROM tickets t
       JOIN ticket_assignees ta ON t.id = ta.ticket_id
       WHERE t.status = 'Ouvert' AND ta.user_id = ?`;

  const params = isAdmin ? [] : [req.session.userId];

  db.get(sql, params, (err, row) => {
    if (err) return next(err);
    res.json({ count: row ? row.count : 0 });
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  db.get(
    `SELECT t.*, u1.name as creator_name, c.cabinet_name
     FROM tickets t
     LEFT JOIN users u1 ON t.creator_id = u1.id
     LEFT JOIN clients c ON t.client_id = c.id
     WHERE t.id = ?`,
    [id], (err, ticket) => {
      if (err) return next(err);
      if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });

      db.all('SELECT user_id FROM ticket_assignees WHERE ticket_id = ?', [id], (err, assignees) => {
        ticket.assigned_to = assignees ? assignees.map((a) => a.user_id) : [];
        db.all(
          `SELECT tc.*, u.name as user_name FROM ticket_comments tc
           JOIN users u ON tc.user_id = u.id WHERE tc.ticket_id = ? ORDER BY tc.created_at ASC`,
          [id], (err, comments) => {
            ticket.comments = comments || [];
            res.json(ticket);
          });
      });
    });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
router.put('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  const { title, description, status, client_id, equipment_id, assigned_to, is_urgent, priority } = req.body;
  const safePriority = ['Urgente','Haute','Normale','Basse'].includes(priority) ? priority : 'Normale';

  db.get('SELECT title, description, status, priority, is_urgent FROM tickets WHERE id = ?', [id], (err, old) => {
    if (err) return next(err);
    if (!old) return res.status(404).json({ error: 'Ticket introuvable.' });

    db.run(
      `UPDATE tickets
       SET title=?, description=?, status=?, client_id=?, equipment_id=?,
           is_urgent=?, priority=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [title || old.title, description || old.description,
       status, toInt(client_id) || null, toInt(equipment_id) || null,
       is_urgent ? 1 : 0, safePriority, id],
      () => {
        // ── LOGS ───────────────────────────────────────────────────────────
        if (old.status !== status) {
          log.status(req, 'ticket', id,
            `#${id} "${old.title}" : "${old.status}" → "${status}"`);
          // Commentaire système
          db.run(
            'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
            [id, req.session.userId, `a passé le ticket en : ${status}`]);
        } else if (old.priority !== safePriority) {
          log.update(req, 'ticket', id,
            `#${id} — Priorité : "${old.priority}" → "${safePriority}"`);
          db.run(
            'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
            [id, req.session.userId, `a changé la priorité : "${old.priority}" → "${safePriority}"`]);
        } else {
          log.update(req, 'ticket', id, `#${id} "${old.title}" modifié`);
        }

        // Assignations
        db.run('DELETE FROM ticket_assignees WHERE ticket_id = ?', [id], () => {
          if (Array.isArray(assigned_to) && assigned_to.length > 0) {
            assigned_to.forEach((uid) => {
              db.run('INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)', [id, toInt(uid)], () => {
                db.get('SELECT name, email FROM users WHERE id = ?', [uid], (err, user) => {
                  if (user && user.email) {
                    const subject = `[KB Med] Mise à jour du ticket : ${old.title}`;
                    const htmlMsg = `<div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:10px;">
                      <h2 style="color:#0f172a;border-bottom:2px solid #2563eb;padding-bottom:10px;">Mise à jour du Ticket</h2>
                      <p>Bonjour <strong>${user.name}</strong>,</p>
                      <p>Le ticket <strong>[#${id}] ${old.title}</strong> a été modifié.</p>
                      <div style="padding:15px;background:#f8fafc;border-radius:8px;margin:20px 0;border:1px solid #e2e8f0;">
                        <p><strong>Statut :</strong> ${status}</p>
                        <p><strong>Priorité :</strong> ${safePriority}</p>
                      </div>
                      <a href="https://app.kbmed.ch/tickets.html?open=${id}" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Accéder au ticket</a>
                    </div>`;
                    sendMail(user.email, subject, htmlMsg);
                  }
                });
              });
            });
          }
        });

        res.json({ success: true });
      }
    );
  });
});

// ─── POST /:id/comments ───────────────────────────────────────────────────────
router.post('/:id/comments', requireStaff, upload.single('attachment'), (req, res, next) => {
  const id       = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  const filePath    = req.file ? `/uploads/tickets/${req.file.filename}` : null;
  const commentText = req.body.comment || (req.file ? '[Pièce jointe envoyée]' : '');
  if (!commentText && !filePath) return res.status(400).json({ error: 'Message vide.' });

  const isSystem = req.body.is_system ? 1 : 0;

  db.run(
    'INSERT INTO ticket_comments (ticket_id, user_id, comment, file_path, is_system) VALUES (?, ?, ?, ?, ?)',
    [id, req.session.userId, commentText, filePath, isSystem],
    function (err) {
      if (err) return next(err);

      // ── LOG (seulement les vrais commentaires, pas les systèmes) ──────────
      if (!isSystem) {
        log.update(req, 'ticket', id, `Commentaire ajouté sur ticket #${id}`);
      }

      db.get('SELECT title FROM tickets WHERE id = ?', [id], (err, ticketData) => {
        if (ticketData) notifyMention(commentText, id, ticketData.title);
      });

      res.json({ success: true });
    });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  db.get('SELECT title FROM tickets WHERE id = ?', [id], (err, ticket) => {
    db.run('DELETE FROM tickets WHERE id = ?', [id], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Ticket introuvable.' });

      // ── LOG ────────────────────────────────────────────────────────────────
      log.delete(req, 'ticket', id, `#${id} "${ticket?.title || ''}" supprimé`);

      res.json({ success: true });
    });
  });
});

module.exports = router;