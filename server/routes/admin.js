// server/routes/admin.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx'); 
const { db } = require('../config/database');
const { requireAdmin, requireAuth } = require('../middleware/auth');

// --- CONFIG MULTER ---
const storageAvatar = multer.diskStorage({
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
const uploadAvatar = multer({ 
  storage: storageAvatar,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Images uniquement'));
  }
});
const uploadFile = multer({ storage: multer.memoryStorage() });

// --- FONCTION NETTOYAGE PRIX ---
const parsePrice = (raw) => {
    if (raw === null || raw === undefined || raw === '') return 0;
    let str = String(raw).trim();
    if (str.includes(',')) {
        str = str.replace(/\./g, '');
        str = str.replace(',', '.');
    } 
    str = str.replace(/[^0-9.-]/g, '');
    const val = parseFloat(str);
    return isNaN(val) ? 0 : Math.round(val * 100) / 100;
};

// ==========================================
//               MATERIALS
// ==========================================

router.delete('/materials/all', requireAdmin, (req, res) => {
    db.serialize(() => {
        db.run("DELETE FROM materials");
        db.run("DELETE FROM sqlite_sequence WHERE name='materials'");
        db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'DELETE_ALL_MATERIALS', 'Material', 0]);
        res.json({ success: true, message: "Tout le matériel a été supprimé." });
    });
});

router.post('/materials/import', requireAdmin, uploadFile.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni" });
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
        if (!data || data.length === 0) return res.json({ success: true, count: 0 });

        db.serialize(() => {
            let successCount = 0;
            const checkStmt = db.prepare("SELECT id FROM materials WHERE product_code = ?");
            const updateStmt = db.prepare("UPDATE materials SET name = ?, unit_price = ? WHERE id = ?");
            const insertStmt = db.prepare("INSERT INTO materials (product_code, name, unit_price) VALUES (?, ?, ?)");

            data.forEach((row, index) => {
                const normalized = {};
                Object.keys(row).forEach(k => normalized[k.trim().toLowerCase()] = row[k]);
                const code = normalized['code produit'] || normalized['code'] || normalized['product_code'];
                const designation = normalized['désignation'] || normalized['designation'] || normalized['nom'] || normalized['name'];
                const priceRaw = normalized['prix'] || normalized['price'] || normalized['unit_price'];

                if (code && designation) {
                    const price = parsePrice(priceRaw);
                    checkStmt.get(String(code), (err, existingRow) => {
                        if (!err) {
                            if (existingRow) updateStmt.run(String(designation), price, existingRow.id);
                            else insertStmt.run(String(code), String(designation), price);
                        }
                    });
                    successCount++;
                }
            });
            setTimeout(() => {
                checkStmt.finalize(); updateStmt.finalize(); insertStmt.finalize();
                db.run("INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)", [req.session.userId, 'IMPORT_MATERIALS', 'Material', 0]);
                res.json({ success: true, count: successCount });
            }, 1000);
        });
    } catch (error) { res.status(500).json({ error: "Erreur lecture fichier" }); }
});

