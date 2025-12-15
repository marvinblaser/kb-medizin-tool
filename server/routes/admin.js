// server/routes/admin.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/database');
// IMPORT IMPORTANT : On ajoute requireAuth ici
const { requireAdmin, requireAuth } = require('../middleware/auth');

// --- UPLOAD CONFIG ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../public/uploads/avatars');
    if (!fs.existsSync(dir)){ fs.mkdirSync(dir, { recursive: true }); }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Images uniquement'));
  }
});

// ========== USERS ==========

// MODIFICATION ICI : requireAuth au lieu de requireAdmin (Tout le monde peut voir la liste pour les menus déroulants)
router.get('/users', requireAuth, (req, res) => {
  db.all("SELECT id, email, role, name, phone, photo_url, is_active, last_login_at FROM users ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/users', requireAdmin, upload.single('photo'), async (req, res) => {
  const { email, password, role, name, phone, is_active } = req.body;
  const photo_url = req.file ? `/uploads/avatars/${req.file.filename}` : null;

  try {
    const hash = await bcrypt.hash(password, 10);
    // UTILISATION DE LA VERSION SÉCURISÉE (Avec Logs)
    db.run("INSERT INTO users (email, password_hash, role, name, phone, photo_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [email, hash, role, name, phone, photo_url, is_active],
      function(err) {
        if (err) {
            console.error("❌ Erreur Création User:", err.message);
            const msg = err.message.includes('UNIQUE') ? "Email déjà utilisé" : "Erreur base de données";
            return res.status(400).json({ error: msg });
        }
        db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'CREATE_USER', 'User', this.lastID]);
        res.json({ id: this.lastID });
      }
    );
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id', requireAdmin, upload.single('photo'), (req, res) => {
  const { role, name, phone, is_active, email } = req.body;
  let sql = "UPDATE users SET role=?, name=?, phone=?, is_active=?, email=?";
  let params = [role, name, phone, is_active, email];
  if (req.file) { sql += ", photo_url=?"; params.push(`/uploads/avatars/${req.file.filename}`); }
  sql += " WHERE id=?"; params.push(req.params.id);

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'UPDATE_USER', 'User', req.params.id]);
    res.json({ success: true });
  });
});

router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: "Mot de passe trop court" });
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'RESET_PWD', 'User', req.params.id]);
      res.json({ success: true });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  if(req.session.userId == req.params.id) return res.status(400).json({error: "Impossible de se supprimer soi-même"});
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
    if(err) return res.status(500).json({error: err.message});
    db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'DELETE_USER', 'User', req.params.id]);
    res.json({success: true});
  });
});

// ========== ROLES ==========

router.get('/roles', requireAdmin, (req, res) => {
  db.all("SELECT * FROM roles ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/roles', requireAdmin, (req, res) => {
  const { name, permissions } = req.body;
  const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');
  
  db.run("INSERT INTO roles (slug, name, permissions) VALUES (?, ?, ?)", 
    [slug, name, permissions || ''],
    function(err) {
      if (err) return res.status(400).json({ error: "Ce rôle existe déjà" });
      db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'CREATE_ROLE', 'Role', 0]);
      res.json({ slug, name });
    }
  );
});

router.put('/roles/:slug', requireAdmin, (req, res) => {
  const { name, permissions } = req.body;
  const { slug } = req.params;
  db.run("UPDATE roles SET name = ?, permissions = ? WHERE slug = ?", [name, permissions, slug], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'UPDATE_ROLE', 'Role', 0]);
      res.json({ success: true });
  });
});

router.delete('/roles/:slug', requireAdmin, (req, res) => {
  const { slug } = req.params;
  db.run("DELETE FROM roles WHERE slug = ?", [slug], function(err) {
    if(err) return res.status(500).json({error: "Erreur"});
    db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'DELETE_ROLE', 'Role', 0]);
    res.json({success: true});
  });
});


// ========== SECTORS, DEVICES, EQUIPMENT ==========

router.get('/sectors', requireAdmin, (req, res) => db.all("SELECT * FROM sectors ORDER BY name", [], (err, rows) => err ? res.status(500).json({error:err.message}) : res.json(rows)));
router.post('/sectors', requireAdmin, (req, res) => {
  const slug = req.body.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  db.run("INSERT INTO sectors (name, slug) VALUES (?, ?)", [req.body.name, slug], function(err) {
    if(err) return res.status(400).json({error:"Erreur"}); res.json({id:this.lastID});
  });
});
router.delete('/sectors/:id', requireAdmin, (req, res) => db.run("DELETE FROM sectors WHERE id=?", [req.params.id], (err) => err ? res.status(500).json({error:err.message}) : res.json({success:true})));

router.get('/device-types', requireAdmin, (req, res) => db.all("SELECT * FROM device_types ORDER BY name", [], (err, rows) => err ? res.status(500).json({error:err.message}) : res.json(rows)));
router.post('/device-types', requireAdmin, (req, res) => db.run("INSERT INTO device_types (name) VALUES (?)", [req.body.name], function(err) { err ? res.status(400).json({error:"Erreur"}) : res.json({id:this.lastID}); }));
router.delete('/device-types/:id', requireAdmin, (req, res) => db.run("DELETE FROM device_types WHERE id=?", [req.params.id], (err) => err ? res.status(500).json({error:err.message}) : res.json({success:true})));

// MODIFICATION ICI : requireAuth (Pour que les techniciens voient le catalogue équipements)
router.get('/equipment', requireAuth, (req, res) => db.all("SELECT * FROM equipment_catalog ORDER BY name", [], (err, rows) => err ? res.status(500).json({error:err.message}) : res.json(rows)));

router.post('/equipment', requireAdmin, (req, res) => {
  const { name, brand, model, type, device_type } = req.body;
  db.run("INSERT INTO equipment_catalog (name, brand, model, type, device_type) VALUES (?, ?, ?, ?, ?)", [name, brand, model, type, device_type], function(err){ err?res.status(500).json({error:err.message}):res.json({id:this.lastID}); });
});
router.put('/equipment/:id', requireAdmin, (req, res) => {
  const { name, brand, model, type, device_type } = req.body;
  db.run("UPDATE equipment_catalog SET name=?, brand=?, model=?, type=?, device_type=? WHERE id=?", [name, brand, model, type, device_type, req.params.id], (err)=>err?res.status(500).json({error:err.message}):res.json({success:true}));
});
router.delete('/equipment/:id', requireAdmin, (req, res) => db.run("DELETE FROM equipment_catalog WHERE id=?", [req.params.id], (err)=>err?res.status(500).json({error:err.message}):res.json({success:true})));

// ========== MATERIALS ==========

// MODIFICATION ICI : requireAuth (Pour que les techniciens voient le matériel dans les rapports)
router.get('/materials', requireAuth, (req, res) => {
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
  const limit = req.query.limit || 100;
  const category = req.query.category;
  let query = `SELECT l.*, u.name as user_name FROM activity_logs l LEFT JOIN users u ON l.user_id = u.id`;
  let params = [];
  if (category) {
    if (category === 'auth') query += ` WHERE l.action IN ('LOGIN', 'LOGOUT', 'LOGIN_FAIL')`;
    else if (category === 'users') query += ` WHERE l.entity = 'User' OR l.entity = 'Role'`;
    else if (category === 'reports') query += ` WHERE l.entity = 'Report' OR l.entity = 'Client'`;
    else if (category === 'stock') query += ` WHERE l.entity IN ('Material', 'Equipment')`;
  }
  query += ` ORDER BY l.created_at DESC LIMIT ?`;
  params.push(limit);
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;