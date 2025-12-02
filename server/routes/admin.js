const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

// ========== USERS ==========
router.get('/users', requireAdmin, (req, res) => {
  db.all("SELECT id, email, role, name, phone, is_active, last_login_at FROM users ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/users', requireAdmin, async (req, res) => {
  const { email, password, role, name, phone, is_active } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      "INSERT INTO users (email, password_hash, role, name, phone, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      [email, hash, role, name, phone, is_active],
      function(err) {
        if (err) return res.status(400).json({ error: "Email déjà utilisé ou erreur" });
        res.json({ id: this.lastID });
      }
    );
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const { role, name, phone, is_active, email } = req.body;
  db.run(
    "UPDATE users SET role=?, name=?, phone=?, is_active=?, email=? WHERE id=?",
    [role, name, phone, is_active, email, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: "Mot de passe trop court" });
  
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  if(req.session.userId == req.params.id) return res.status(400).json({error: "Impossible de supprimer son propre compte"});
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
    if(err) return res.status(500).json({error: err.message});
    res.json({success: true});
  });
});

// ========== SECTORS ==========
router.get('/sectors', requireAdmin, (req, res) => {
  db.all("SELECT * FROM sectors ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/sectors', requireAdmin, (req, res) => {
  const { name } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  db.run("INSERT INTO sectors (name, slug) VALUES (?, ?)", [name, slug], function(err) {
    if (err) return res.status(400).json({ error: "Erreur ou doublon" });
    res.json({ id: this.lastID });
  });
});

router.delete('/sectors/:id', requireAdmin, (req, res) => {
  db.run("DELETE FROM sectors WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ========== DEVICE TYPES (NOUVEAU) ==========
router.get('/device-types', requireAdmin, (req, res) => {
  db.all("SELECT * FROM device_types ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/device-types', requireAdmin, (req, res) => {
  const { name } = req.body;
  db.run("INSERT INTO device_types (name) VALUES (?)", [name], function(err) {
    if (err) return res.status(400).json({ error: "Erreur ou doublon" });
    res.json({ id: this.lastID, name });
  });
});

router.delete('/device-types/:id', requireAdmin, (req, res) => {
  db.run("DELETE FROM device_types WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ========== EQUIPMENT CATALOG ==========
router.get('/equipment', requireAdmin, (req, res) => {
  db.all("SELECT * FROM equipment_catalog ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/equipment', requireAdmin, (req, res) => {
  // type est maintenant utilisé pour le Secteur, device_type pour l'appareil
  const { name, brand, model, type, device_type } = req.body;
  db.run(
    "INSERT INTO equipment_catalog (name, brand, model, type, device_type) VALUES (?, ?, ?, ?, ?)",
    [name, brand, model, type, device_type],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

router.put('/equipment/:id', requireAdmin, (req, res) => {
  const { name, brand, model, type, device_type } = req.body;
  db.run(
    "UPDATE equipment_catalog SET name=?, brand=?, model=?, type=?, device_type=? WHERE id=?",
    [name, brand, model, type, device_type, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

router.delete('/equipment/:id', requireAdmin, (req, res) => {
  db.run("DELETE FROM equipment_catalog WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ========== MATERIALS ==========
router.get('/materials', requireAdmin, (req, res) => {
  db.all("SELECT * FROM materials ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/materials', requireAdmin, (req, res) => {
  const { name, product_code, unit_price } = req.body;
  db.run(
    "INSERT INTO materials (name, product_code, unit_price) VALUES (?, ?, ?)",
    [name, product_code, unit_price],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

router.put('/materials/:id', requireAdmin, (req, res) => {
  const { name, product_code, unit_price } = req.body;
  db.run(
    "UPDATE materials SET name=?, product_code=?, unit_price=? WHERE id=?",
    [name, product_code, unit_price, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

router.delete('/materials/:id', requireAdmin, (req, res) => {
  db.run("DELETE FROM materials WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ========== LOGS ==========
router.get('/logs', requireAdmin, (req, res) => {
  const limit = req.query.limit || 50;
  db.all(
    `SELECT l.*, u.name as user_name 
     FROM activity_logs l 
     LEFT JOIN users u ON l.user_id = u.id 
     ORDER BY l.created_at DESC LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

module.exports = router;