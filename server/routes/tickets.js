const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer'); // <-- NOUVEAU

const uploadDir = 'public/uploads/tickets/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Le détecteur de mentions (Amélioré avec E-mail)
const notifyMention = (commentText, ticketId, ticketTitle) => {
    if (!commentText) return;
    const mentions = commentText.match(/@([a-zA-ZÀ-ÿ0-9_\-\.]+)/g);
    if (!mentions) return;
    
    mentions.forEach(m => {
        const name = m.substring(1);
        // On récupère l'ID, mais aussi l'e-mail de l'utilisateur !
        db.get("SELECT id, name, email FROM users WHERE REPLACE(name, ' ', '') LIKE ?", [`%${name}%`], (err, user) => {
            if (user) {
                // 1. Notification interne (la cloche)
                db.run("INSERT INTO notifications (user_id, type, message, link) VALUES (?, 'info', ?, ?)",
                [user.id, `On vous a mentionné dans le ticket : ${ticketTitle}`, `/tickets.html?open=${ticketId}`]);

                // 2. Notification par e-mail
                if (user.email) {
                    const subject = `[KB Med] Vous avez été mentionné : ${ticketTitle}`;
                    const htmlMsg = `
                        <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                            <h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">Bonjour ${user.name},</h2>
                            <p>Vous avez été mentionné dans une discussion concernant le ticket : <strong>${ticketTitle}</strong>.</p>
                            <div style="padding: 15px; background: #f8fafc; border-left: 4px solid #2563eb; font-style: italic; margin: 20px 0;">
                                "${commentText}"
                            </div>
                            <br>
                            <a href="https://app.kbmed.ch/tickets.html?open=${ticketId}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ouvrir le ticket</a>
                        </div>
                    `;
                    sendMail(user.email, subject, htmlMsg);
                }
            }
        });
    });
};

