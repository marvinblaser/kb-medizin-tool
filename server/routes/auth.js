// server/routes/auth.js

const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');

const router = express.Router();

// POST /api/login
router.post('/login', async (req, res) => {
  const { email, password, remember } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  db.get(
    'SELECT * FROM users WHERE email = ? AND is_active = 1',
    [email],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      if (!user) {
        return res
          .status(401)
          .json({ error: 'Email ou mot de passe incorrect' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res
          .status(401)
          .json({ error: 'Email ou mot de passe incorrect' });
      }

      // Créer la session
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.name = user.name;

      // Durée de session
      if (remember) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 jours
      } else {
        req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 heures
      }

      // Mettre à jour last_login_at
      db.run(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );

      // Logger l'activité
      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) 
         VALUES (?, ?, ?, ?, ?)`,
        [user.id, 'login', 'user', user.id, '{}']
      );

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    }
  );
});

// POST /api/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/me
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  db.get(
    'SELECT id, email, name, role FROM users WHERE id = ?',
    [req.session.userId],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Session invalide' });
      }
      res.json({ user });
    }
  );
});

module.exports = router;