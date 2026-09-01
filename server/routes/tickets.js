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

// ─── CATÉGORIES (gérées depuis l'admin, table ticket_categories) ────────────────
const validateCategory = (name, cb) => {
  if (!name) return cb(null);
  db.get('SELECT 1 FROM ticket_categories WHERE name = ?', [name], (err, row) => cb(row ? name : null));
};

// ─── RAISON DE BLOCAGE ──────────────────────────────────────────────────────────
const BLOCKED_REASONS = ['Client', 'Pièce détachée', 'Planification', 'Autre'];
const safeBlockedReason = (status, reason) =>
  status === 'Bloqué' && BLOCKED_REASONS.includes(reason) ? reason : null;

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

// ─── NOTIFICATIONS IN-APP (cloche) ───────────────────────────────────────────
// Crée une notification pour chaque utilisateur actif de `userIds`, en excluant
// l'auteur de l'action (`actorId`) et les doublons. N'envoie PAS d'e-mail : les
// e-mails de cycle de vie sont gérés séparément dans chaque route.
const notifyInApp = (userIds, actorId, type, message, link) => {
  const recipients = [...new Set((userIds || []).map(Number).filter(Boolean))]
    .filter((uid) => uid !== Number(actorId));
  if (!recipients.length) return;
  const placeholders = recipients.map(() => '?').join(',');
  db.all(`SELECT id FROM users WHERE id IN (${placeholders}) AND is_active = 1`, recipients, (err, users) => {
    if (err || !users) return;
    users.forEach((u) => {
      db.run('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)',
        [u.id, type, message, link],
        (e) => { if (e) console.error('Notif ticket:', e.message); });
    });
  });
};

// Récupère les "suiveurs" d'un ticket : créateur + responsable + assignés.
const getTicketWatchers = (ticketId, cb) => {
  db.get('SELECT creator_id, owner_id FROM tickets WHERE id = ?', [ticketId], (err, t) => {
    if (err || !t) return cb([]);
    db.all('SELECT user_id FROM ticket_assignees WHERE ticket_id = ?', [ticketId], (e2, rows) => {
      cb([t.creator_id, t.owner_id, ...((rows || []).map((r) => r.user_id))].filter(Boolean));
    });
  });
};

// Résout les @mentions d'un texte en ids utilisateurs (pour éviter la double
// notification "commentaire" + "mention" à la même personne).
const resolveMentionIds = (text, cb) => {
  const names = (text || '').match(/@([a-zA-ZÀ-ÿ0-9_\-\.]+)/g);
  if (!names || !names.length) return cb([]);
  const likes  = names.map(() => "REPLACE(name, ' ', '') LIKE ?").join(' OR ');
  const params = names.map((n) => `%${n.slice(1)}%`);
  db.all(`SELECT id FROM users WHERE ${likes}`, params, (err, rows) => cb((rows || []).map((r) => r.id)));
};

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get('/', requireStaff, (req, res, next) => {
  const search   = req.query.search || '';
  const category = req.query.category || '';
  const userId   = req.session.userId;

  let categoryClause = '';
  const params = [];
  const p = `%${search}%`;

  if (category === 'none') {
    categoryClause = 'AND t.category IS NULL';
  } else if (category) {
    categoryClause = 'AND t.category = ?';
  }

  const sql = `
    SELECT t.*, u1.name as creator_name, u3.name as owner_name, c.cabinet_name, ec.brand, ec.name as eq_name,
    (SELECT GROUP_CONCAT(u.name, ', ') FROM ticket_assignees ta JOIN users u ON ta.user_id = u.id WHERE ta.ticket_id = t.id) as assigned_names,
    (SELECT GROUP_CONCAT(user_id) FROM ticket_assignees WHERE ticket_id = t.id) as assigned_ids,
    (SELECT MAX(created_at) FROM ticket_comments WHERE ticket_id = t.id AND is_system = 0) as last_comment_at,
    tr.last_seen_at as last_seen_at
    FROM tickets t
    LEFT JOIN users u1 ON t.creator_id = u1.id
    LEFT JOIN users u3 ON t.owner_id = u3.id
    LEFT JOIN clients c ON t.client_id = c.id
    LEFT JOIN client_equipment ce ON t.equipment_id = ce.id
    LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
    LEFT JOIN ticket_reads tr ON tr.ticket_id = t.id AND tr.user_id = ?
    WHERE (t.title LIKE ? OR t.description LIKE ? OR c.cabinet_name LIKE ?)
    ${categoryClause}
    ORDER BY
      CASE t.priority WHEN 'Urgente' THEN 1 WHEN 'Haute' THEN 2 WHEN 'Normale' THEN 3 WHEN 'Basse' THEN 4 ELSE 5 END,
      CASE t.status WHEN 'Ouvert' THEN 1 WHEN 'Bloqué' THEN 2 WHEN 'Clôturé' THEN 3 END,
      t.created_at DESC`;

  params.push(userId, p, p, p);
  if (categoryClause === 'AND t.category = ?') params.push(category);

  db.all(sql, params, (err, rows) => {
    if (err) return next(err);
    rows.forEach((r) => {
      const lastActivity = r.last_comment_at || r.created_at;
      const isCreator = String(r.creator_id) === String(userId);
      r.has_unread = !isCreator && (!r.last_seen_at || new Date(lastActivity) > new Date(r.last_seen_at));
      delete r.last_comment_at;
      delete r.last_seen_at;
    });
    res.json(rows);
  });
});

