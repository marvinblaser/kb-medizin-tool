// server/routes/auth.js — VERSION COMPLÈTE AVEC LOGS
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const { db }  = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const log = require('../utils/logger');

const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', (req, res, next) => {
  const { email, password, remember } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string'
      || email.trim() === '' || password === '') {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email.trim()], async (err, user) => {
    if (err) return next(err);

    try {
      const hashToCompare  = user ? user.password_hash : DUMMY_HASH;
      const passwordMatches = await bcrypt.compare(password, hashToCompare);

      if (!user || !passwordMatches) {
        // ── LOG ÉCHEC ────────────────────────────────────────────────────────
        log(req, 'FAIL', 'auth', null,
          `Tentative échouée pour "${email.trim()}" — IP: ${req.ip}`);
        return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
      }

      if (!user.is_active) {
        log(req, 'FAIL', 'auth', null,
          `Compte désactivé : "${user.name}" (${email.trim()}) — IP: ${req.ip}`);
        return res.status(403).json({ error: 'Ce compte a été désactivé.' });
      }

      req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.userId = user.id;
        req.session.role   = user.role;
        req.session.name   = user.name;
        req.session.cookie.maxAge = remember
          ? 30 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

        req.session.save((err) => {
          if (err) return next(err);

          db.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

          // ── LOG SUCCÈS ───────────────────────────────────────────────────
          log(req, 'LOGIN', 'auth', null,
            `${user.name} (${user.role}) — IP: ${req.ip}`);

          res.json({
            success: true,
            user: { id: user.id, name: user.name, role: user.role, photo_url: user.photo_url }
          });
        });
      });
    } catch (compareErr) { next(compareErr); }
  });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post('/logout', (req, res, next) => {
  if (!req.session.userId) return res.json({ success: true });

  // ── LOG AVANT destruction session ────────────────────────────────────────
  log(req, 'LOGOUT', 'auth', null,
    `${req.session.name || 'Utilisateur'} (${req.session.role || '—'})`);

  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// ─── ME ───────────────────────────────────────────────────────────────────────
router.get('/me', (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });

  db.get(
    `SELECT id, email, role, name, photo_url, is_active,
      pref_mail_assign, pref_mail_comment, pref_mail_status, pref_mail_mention
     FROM users WHERE id = ?`,
    [req.session.userId],
    (err, user) => {
      if (err) return next(err);
      if (!user || !user.is_active) {
        return req.session.destroy(() => {
          res.clearCookie('connect.sid');
          res.status(401).json({ error: 'Compte introuvable ou désactivé' });
        });
      }
      res.json({ user });
    }
  );
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
router.put('/change-password', requireAuth, (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'Minimum 6 caractères.' });

  db.get('SELECT * FROM users WHERE id = ?', [req.session.userId], async (err, user) => {
    if (err) return next(err);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      log(req, 'FAIL', 'auth', null, `Mauvais mot de passe actuel — ${user.name}`);
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.session.userId], err => {
      if (err) return next(err);
      // ── LOG ────────────────────────────────────────────────────────────────
      log(req, 'UPDATE', 'utilisateur', req.session.userId,
        `${user.name} a changé son mot de passe`);
      res.json({ success: true });
    });
  });
});

// ─── PRÉFÉRENCES NOTIFICATIONS ────────────────────────────────────────────────
router.put('/prefs', requireAuth, (req, res, next) => {
  const {
    pref_mail_assign  = 0,
    pref_mail_comment = 0,
    pref_mail_status  = 0,
    pref_mail_mention = 0,
  } = req.body;

  db.run(
    `UPDATE users
     SET pref_mail_assign=?, pref_mail_comment=?, pref_mail_status=?, pref_mail_mention=?
     WHERE id=?`,
    [pref_mail_assign ? 1 : 0, pref_mail_comment ? 1 : 0,
     pref_mail_status ? 1 : 0, pref_mail_mention ? 1 : 0,
     req.session.userId],
    err => {
      if (err) return next(err);
      log(req, 'UPDATE', 'utilisateur', req.session.userId, 'Préférences de notification modifiées');
      res.json({ success: true });
    }
  );
});

// ─── PRÉFÉRENCES ANCIENNES (compatibilité) ────────────────────────────────────
router.put('/me/preferences', requireAuth, (req, res, next) => {
  const { pref_mail_assign, pref_mail_mention } = req.body;
  db.run(
    'UPDATE users SET pref_mail_assign = ?, pref_mail_mention = ? WHERE id = ?',
    [pref_mail_assign ? 1 : 0, pref_mail_mention ? 1 : 0, req.session.userId],
    (err) => err ? next(err) : res.json({ success: true })
  );
});

router.get('/me/preferences', requireAuth, (req, res, next) => {
  db.get(
    'SELECT pref_mail_assign, pref_mail_mention FROM users WHERE id = ?',
    [req.session.userId],
    (err, row) => err ? next(err) : res.json(row || { pref_mail_assign: 1, pref_mail_mention: 1 })
  );
});

module.exports = router;