router.get('/', requireAuth, (req, res) => {
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
        ORDER BY t.is_urgent DESC, CASE t.status WHEN 'Ouvert' THEN 1 WHEN 'En attente' THEN 2 WHEN 'Clôturé' THEN 3 END, t.created_at DESC
    `;
    const p = `%${search}%`;
    db.all(sql, [p, p, p], (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows));
});

// 2. CRÉATION (Avec Notification E-mail Groupée)
router.post('/', requireAuth, (req, res) => {
    const { title, description, client_id, equipment_id, assigned_to, is_urgent } = req.body;
    
    db.run(`INSERT INTO tickets (title, description, client_id, equipment_id, is_urgent, creator_id) VALUES (?, ?, ?, ?, ?, ?)`, 
    [title, description, client_id || null, equipment_id || null, is_urgent ? 1 : 0, req.session.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const ticketId = this.lastID;

        // Si on a des techniciens assignés
        if (Array.isArray(assigned_to) && assigned_to.length > 0) {
            
            // 1. On enregistre les assignations dans la base de données
            assigned_to.forEach(uid => {
                db.run("INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)", [ticketId, uid]);
            });

            // 2. L'ENVOI GROUPÉ : On prépare une requête pour récupérer tous les emails d'un coup
            const placeholders = assigned_to.map(() => '?').join(','); // Crée "?, ?, ?" selon le nombre de personnes
            const sql = `SELECT email FROM users WHERE id IN (${placeholders}) AND email IS NOT NULL AND pref_mail_assign = 1`;

            db.all(sql, assigned_to, (err, users) => {
                if (users && users.length > 0) {
                    // On transforme le tableau en une simple liste séparée par des virgules : "mail1@kb-med.ch, mail2@kb-med.ch"
                    const emailList = users.map(u => u.email).join(', ');

                    const subject = `[KB Med] ${is_urgent ? '🚨 URGENT : ' : ''}Nouveau ticket assigné - ${title}`;
                    
                    // On adapte le message pour le groupe (on enlève le "Bonjour [Nom]" individuel)
                    const htmlMsg = `
                        <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                            <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">Nouveau Ticket Assigné</h2>
                            <p>Bonjour à l'équipe,</p>
                            <p>Un nouveau ticket vous a été assigné en groupe dans le système <strong>KB Med</strong>.</p>
                            <div style="padding: 15px; background: #f8fafc; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
                                <p><strong>Sujet :</strong> ${title}</p>
                                <p><strong>Urgence :</strong> ${is_urgent ? '🚨 Haute' : 'Normale'}</p>
                            </div>
                            <a href="https://app.kbmed.ch/tickets.html?open=${ticketId}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Voir le ticket</a>
                        </div>`;
                    
                    // On envoie un seul mail à toute la liste !
                    sendMail(emailList, subject, htmlMsg);
                }
            });
        }
        res.json({ success: true, id: ticketId });
    });
});

// 2.5 COMPTEUR POUR LE BADGE DU MENU LATÉRAL (Doit être placé avant /:id)
router.get('/badge', requireAuth, (req, res) => {
    const sql = `
        SELECT COUNT(DISTINCT t.id) as count
        FROM tickets t
        JOIN ticket_assignees ta ON t.id = ta.ticket_id
        WHERE t.status = 'Ouvert' AND ta.user_id = ?
    `;
    db.get(sql, [req.session.userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ count: row ? row.count : 0 });
    });
});

router.get('/:id', requireAuth, (req, res) => {
    db.get(`SELECT t.*, u1.name as creator_name, c.cabinet_name FROM tickets t LEFT JOIN users u1 ON t.creator_id = u1.id LEFT JOIN clients c ON t.client_id = c.id WHERE t.id = ?`, [req.params.id], (err, ticket) => {
        if (err || !ticket) return res.status(404).json({ error: "Introuvable" });
        db.all(`SELECT user_id FROM ticket_assignees WHERE ticket_id = ?`, [req.params.id], (err, assignees) => {
            ticket.assigned_to = assignees ? assignees.map(a => a.user_id) : [];
            db.all(`SELECT tc.*, u.name as user_name FROM ticket_comments tc JOIN users u ON tc.user_id = u.id WHERE tc.ticket_id = ? ORDER BY tc.created_at ASC`, [req.params.id], (err, comments) => {
                ticket.comments = comments || [];
                res.json(ticket);
            });
        });
    });
});

// 4. MISE À JOUR (Avec Notification Email à chaque modification)
router.put('/:id', requireAuth, (req, res) => {
    const { status, client_id, equipment_id, assigned_to, is_urgent } = req.body;
    const ticketId = req.params.id;
    const userId = req.session.userId;

    db.get("SELECT title, status FROM tickets WHERE id = ?", [ticketId], (err, old) => {
        if (err || !old) return res.status(404).json({ error: "Ticket introuvable" });

        db.run(`UPDATE tickets SET status = ?, client_id = ?, equipment_id = ?, is_urgent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
        [status, client_id || null, equipment_id || null, is_urgent ? 1 : 0, ticketId], () => {
            
            db.run("DELETE FROM ticket_assignees WHERE ticket_id = ?", [ticketId], () => {
                if (Array.isArray(assigned_to) && assigned_to.length > 0) {
                    assigned_to.forEach(uid => {
                        db.run("INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)", [ticketId, uid], () => {
                            // NOTIFICATION EMAIL DE MODIFICATION
                            db.get("SELECT name, email FROM users WHERE id = ?", [uid], (err, user) => {
                                if (user && user.email) {
                                    const subject = `[KB Med] Mise à jour du ticket : ${old.title}`;
                                    const htmlMsg = `
                                        <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                                            <h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">Mise à jour du Ticket</h2>
                                            <p>Bonjour <strong>${user.name}</strong>,</p>
                                            <p>Le ticket <strong>[#${ticketId}] ${old.title}</strong> auquel vous êtes assigné a été modifié.</p>
                                            <div style="padding: 15px; background: #f8fafc; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
                                                <p><strong>Nouveau Statut :</strong> ${status}</p>
                                                <p><strong>Urgence :</strong> ${is_urgent ? '🚨 Urgent' : 'Normale'}</p>
                                            </div>
                                            <a href="https://app.kbmed.ch/tickets.html?open=${ticketId}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accéder au ticket</a>
                                        </div>`;
                                    sendMail(user.email, subject, htmlMsg);
                                }
                            });
                        });
                    });
                }
            });

            if (old.status !== status) {
                db.run("INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)", 
                [ticketId, userId, `a passé le ticket en : ${status}`]);
            }
            res.json({ success: true });
        });
    });
});

// 5. COMMENTAIRE AVEC PIÈCE JOINTE (Sans spam de groupe, uniquement mentions)
router.post('/:id/comments', requireAuth, upload.single('attachment'), (req, res) => {
    const filePath = req.file ? `/uploads/tickets/${req.file.filename}` : null;
    const commentText = req.body.comment || (req.file ? '[Pièce jointe envoyée]' : '');
    const ticketId = req.params.id;
    const commenterId = req.session.userId;

    if (!commentText && !filePath) return res.status(400).json({ error: "Message vide" });

    db.run("INSERT INTO ticket_comments (ticket_id, user_id, comment, file_path) VALUES (?, ?, ?, ?)", 
    [ticketId, commenterId, commentText, filePath], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        // On vérifie uniquement s'il y a des mentions (@Nom) pour envoyer une alerte ciblée
        db.get("SELECT title FROM tickets WHERE id = ?", [ticketId], (e, ticketData) => {
            if (ticketData) {
                notifyMention(commentText, ticketId, ticketData.title);
            }
        });
        
        res.json({ success: true });
    });
});

router.delete('/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM tickets WHERE id = ?", [req.params.id], err => err ? res.status(500).json({ error: err.message }) : res.json({ success: true }));
});

module.exports = router;