// ─── POST / ───────────────────────────────────────────────────────────────────
router.post('/', requireStaff, (req, res, next) => {
  const err = requireFields(req.body, ['title', 'description']);
  if (err) return res.status(400).json({ error: err });

  const { title, description, client_id, equipment_id, assigned_to, priority, category, owner_id } = req.body;
  const safePriority = ['Urgente','Haute','Normale','Basse'].includes(priority) ? priority : 'Normale';
  const safeOwnerId  = toInt(owner_id) || null;

  validateCategory(category, (cat) => {
    db.run(
      `INSERT INTO tickets (title, description, client_id, equipment_id, priority, category, owner_id, creator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, toInt(client_id) || null, toInt(equipment_id) || null,
       safePriority, cat, safeOwnerId, req.session.userId],
      function (err) {
        if (err) return next(err);
        const ticketId = this.lastID;

        // ── LOG ────────────────────────────────────────────────────────────────
        log.create(req, 'ticket', ticketId,
          `"${title}" — Priorité: ${safePriority}${cat ? ` — ${cat}` : ''}${client_id ? ` — Client #${client_id}` : ''}`);

        // Pré-remplit les rapports liés avec ceux déjà associés à la même machine
        // (purement une suggestion de départ — modifiable ensuite librement).
        if (toInt(equipment_id)) {
          db.run(
            `INSERT OR IGNORE INTO ticket_reports (ticket_id, report_id)
             SELECT ?, re.report_id FROM report_equipment re WHERE re.equipment_id = ?`,
            [ticketId, toInt(equipment_id)]
          );
        }

        const assigneeIds = Array.isArray(assigned_to) ? assigned_to.map(toInt).filter(Boolean) : [];

        // Assignations
        assigneeIds.forEach((uid) =>
          db.run('INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)', [ticketId, uid]));

        // ── NOTIFICATION IN-APP : nouveau ticket pour les assignés + le responsable
        notifyInApp(
          [...assigneeIds, safeOwnerId], req.session.userId,
          safePriority === 'Urgente' ? 'warning' : 'info',
          `${safePriority === 'Urgente' ? '🔴 ' : '📋 '}Nouveau ticket qui vous est assigné : « ${title} »`,
          `/tickets.html?open=${ticketId}`
        );

        // E-mails : assignés + responsable principal
        const emailRecipientIds = Array.from(new Set([...assigneeIds, safeOwnerId].filter(Boolean)));
        if (emailRecipientIds.length > 0) {
          const placeholders = emailRecipientIds.map(() => '?').join(',');
          db.all(
            `SELECT email FROM users WHERE id IN (${placeholders}) AND email IS NOT NULL AND pref_mail_assign = 1`,
            emailRecipientIds, (err, users) => {
              if (users && users.length > 0) {
                const emailList = users.map((u) => u.email).join(', ');
                const subject   = `[KB Med] ${safePriority === 'Urgente' ? '🚨 URGENT : ' : ''}Nouveau ticket assigné - ${title}`;
                const htmlMsg   = `<div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:10px;">
                  <h2 style="color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:10px;">Nouveau Ticket Assigné</h2>
                  <p>Un nouveau ticket vous a été assigné dans <strong>KB Med</strong>.</p>
                  <div style="padding:15px;background:#f8fafc;border-radius:8px;margin:20px 0;border:1px solid #e2e8f0;">
                    <p><strong>Sujet :</strong> ${title}</p>
                    <p><strong>Priorité :</strong> ${safePriority === 'Urgente' ? '🚨 Urgente' : safePriority}</p>
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
});

router.get('/badge', requireAuth, (req, res, next) => {
  const adminRoles = ['admin', 'secretary', 'sales_director', 'verifier'];
  const isAdmin    = adminRoles.includes(req.session.role);

  // Admins → tous les tickets ouverts
  // Autres → seulement ceux qui leur sont assignés
  const sql = isAdmin
    ? `SELECT COUNT(*) as count, SUM(CASE WHEN priority = 'Urgente' THEN 1 ELSE 0 END) as urgent FROM tickets WHERE status = 'Ouvert'`
    : `SELECT COUNT(DISTINCT t.id) as count, SUM(CASE WHEN t.priority = 'Urgente' THEN 1 ELSE 0 END) as urgent FROM tickets t
       JOIN ticket_assignees ta ON t.id = ta.ticket_id
       WHERE t.status = 'Ouvert' AND ta.user_id = ?`;

  const params = isAdmin ? [] : [req.session.userId];

  db.get(sql, params, (err, row) => {
    if (err) return next(err);
    res.json({ count: row ? row.count : 0, urgent: row ? (row.urgent || 0) : 0 });
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  db.get(
    `SELECT t.*, u1.name as creator_name, u3.name as owner_name, c.cabinet_name
     FROM tickets t
     LEFT JOIN users u1 ON t.creator_id = u1.id
     LEFT JOIN users u3 ON t.owner_id = u3.id
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
            db.all(
              `SELECT r.id, r.report_number, r.work_type, r.status, r.created_at
               FROM ticket_reports tr JOIN reports r ON tr.report_id = r.id
               WHERE tr.ticket_id = ? ORDER BY r.created_at DESC`,
              [id], (err, linkedReports) => {
                ticket.linked_reports = linkedReports || [];
                res.json(ticket);
              });
          });
      });
    });
});

// ─── RAPPORTS LIÉS ──────────────────────────────────────────────────────────────
router.post('/:id/reports', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  const reportId = toInt(req.body.report_id);
  if (!id || !reportId) return res.status(400).json({ error: 'ID invalide.' });

  db.get('SELECT report_number, title FROM reports WHERE id = ?', [reportId], (err, report) => {
    if (err) return next(err);
    if (!report) return res.status(404).json({ error: 'Rapport introuvable.' });

    db.run('INSERT OR IGNORE INTO ticket_reports (ticket_id, report_id) VALUES (?, ?)', [id, reportId], (err) => {
      if (err) return next(err);
      const label = report.report_number || report.title || `#${reportId}`;
      log.update(req, 'ticket', id, `#${id} — Rapport lié : ${label}`);
      db.run(
        'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
        [id, req.session.userId, `a lié le rapport ${label}`]);
      res.json({ success: true });
    });
  });
});

router.delete('/:id/reports/:reportId', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  const reportId = toInt(req.params.reportId);
  if (!id || !reportId) return res.status(400).json({ error: 'ID invalide.' });

  db.get('SELECT report_number, title FROM reports WHERE id = ?', [reportId], (err, report) => {
    const label = report ? (report.report_number || report.title || `#${reportId}`) : `#${reportId}`;
    db.run('DELETE FROM ticket_reports WHERE ticket_id = ? AND report_id = ?', [id, reportId], function (err) {
      if (err) return next(err);
      if (this.changes > 0) {
        log.update(req, 'ticket', id, `#${id} — Rapport délié : ${label}`);
        db.run(
          'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
          [id, req.session.userId, `a retiré le rapport ${label}`]);
      }
      res.json({ success: true });
    });
  });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
router.put('/:id', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  const { title, description, status, client_id, equipment_id, assigned_to, priority, category, owner_id, blocked_reason, closing_note } = req.body;
  const safePriority = ['Urgente','Haute','Normale','Basse'].includes(priority) ? priority : 'Normale';
  const safeOwnerId  = toInt(owner_id) || null;
  const safeReason   = safeBlockedReason(status, blocked_reason);

  validateCategory(category, (cat) => {
    db.get('SELECT title, description, status, priority, category, owner_id, blocked_reason, creator_id FROM tickets WHERE id = ?', [id], (err, old) => {
      if (err) return next(err);
      if (!old) return res.status(404).json({ error: 'Ticket introuvable.' });

      // Clôturer un ticket nécessite une note de résolution — sinon l'info est
      // perdue et personne ne sait comment le problème a été traité.
      if (status === 'Clôturé' && old.status !== 'Clôturé' && !isNonEmptyString(closing_note)) {
        return res.status(400).json({ error: "Merci d'indiquer comment le ticket a été résolu avant de le clôturer." });
      }

      db.run(
        `UPDATE tickets
         SET title=?, description=?, status=?, client_id=?, equipment_id=?,
             priority=?, category=?, owner_id=?, blocked_reason=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [title || old.title, description || old.description,
         status, toInt(client_id) || null, toInt(equipment_id) || null,
         safePriority, cat, safeOwnerId, safeReason, id],
        () => {
          // ── NOTIFICATIONS IN-APP (avant la réécriture des assignations) ─────
          db.all('SELECT user_id FROM ticket_assignees WHERE ticket_id = ?', [id], (eA, oldRows) => {
            const oldAssignees = (oldRows || []).map((r) => Number(r.user_id));
            const newAssignees = Array.isArray(assigned_to) ? assigned_to.map(toInt).filter(Boolean) : [];
            const priorWatchers = [old.creator_id, old.owner_id, ...oldAssignees];
            const link  = `/tickets.html?open=${id}`;
            const label = `« ${old.title} »`;

            if (old.status !== status) {
              if (status === 'Clôturé') {
                notifyInApp(priorWatchers, req.session.userId, 'success', `✅ Ticket clôturé : ${label}`, link);
              } else if (status === 'Bloqué') {
                notifyInApp(priorWatchers, req.session.userId, 'warning',
                  `🟠 Ticket bloqué${safeReason ? ` (${safeReason})` : ''} : ${label}`, link);
              } else if (status === 'Ouvert') {
                notifyInApp(priorWatchers, req.session.userId, 'info', `🔄 Ticket rouvert : ${label}`, link);
              }
            }
            if (safePriority === 'Urgente' && old.priority !== 'Urgente') {
              notifyInApp([old.owner_id, ...oldAssignees, safeOwnerId, ...newAssignees],
                req.session.userId, 'warning', `🔴 Ticket passé en URGENT : ${label}`, link);
            }
            const addedAssignees = newAssignees.filter((uid) => !oldAssignees.includes(uid));
            if (addedAssignees.length) {
              notifyInApp(addedAssignees, req.session.userId, 'info',
                `👥 Vous avez été ajouté au ticket : ${label}`, link);
            }
            if (safeOwnerId && Number(safeOwnerId) !== Number(old.owner_id)) {
              notifyInApp([safeOwnerId], req.session.userId, 'info',
                `👤 Vous êtes désormais responsable du ticket : ${label}`, link);
            }
          });

          // ── LOGS ───────────────────────────────────────────────────────────
          if (old.status !== status) {
            const reasonSuffix = status === 'Bloqué' && safeReason ? ` (${safeReason})` : '';
            log.status(req, 'ticket', id,
              `#${id} "${old.title}" : "${old.status}" → "${status}"${reasonSuffix}`);
            // Commentaire système
            db.run(
              'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
              [id, req.session.userId, `a passé le ticket en : ${status}${reasonSuffix}`]);
            // Note de résolution, à la clôture
            if (status === 'Clôturé' && isNonEmptyString(closing_note)) {
              db.run(
                'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 0)',
                [id, req.session.userId, closing_note.trim()]);
            }
          } else if (status === 'Bloqué' && (old.blocked_reason || null) !== (safeReason || null)) {
            log.update(req, 'ticket', id,
              `#${id} — Raison du blocage : "${old.blocked_reason || 'Aucune'}" → "${safeReason || 'Aucune'}"`);
            db.run(
              'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
              [id, req.session.userId, `a changé la raison du blocage : "${old.blocked_reason || 'Aucune'}" → "${safeReason || 'Aucune'}"`]);
          } else if (old.priority !== safePriority) {
            log.update(req, 'ticket', id,
              `#${id} — Priorité : "${old.priority}" → "${safePriority}"`);
            db.run(
              'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
              [id, req.session.userId, `a changé la priorité : "${old.priority}" → "${safePriority}"`]);
          } else if ((old.category || null) !== (cat || null)) {
            log.update(req, 'ticket', id,
              `#${id} — Catégorie : "${old.category || 'Aucune'}" → "${cat || 'Aucune'}"`);
            db.run(
              'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
              [id, req.session.userId, `a changé la catégorie : "${old.category || 'Aucune'}" → "${cat || 'Aucune'}"`]);
          } else if ((old.owner_id || null) !== (safeOwnerId || null)) {
            const lookupIds = [old.owner_id || 0, safeOwnerId || 0];
            db.all('SELECT id, name FROM users WHERE id IN (?, ?)', lookupIds, (err, users) => {
              const nameOf = (uid) => (users || []).find((u) => u.id === uid)?.name || 'Aucun';
              const oldName = old.owner_id ? nameOf(old.owner_id) : 'Aucun';
              const newName = safeOwnerId ? nameOf(safeOwnerId) : 'Aucun';
              log.update(req, 'ticket', id, `#${id} — Responsable : "${oldName}" → "${newName}"`);
              db.run(
                'INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)',
                [id, req.session.userId, `a changé le responsable : "${oldName}" → "${newName}"`]);
            });
          } else {
            log.update(req, 'ticket', id, `#${id} "${old.title}" modifié`);
          }

          // Assignations
          db.run('DELETE FROM ticket_assignees WHERE ticket_id = ?', [id], () => {
            const assigneeIds = Array.isArray(assigned_to) ? assigned_to.map(toInt).filter(Boolean) : [];
            const emailRecipientIds = Array.from(new Set([...assigneeIds, safeOwnerId].filter(Boolean)));

            assigneeIds.forEach((uid) => {
              db.run('INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)', [id, uid]);
            });

            emailRecipientIds.forEach((uid) => {
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

          res.json({ success: true });
        }
      );
    });
  });
});

// ─── POST /:id/read ───────────────────────────────────────────────────────────
router.post('/:id/read', requireStaff, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  db.run(
    `INSERT INTO ticket_reads (ticket_id, user_id, last_seen_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(ticket_id, user_id) DO UPDATE SET last_seen_at = datetime('now')`,
    [id, req.session.userId],
    (err) => err ? next(err) : res.json({ success: true })
  );
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
        if (!ticketData) return;
        notifyMention(commentText, id, ticketData.title);
        // Notifie aussi les suiveurs du ticket (créateur / responsable / assignés),
        // sauf l'auteur et les personnes déjà notifiées par une @mention.
        if (!isSystem) {
          resolveMentionIds(commentText, (mentionedIds) => {
            getTicketWatchers(id, (watchers) => {
              const excluded = new Set(mentionedIds.map(Number));
              notifyInApp(
                watchers.filter((uid) => !excluded.has(Number(uid))),
                req.session.userId, 'info',
                `💬 Nouveau commentaire sur : « ${ticketData.title} »`,
                `/tickets.html?open=${id}`
              );
            });
          });
        }
      });

      res.json({ success: true });
    });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, (req, res, next) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  db.get('SELECT title FROM tickets WHERE id = ?', [id], (err, ticket) => {
    // On capture les suiveurs AVANT la suppression (les assignations partent en cascade).
    getTicketWatchers(id, (watchers) => {
      db.run('DELETE FROM tickets WHERE id = ?', [id], function (err) {
        if (err) return next(err);
        if (this.changes === 0) return res.status(404).json({ error: 'Ticket introuvable.' });

        // ── LOG ──────────────────────────────────────────────────────────────
        log.delete(req, 'ticket', id, `#${id} "${ticket?.title || ''}" supprimé`);

        notifyInApp(watchers, req.session.userId, 'warning',
          `🗑️ Ticket supprimé : « ${ticket?.title || ('#' + id)} »`, '/tickets.html');

        res.json({ success: true });
      });
    });
  });
});

module.exports = router;