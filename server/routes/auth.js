// server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db } = require('../config/database');

// LOGIN
router.post('/login', (req, res) => {
    // 1. On récupère aussi 'remember' ici
    const { email, password, remember } = req.body;

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: "Email ou mot de passe incorrect" });
        
        if (!user.is_active) return res.status(403).json({ error: "Ce compte a été désactivé" });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: "Email ou mot de passe incorrect" });
        }

        // Création de la session
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.name = user.name;

        // --- CORRECTION "SE SOUVENIR DE MOI" ---
        if (remember) {
            // Si coché : 30 jours (en millisecondes)
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        } else {
            // Sinon : 24 heures (remise à zéro de la config par défaut)
            req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
        }
        // ---------------------------------------

        // Mise à jour last_login
        db.run("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

        // Log d'activité
        const meta = JSON.stringify({ ip: req.ip, agent: req.headers['user-agent'] });
        db.run(`INSERT INTO activity_logs (user_id, action, entity, entity_id, details, meta_json) 
                VALUES (?, 'LOGIN', 'Auth', ?, 'Connexion réussie', ?)`, 
                [user.id, user.id, meta]);

        res.json({ 
            success: true, 
            user: { 
                id: user.id, 
                name: user.name, 
                role: user.role, 
                photo_url: user.photo_url 
            } 
        });
    });
});

// LOGOUT
router.post('/logout', (req, res) => {
    if (req.session.userId) {
        // On loggue la déconnexion avant de détruire la session
        db.run(`INSERT INTO activity_logs (user_id, action, entity, entity_id, details) 
                VALUES (?, 'LOGOUT', 'Auth', ?, 'Déconnexion')`, 
                [req.session.userId, req.session.userId]);
        
        req.session.destroy();
    }
    res.json({ success: true });
});

// CHECK SESSION (ME)
router.get('/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Non connecté" });
    }

    // On recharge les infos depuis la DB pour être sûr (ex: si le rôle a changé pendant la session)
    db.get("SELECT id, email, role, name, photo_url FROM users WHERE id = ?", [req.session.userId], (err, user) => {
        if (!user) {
            req.session.destroy();
            return res.status(401).json({ error: "Compte introuvable" });
        }
        res.json({ user });
    });
});

module.exports = router;