router.get('/materials', requireAuth, (req, res) => db.all("SELECT * FROM materials ORDER BY name", [], (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows)));
router.post('/materials', requireAdmin, (req, res) => { const { name, product_code, unit_price } = req.body; const cleanPrice = parsePrice(unit_price); db.run("INSERT INTO materials (name, product_code, unit_price) VALUES (?, ?, ?)", [name, product_code, cleanPrice], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ id: this.lastID }); }); });
router.put('/materials/:id', requireAdmin, (req, res) => { const { name, product_code, unit_price } = req.body; const cleanPrice = parsePrice(unit_price); db.run("UPDATE materials SET name=?, product_code=?, unit_price=? WHERE id=?", [name, product_code, cleanPrice, req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });
router.delete('/materials/:id', requireAdmin, (req, res) => { db.run("DELETE FROM materials WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });

// ==========================================
//               AUTRES ROUTES
// ==========================================
router.get('/users', requireAuth, (req, res) => db.all("SELECT id, email, role, name, phone, photo_url, is_active, last_login_at FROM users ORDER BY name", [], (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows)));
router.post('/users', requireAdmin, uploadAvatar.single('photo'), async (req, res) => { const { email, password, role, name, phone, is_active } = req.body; const photo_url = req.file ? `/uploads/avatars/${req.file.filename}` : null; try { const hash = await bcrypt.hash(password, 10); db.run("INSERT INTO users (email, password_hash, role, name, phone, photo_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)", [email, hash, role, name, phone, photo_url, is_active], function(err) { if (err) return res.status(400).json({ error: err.message.includes('UNIQUE') ? "Email déjà utilisé" : "Erreur BDD" }); res.json({ id: this.lastID }); }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/users/:id', requireAdmin, uploadAvatar.single('photo'), (req, res) => { const { role, name, phone, is_active, email } = req.body; let sql="UPDATE users SET role=?, name=?, phone=?, is_active=?, email=?"; let params=[role, name, phone, is_active, email]; if(req.file){sql+=", photo_url=?"; params.push(`/uploads/avatars/${req.file.filename}`);} sql+=" WHERE id=?"; params.push(req.params.id); db.run(sql, params, (err)=>err?res.status(500).json({error:err.message}):res.json({success:true})); });
router.post('/users/:id/reset-password', requireAdmin, async (req, res) => { const { password } = req.body; if(!password||password.length<6)return res.status(400).json({error:"Trop court"}); try{const hash=await bcrypt.hash(password, 10); db.run("UPDATE users SET password_hash=? WHERE id=?", [hash, req.params.id], (err)=>err?res.status(500).json({error:err.message}):res.json({success:true}));}catch(e){res.status(500).json({error:e.message});} });
router.delete('/users/:id', requireAdmin, (req, res) => { if(req.session.userId==req.params.id)return res.status(400).json({error:"Impossible"}); db.run("DELETE FROM users WHERE id=?",[req.params.id],(err)=>err?res.status(500).json({error:err.message}):res.json({success:true})); });
router.get('/roles', requireAdmin, (req, res) => db.all("SELECT * FROM roles ORDER BY name", [], (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows)));
router.post('/roles', requireAdmin, (req, res) => { const { name, permissions } = req.body; const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_'); db.run("INSERT INTO roles (slug, name, permissions) VALUES (?, ?, ?)", [slug, name, permissions || ''], (err) => err ? res.status(400).json({error:"Existe déjà"}) : res.json({slug, name})); });
router.put('/roles/:slug', requireAdmin, (req, res) => { const { name, permissions } = req.body; db.run("UPDATE roles SET name=?, permissions=? WHERE slug=?", [name, permissions, req.params.slug], (err) => err ? res.status(500).json({error:err.message}) : res.json({success:true})); });
router.delete('/roles/:slug', requireAdmin, (req, res) => db.run("DELETE FROM roles WHERE slug=?", [req.params.slug], (err) => err ? res.status(500).json({error:"Erreur"}) : res.json({success:true})));
router.get('/sectors', requireAdmin, (req, res) => db.all("SELECT * FROM sectors ORDER BY name", [], (err, rows) => err ? res.status(500).json({error:err.message}) : res.json(rows)));
router.post('/sectors', requireAdmin, (req, res) => { const slug = req.body.name.toLowerCase().replace(/[^a-z0-9]/g, ''); db.run("INSERT INTO sectors (name, slug) VALUES (?, ?)", [req.body.name, slug], function(err) { if(err) return res.status(400).json({error:"Erreur"}); res.json({id:this.lastID}); }); });
router.delete('/sectors/:id', requireAdmin, (req, res) => db.run("DELETE FROM sectors WHERE id=?", [req.params.id], (err) => err ? res.status(500).json({error:err.message}) : res.json({success:true})));
router.get('/device-types', requireAdmin, (req, res) => db.all("SELECT * FROM device_types ORDER BY name", [], (err, rows) => err ? res.status(500).json({error:err.message}) : res.json(rows)));
router.post('/device-types', requireAdmin, (req, res) => db.run("INSERT INTO device_types (name) VALUES (?)", [req.body.name], function(err) { err ? res.status(400).json({error:"Erreur"}) : res.json({id:this.lastID}); }));
router.delete('/device-types/:id', requireAdmin, (req, res) => db.run("DELETE FROM device_types WHERE id=?", [req.params.id], (err) => err ? res.status(500).json({error:err.message}) : res.json({success:true})));

// --- EQUIPEMENTS : AJOUT DE NAME_DE ---
router.get('/equipment', requireAuth, (req, res) => db.all("SELECT * FROM equipment_catalog ORDER BY name", [], (err, rows) => err ? res.status(500).json({error:err.message}) : res.json(rows)));

router.post('/equipment', requireAdmin, (req, res) => { 
    // On ajoute name_de
    const { name, name_de, brand, model, type, device_type, is_secondary } = req.body; 
    const secVal = is_secondary ? 1 : 0;
    
    db.run("INSERT INTO equipment_catalog (name, name_de, brand, model, type, device_type, is_secondary) VALUES (?, ?, ?, ?, ?, ?, ?)", 
    [name, name_de, brand, model, type, device_type, secVal], function(err){ 
        if(err) return res.status(500).json({error:err.message}); 
        res.json({id:this.lastID}); 
    }); 
});

router.put('/equipment/:id', requireAdmin, (req, res) => { 
    // On ajoute name_de
    const { name, name_de, brand, model, type, device_type, is_secondary } = req.body; 
    const secVal = is_secondary ? 1 : 0;
    
    db.run("UPDATE equipment_catalog SET name=?, name_de=?, brand=?, model=?, type=?, device_type=?, is_secondary=? WHERE id=?", 
    [name, name_de, brand, model, type, device_type, secVal, req.params.id], 
    (err)=>err?res.status(500).json({error:err.message}):res.json({success:true})); 
});

router.delete('/equipment/:id', requireAdmin, (req, res) => db.run("DELETE FROM equipment_catalog WHERE id=?", [req.params.id], (err)=>err?res.status(500).json({error:err.message}):res.json({success:true})));

router.get('/export/clients', requireAdmin, (req, res) => {
    const sql = `SELECT c.*, ce.serial_number, ec.name as equip_name, ec.brand as equip_brand FROM clients c LEFT JOIN client_equipment ce ON c.id=ce.client_id LEFT JOIN equipment_catalog ec ON ce.equipment_id=ec.id ORDER BY c.cabinet_name`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).send("Erreur");
        const clientsMap = {};
        rows.forEach(row => { if (!clientsMap[row.id]) clientsMap[row.id] = { ...row, "Machines": [] }; if (row.equip_name) clientsMap[row.id].Machines.push(`${row.equip_brand} ${row.equip_name} [${row.serial_number}]`); });
        const exportData = Object.values(clientsMap).map(c => ({ "Cabinet": c.cabinet_name, "Ville": c.city, "Machines": c.Machines.join('\n') }));
        const wb = xlsx.utils.book_new(); const ws = xlsx.utils.json_to_sheet(exportData); ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 60 }];
        xlsx.utils.book_append_sheet(wb, ws, "Clients");
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    });
});

router.get('/logs', requireAdmin, (req, res) => {
  const limit = req.query.limit || 100; const category = req.query.category;
  let query = `SELECT l.*, u.name as user_name FROM activity_logs l LEFT JOIN users u ON l.user_id = u.id`; let params = [];
  if (category && category !== 'all') { if (category === 'auth') query += ` WHERE l.action IN ('LOGIN', 'LOGOUT', 'LOGIN_FAIL')`; else if (category === 'users') query += ` WHERE l.entity IN ('User', 'Role')`; else if (category === 'reports') query += ` WHERE l.entity IN ('Report', 'Client')`; }
  query += ` ORDER BY l.created_at DESC LIMIT ?`; params.push(limit); db.all(query, params, (err, rows) => err ? res.status(500).json({error:err.message}) : res.json(rows));
});

module.exports = router;