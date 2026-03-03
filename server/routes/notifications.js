// server/routes/notifications.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Récupérer les 50 dernières notifications de l'utilisateur (avec Auto-Nettoyage)
router.get('/', requireAuth, (req, res) => {
    // 1. ASTUCE : Nettoyage silencieux des vieilles notifications lues (plus de 30 jours)
    db.run("DELETE FROM notifications WHERE is_read = 1 AND created_at < datetime('now', '-30 days')", [], (err) => {
        if (err) console.error("Erreur nettoyage notifs:", err.message);

        // 2. On récupère les 50 dernières pour l'affichage
        // Ajout de "id DESC" pour forcer un ordre strict si les dates sont identiques
        db.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50",
        [req.session.userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

// Marquer UNE notification comme lue
router.put('/:id/read', requireAuth, (req, res) => {
    db.run("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", 
    [req.params.id, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Tout marquer comme lu
router.put('/read-all', requireAuth, (req, res) => {
    db.run("UPDATE notifications SET is_read = 1 WHERE user_id = ?", 
    [req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- NOUVEAU : Supprimer UNE notification ---
router.delete('/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM notifications WHERE id = ? AND user_id = ?", 
    [req.params.id, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- NOUVEAU : Supprimer TOUTES les notifications ---
router.delete('/all', requireAuth, (req, res) => {
    db.run("DELETE FROM notifications WHERE user_id = ?", 
    [req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;