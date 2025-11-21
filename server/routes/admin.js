const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ========== UTILISATEURS ==========

router.get('/users', requireAdmin, (req, res) => {
  db.all(
    `SELECT id, email, name, role, phone, is_active, created_at, last_login_at 
     FROM users ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      res.json(rows || []);
    }
  );
});

router.post('/users', requireAdmin, async (req, res) => {
  const { email, password, name, role, phone } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  if (!['admin', 'tech'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  db.run(
    `INSERT INTO users (email, password_hash, name, role, phone) 
     VALUES (?, ?, ?, ?, ?)`,
    [email, passwordHash, name, role, phone || null],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Cet email existe déjà' });
        }
        return res.status(500).json({ error: 'Erreur lors de la création' });
      }

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) 
         VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, 'create', 'user', this.lastID, JSON.stringify({ email, name })]
      );

      res.json({ success: true, id: this.lastID });
    }
  );
});

router.put('/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, name, phone, is_active } = req.body;

  db.run(
    `UPDATE users SET email = ?, name = ?, phone = ?, is_active = ? WHERE id = ?`,
    [email, name, phone, is_active ? 1 : 0, id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erreur lors de la modification' });

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)`,
        [req.session.userId, 'update', 'user', id]
      );

      res.json({ success: true });
    }
  );
});

router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min. 6 caractères)' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id], (err) => {
    if (err) return res.status(500).json({ error: 'Erreur lors de la réinitialisation' });

    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)`,
      [req.session.userId, 'reset_password', 'user', id]
    );

    res.json({ success: true });
  });
});

// ========== SECTEURS ==========

router.get('/sectors', requireAdmin, (req, res) => {
  db.all('SELECT * FROM sectors ORDER BY name ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    res.json(rows || []);
  });
});

router.post('/sectors', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });

  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');

  db.run('INSERT INTO sectors (name, slug) VALUES (?, ?)', [name, slug], function (err) {
    if (err) return res.status(500).json({ error: 'Erreur lors de la création' });

    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)`,
      [req.session.userId, 'create', 'sector', this.lastID, JSON.stringify({ name })]
    );

    res.json({ success: true, id: this.lastID });
  });
});

router.delete('/sectors/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM sectors WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: 'Erreur lors de la suppression' });

    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)`,
      [req.session.userId, 'delete', 'sector', id]
    );

    res.json({ success: true });
  });
});

// 🔥 NOUVEAU : DELETE /api/admin/users/:id
router.delete('/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  // Empêcher la suppression de son propre compte
  if (parseInt(id) === req.session.userId) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }
  
  db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: 'Erreur lors de la suppression' });
    
    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)`,
      [req.session.userId, 'delete', 'user', id]
    );
    
    res.json({ success: true });
  });
});

// ========== MATÉRIEL ==========

router.get('/materials', requireAdmin, (req, res) => {
  db.all('SELECT * FROM materials ORDER BY name ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    res.json(rows || []);
  });
});

router.post('/materials', requireAdmin, (req, res) => {
  const { name, product_code, unit_price } = req.body;

  if (!name || !product_code || unit_price === undefined) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  db.run(
    `INSERT INTO materials (name, product_code, unit_price) VALUES (?, ?, ?)`,
    [name, product_code, parseFloat(unit_price)],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erreur lors de la création' });

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, 'create', 'material', this.lastID, JSON.stringify({ name, product_code })]
      );

      res.json({ success: true, id: this.lastID });
    }
  );
});

router.put('/materials/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, product_code, unit_price } = req.body;

  db.run(
    `UPDATE materials SET name = ?, product_code = ?, unit_price = ? WHERE id = ?`,
    [name, product_code, parseFloat(unit_price), id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Erreur lors de la modification' });

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)`,
        [req.session.userId, 'update', 'material', id]
      );

      res.json({ success: true });
    }
  );
});

router.delete('/materials/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM materials WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: 'Erreur lors de la suppression' });

    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)`,
      [req.session.userId, 'delete', 'material', id]
    );

    res.json({ success: true });
  });
});

// ========== CATALOGUE ÉQUIPEMENTS ==========

router.get('/equipment', requireAdmin, (req, res) => {
  db.all('SELECT * FROM equipment_catalog ORDER BY type, brand, name ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    res.json(rows || []);
  });
});

router.post('/equipment', requireAdmin, (req, res) => {
  const { name, brand, model, type } = req.body;

  if (!name || !brand || !type) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  db.run(
    `INSERT INTO equipment_catalog (name, brand, model, type) VALUES (?, ?, ?, ?)`,
    [name, brand, model || '', type],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erreur lors de la création' });

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, 'create', 'equipment', this.lastID, JSON.stringify({ name, brand, type })]
      );

      res.json({ success: true, id: this.lastID });
    }
  );
});

router.put('/equipment/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, brand, model, type } = req.body;

  db.run(
    `UPDATE equipment_catalog SET name = ?, brand = ?, model = ?, type = ? WHERE id = ?`,
    [name, brand, model || '', type, id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Erreur lors de la modification' });

      db.run(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)`,
        [req.session.userId, 'update', 'equipment', id]
      );

      res.json({ success: true });
    }
  );
});

router.delete('/equipment/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM equipment_catalog WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: 'Erreur lors de la suppression' });

    db.run(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)`,
      [req.session.userId, 'delete', 'equipment', id]
    );

    res.json({ success: true });
  });
});

// ========== LOGS ==========

router.get('/logs', requireAdmin, (req, res) => {
  const { limit = 50 } = req.query;

  db.all(
    `SELECT al.id, al.action, al.entity, al.entity_id, al.meta_json, al.created_at, 
            u.name as user_name, u.email as user_email
     FROM activity_logs al
     LEFT JOIN users u ON al.user_id = u.id
     ORDER BY al.created_at DESC
     LIMIT ?`,
    [parseInt(limit)],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      res.json(rows || []);
    }
  );
});

module.exports = router;