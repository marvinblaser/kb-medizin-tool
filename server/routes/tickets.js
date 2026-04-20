const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const uploadDir = 'public/uploads/tickets/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Le détecteur de mentions (Amélioré avec menu)
const notifyMention = (commentText, ticketId, ticketTitle) => {
    if (!commentText) return;
    const mentions = commentText.match(/@([a-zA-ZÀ-ÿ0-9_\-\.]+)/g);
    if (!mentions) return;
    
    mentions.forEach(m => {
        const name = m.substring(1);
        // L'astuce : On ignore les espaces dans la base de données pour trouver "Jean Claude" avec "@JeanClaude"
        db.get("SELECT id FROM users WHERE REPLACE(name, ' ', '') LIKE ?", [`%${name}%`], (err, user) => {
            if (user) {
                db.run("INSERT INTO notifications (user_id, type, message, link) VALUES (?, 'info', ?, ?)",
                [user.id, `On vous a mentionné dans le ticket : ${ticketTitle}`, `/tickets.html?open=${ticketId}`]);
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

router.post('/', requireAuth, (req, res) => {
    const { title, description, client_id, equipment_id, assigned_to, is_urgent } = req.body;
    db.run(`INSERT INTO tickets (title, description, client_id, equipment_id, is_urgent, creator_id) VALUES (?, ?, ?, ?, ?, ?)`, 
    [title, description, client_id || null, equipment_id || null, is_urgent ? 1 : 0, req.session.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const ticketId = this.lastID;
        if (Array.isArray(assigned_to)) {
            assigned_to.forEach(uid => db.run("INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)", [ticketId, uid]));
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

// 4. MISE À JOUR (Version synchrone pour éviter les bugs d'affichage)
router.put('/:id', requireAuth, async (req, res) => {
    const { status, client_id, equipment_id, assigned_to, is_urgent } = req.body;
    const ticketId = req.params.id;
    const userId = req.session.userId;

    // 1. On récupère l'ancien statut
    db.get("SELECT status FROM tickets WHERE id = ?", [ticketId], (err, old) => {
        if (err || !old) return res.status(404).json({ error: "Ticket introuvable" });

        // 2. On met à jour les infos principales
        db.run(`UPDATE tickets SET status = ?, client_id = ?, equipment_id = ?, is_urgent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
        [status, client_id || null, equipment_id || null, is_urgent ? 1 : 0, ticketId], (err) => {
            
            // 3. On nettoie les assignations
            db.run("DELETE FROM ticket_assignees WHERE ticket_id = ?", [ticketId], () => {
                
                // Fonction pour finaliser la réponse
                const finishRequest = () => {
                    if (old.status !== status) {
                        db.run("INSERT INTO ticket_comments (ticket_id, user_id, comment, is_system) VALUES (?, ?, ?, 1)", 
                        [ticketId, userId, `a passé le ticket en : ${status}`], () => {
                            res.json({ success: true });
                        });
                    } else {
                        res.json({ success: true });
                    }
                };

                // 4. On ajoute les nouveaux techniciens (si nécessaire)
                if (Array.isArray(assigned_to) && assigned_to.length > 0) {
                    let processed = 0;
                    assigned_to.forEach(uid => {
                        db.run("INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)", [ticketId, uid], () => {
                            processed++;
                            if (processed === assigned_to.length) finishRequest();
                        });
                    });
                } else {
                    finishRequest();
                }
            });
        });
    });
});

// CORRECTION : Évite le plantage si on envoie un fichier SANS texte
router.post('/:id/comments', requireAuth, upload.single('attachment'), (req, res) => {
    const filePath = req.file ? `/uploads/tickets/${req.file.filename}` : null;
    const commentText = req.body.comment || (req.file ? '[Pièce jointe envoyée]' : '');

    if (!commentText && !filePath) return res.status(400).json({ error: "Message vide" });

    db.run("INSERT INTO ticket_comments (ticket_id, user_id, comment, file_path) VALUES (?, ?, ?, ?)", 
    [req.params.id, req.session.userId, commentText, filePath], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT title FROM tickets WHERE id = ?", [req.params.id], (e, t) => {
            if (t) notifyMention(commentText, req.params.id, t.title);
        });
        res.json({ success: true });
    });
});

router.delete('/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM tickets WHERE id = ?", [req.params.id], err => err ? res.status(500).json({ error: err.message }) : res.json({ success: true }));
});

module.exports = router;