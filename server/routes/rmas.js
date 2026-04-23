// server/routes/rmas.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Configuration du stockage des fichiers
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'));
    }
});
const upload = multer({ storage: storage });

// 1. RÉCUPÉRER TOUS LES RMA
router.get('/', requireAuth, (req, res) => {
    // Note: On lie l'équipement à "client_equipment" pour avoir le numéro de série
    const sql = `
        SELECT r.*, c.cabinet_name, ec.name as equipment_name, ec.brand, ce.serial_number
        FROM rmas r
        LEFT JOIN clients c ON r.client_id = c.id
        LEFT JOIN client_equipment ce ON r.equipment_id = ce.id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        ORDER BY r.created_at DESC
    `;
    db.all(sql, [], (err, rmas) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all(`SELECT rtl.rma_id, rt.id, rt.name, rt.color FROM rma_tag_links rtl JOIN rma_tags rt ON rtl.tag_id = rt.id`, [], (err, tags) => {
            const rmasWithTags = rmas.map(rma => {
                rma.tags = tags ? tags.filter(t => t.rma_id === rma.id) : [];
                return rma;
            });
            res.json(rmasWithTags);
        });
    });
});

// NOUVEAU : 1.5 RÉCUPÉRER L'ÉQUIPEMENT D'UN CLIENT SPÉCIFIQUE
router.get('/equipment/:clientId', requireAuth, (req, res) => {
    const sql = `
        SELECT ce.id, ec.name, ec.brand, ce.serial_number 
        FROM client_equipment ce 
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id 
        WHERE ce.client_id = ?
    `;
    db.all(sql, [req.params.clientId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. CRÉER UN NOUVEAU RMA (Avec champs optionnels)
router.post('/', requireAuth, (req, res) => {
    const { client_id, description, equipment_id, supplier_name, rma_number, tracking_to_supplier, tracking_from_supplier } = req.body;
    const userId = (req.user && req.user.id) ? req.user.id : (req.userId ? req.userId : (req.session ? req.session.userId : null));

    const sql = `INSERT INTO rmas (client_id, equipment_id, supplier_name, rma_number, tracking_to_supplier, tracking_from_supplier, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        client_id, 
        equipment_id || null, 
        supplier_name || 'Xion', 
        rma_number || null, 
        tracking_to_supplier || null, 
        tracking_from_supplier || null, 
        description, 
        userId
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// --- 3. METTRE À JOUR LE STATUT SEUL (Glisser-Déposer du Kanban) ---
router.put('/:id/status', requireAuth, (req, res) => {
    const { status } = req.body;
    db.run("UPDATE rmas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- 4. METTRE À JOUR TOUTES LES INFOS (Modale d'édition) ---
router.put('/:id', requireAuth, (req, res) => {
    console.log(`\n--- TENTATIVE DE MODIFICATION DU RMA #${req.params.id} ---`);
    console.log("Données reçues du navigateur :", req.body);

    const { 
        title, status, client_id, equipment_id, supplier_name, 
        rma_number, tracking_to_supplier, tracking_from_supplier, description 
    } = req.body;

    // Protection stricte contre les chaînes vides qui font planter SQLite
    const safeTitle = title?.trim() || null;
    const safeEquipment = equipment_id?.toString().trim() || null;
    const safeRmaNumber = rma_number?.trim() || null;
    const safeTrackTo = tracking_to_supplier?.trim() || null;
    const safeTrackFrom = tracking_from_supplier?.trim() || null;

    const sql = `
        UPDATE rmas SET 
            title = ?, status = ?, client_id = ?, equipment_id = ?, 
            supplier_name = ?, rma_number = ?, tracking_to_supplier = ?, 
            tracking_from_supplier = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?`;
    
    const params = [
        safeTitle, status, client_id, safeEquipment, supplier_name, 
        safeRmaNumber, safeTrackTo, safeTrackFrom, description, 
        req.params.id
    ];

    db.run(sql, params, function(err) {
        if (err) {
            console.error("🔴 ERREUR SQL EXACTE :", err.message);
            return res.status(500).json({ error: err.message });
        }
        console.log("✅ RMA modifié avec succès !");
        res.json({ success: true });
    });
});

// 4. RÉCUPÉRER LES DÉTAILS COMPLETS D'UN RMA
router.get('/:id', requireAuth, (req, res) => {
    const rmaId = req.params.id;
    const sql = `
        SELECT r.*, c.cabinet_name, ec.name as equipment_name, ec.brand, ce.serial_number 
        FROM rmas r 
        LEFT JOIN clients c ON r.client_id = c.id 
        LEFT JOIN client_equipment ce ON r.equipment_id = ce.id 
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id 
        WHERE r.id = ?
    `;
    db.get(sql, [rmaId], (err, rma) => {
        if (err || !rma) return res.status(404).json({ error: "RMA introuvable" });

        db.all(`SELECT * FROM rma_tags rt JOIN rma_tag_links rtl ON rt.id = rtl.tag_id WHERE rtl.rma_id = ?`, [rmaId], (err, tags) => {
            rma.tags = tags || [];
            db.all(`SELECT rc.*, u.name as user_name FROM rma_comments rc JOIN users u ON rc.user_id = u.id WHERE rc.rma_id = ? ORDER BY rc.created_at ASC`, [rmaId], (err, comments) => {
                rma.comments = comments || [];
                // NOUVEAU : Récupération des pièces jointes
                db.all(`SELECT * FROM rma_attachments WHERE rma_id = ? ORDER BY created_at DESC`, [rmaId], (err, attachments) => {
                    rma.attachments = attachments || [];
                    res.json(rma);
                });
            });
        });
    });
});

// 5. AJOUTER UN COMMENTAIRE HORODATÉ
router.post('/:id/comments', requireAuth, (req, res) => {
    const { comment } = req.body;
    const userId = (req.user && req.user.id) ? req.user.id : (req.userId ? req.userId : (req.session ? req.session.userId : null));
    db.run("INSERT INTO rma_comments (rma_id, user_id, comment) VALUES (?, ?, ?)", [req.params.id, userId, comment], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 6. SUPPRIMER UN RMA
router.delete('/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM rmas WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ==========================================
// --- ROUTES POUR LES ÉTIQUETTES (TAGS) ---
// ==========================================

// 1. Récupérer tous les tags du catalogue
router.get('/tags/all', requireAuth, (req, res) => {
    db.all("SELECT * FROM rma_tags ORDER BY name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Créer un nouveau tag dans le catalogue
router.post('/tags', requireAuth, (req, res) => {
    const { name, color } = req.body;
    db.run("INSERT INTO rma_tags (name, color) VALUES (?, ?)", [name, color || '#3b82f6'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID, name, color });
    });
});

// 3. Supprimer DÉFINITIVEMENT un tag du catalogue (et de tous les RMAs)
router.delete('/tags/:tagId/global', requireAuth, (req, res) => {
    db.run("DELETE FROM rma_tags WHERE id = ?", [req.params.tagId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 4. Assigner un tag existant à un RMA
router.post('/:id/tags', requireAuth, (req, res) => {
    const { tag_id } = req.body;
    db.run("INSERT OR IGNORE INTO rma_tag_links (rma_id, tag_id) VALUES (?, ?)", [req.params.id, tag_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 5. Retirer un tag d'un RMA (La petite croix sur la carte)
router.delete('/:id/tags/:tagId', requireAuth, (req, res) => {
    db.run("DELETE FROM rma_tag_links WHERE rma_id = ? AND tag_id = ?", [req.params.id, req.params.tagId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- 10. PIÈCES JOINTES (Upload et Suppression) ---
router.post('/:id/attachments', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });

    const filePath = `/uploads/${req.file.filename}`;
    db.run("INSERT INTO rma_attachments (rma_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)", 
        [req.params.id, req.file.originalname, filePath, req.file.mimetype], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

router.delete('/attachments/:attachmentId', requireAuth, (req, res) => {
    // 1. Trouver le chemin du fichier pour le supprimer du disque dur
    db.get("SELECT file_path FROM rma_attachments WHERE id = ?", [req.params.attachmentId], (err, row) => {
        if (row && fs.existsSync('.' + row.file_path)) {
            fs.unlinkSync('.' + row.file_path); // Supprime le fichier physique
        }
        // 2. Supprimer l'entrée de la base de données
        db.run("DELETE FROM rma_attachments WHERE id = ?", [req.params.attachmentId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// CETTE LIGNE DOIT TOUJOURS ÊTRE LA DERNIÈRE DU FICHIER :
module.exports = router;