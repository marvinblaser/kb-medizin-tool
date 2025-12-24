// server/routes/reports.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// --- HELPER : Gestion des Logs ---
const logActivity = (userId, action, entity, entityId, meta = {}) => {
  db.run(
    "INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)",
    [userId, action, entity, entityId, JSON.stringify(meta)],
    (err) => { if (err) console.error("Erreur Log:", err.message); }
  );
};

const getUserRole = (userId) => {
    return new Promise((resolve) => {
        db.get("SELECT role FROM users WHERE id = ?", [userId], (err, row) => resolve(row ? row.role : null));
    });
};

// --- STATISTIQUES ---
router.get('/stats', requireAuth, (req, res) => {
    const sql = `SELECT status, COUNT(*) as count FROM reports GROUP BY status`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Erreur Stats:", err.message);
            return res.status(500).json({ error: err.message });
        }
        const stats = { draft: 0, pending: 0, validated: 0, archived: 0 };
        // Sécurité si rows est vide
        if (rows) {
            rows.forEach(r => { 
                // On gère le cas où status serait null
                const s = r.status || 'draft';
                if (stats[s] !== undefined) stats[s] = r.count; 
            });
        }
        res.json(stats);
    });
});

// --- LISTE DES RAPPORTS (CORRIGÉE & SÉCURISÉE) ---
router.get('/', requireAuth, (req, res) => {
    const { page = 1, limit = 25, search, type, status, client_id } = req.query;
    const limitVal = client_id ? 200 : parseInt(limit); 
    const offset = (page - 1) * limitVal;
    
    let where = ["1=1"];
    let params = [];

    if (search) {
        where.push(`(r.cabinet_name LIKE ? OR r.city LIKE ? OR r.report_number LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s);
    }
    if (type) { where.push("r.work_type = ?"); params.push(type); }
    if (status) { where.push("r.status = ?"); params.push(status); }
    if (client_id) { where.push("r.client_id = ?"); params.push(client_id); }

    // VERSION SÉCURISÉE (Sans updated_at)
    const sql = `
        SELECT r.*, 
        COALESCE(u.name, 'Non défini') as validator_name,
        COALESCE(a.name, 'Non défini') as author_name,
        -- On utilise created_at comme secours car updated_at n'existe pas
        COALESCE(r.archived_at, r.created_at) as archived_at_safe,
        COALESCE(r.validated_at, r.created_at) as validated_at_safe
        FROM reports r 
        LEFT JOIN users u ON r.validator_id = u.id
        LEFT JOIN users a ON r.author_id = a.id
        WHERE ${where.join(' AND ')} 
        ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;

    const countSql = `SELECT count(*) as count FROM reports r WHERE ${where.join(' AND ')}`;

    db.get(countSql, params, (err, countRow) => {
        if (err) {
            console.error("Erreur Count Reports:", err.message);
            return res.status(500).json({ error: "Erreur DB Count" });
        }
        
        db.all(sql, [...params, limitVal, offset], (err, rows) => {
            if (err) {
                console.error("Erreur List Reports:", err.message);
                return res.status(500).json({ error: err.message });
            }
            
            res.json({ 
                reports: rows, 
                pagination: { 
                    page: parseInt(page), 
                    totalPages: Math.ceil((countRow?.count || 0) / limitVal), 
                    totalItems: countRow?.count || 0 
                } 
            });
        });
    });
});

// --- DÉTAIL D'UN RAPPORT ---
router.get('/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    // Ici aussi on sécurise les noms
    const sql = `
        SELECT r.*, 
        COALESCE(u.name, '') as validator_name, 
        COALESCE(a.name, '') as author_name 
        FROM reports r 
        LEFT JOIN users u ON r.validator_id = u.id 
        LEFT JOIN users a ON r.author_id = a.id
        WHERE r.id = ?`;
        
    db.get(sql, [id], async (err, report) => {
        if (err || !report) return res.status(404).json({ error: "Introuvable" });

        try {
            const safeGet = (query) => new Promise(resolve => db.all(query, [id], (e, r) => resolve(e ? [] : r)));
            
            const [techs, stks, mats, eqs] = await Promise.all([
                safeGet("SELECT * FROM report_technicians WHERE report_id = ?"),
                safeGet("SELECT * FROM report_stk_tests WHERE report_id = ?"),
                safeGet("SELECT * FROM report_materials WHERE report_id = ?"),
                safeGet("SELECT equipment_id FROM report_equipment WHERE report_id = ?")
            ]);

            report.technicians = techs; 
            report.stk_tests = stks; 
            report.materials = mats;
            // On s'assure que equipment_ids est un tableau propre
            report.equipment_ids = eqs.map(e => e.equipment_id).filter(id => id != null);
            
            res.json(report);
        } catch (e) {
            console.error("Erreur Detail Rapport:", e);
            res.status(500).json({ error: "Erreur chargement détails" });
        }
    });
});

// --- CHANGEMENT DE STATUT ---
router.patch('/:id/status', requireAuth, async (req, res) => {
    const { status, reason } = req.body;
    const userId = req.session.userId;
    const role = await getUserRole(userId);
    
    if (status === 'validated' && !['admin', 'validator', 'sales_director'].includes(role)) return res.status(403).json({ error: "Permission refusée." });
    if (status === 'draft' && reason && !['admin', 'validator', 'sales_director'].includes(role)) return res.status(403).json({ error: "Permission refusée." });
    if (status === 'archived' && !['admin', 'secretary'].includes(role)) return res.status(403).json({ error: "Permission refusée." });

    let sql = "UPDATE reports SET status = ?";
    let params = [status];

    if (status === 'validated') {
        sql += ", validator_id = ?, validated_at = datetime('now'), rejection_reason = NULL";
        params.push(userId);
    } else if (status === 'draft' && reason) {
        sql += ", rejection_reason = ?";
        params.push(reason);
    } else if (status === 'archived') {
        sql += ", archived_at = datetime('now')";
    }
    sql += " WHERE id = ?"; params.push(req.params.id);

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(userId, 'update_status', 'report', req.params.id, { status, reason });
        res.json({ success: true, status });
    });
});

// --- CRÉATION / MODIFICATION ---
router.post('/', requireAuth, (req, res) => saveReportData(req, res));

router.put('/:id', requireAuth, async (req, res) => {
    const role = await getUserRole(req.session.userId);
    db.get("SELECT status FROM reports WHERE id = ?", [req.params.id], (err, row) => {
        if(err || !row) return res.status(404).json({error: "Rapport introuvable"});
        if (row.status === 'archived' && role !== 'admin') return res.status(403).json({ error: "Archivé : modification interdite." });
        if (row.status === 'validated' && !['admin', 'secretary'].includes(role)) return res.status(403).json({ error: "Validé : modification interdite." });
        
        saveReportData(req, res, req.params.id);
    });
});

const saveReportData = (req, res, reportId = null) => {
    // On met des valeurs par défaut pour éviter les erreurs SQL sur les champs manquants
    const { 
        client_id, language = 'fr', work_type, status, cabinet_name, address, postal_code, city, interlocutor, 
        installation, remarks, travel_costs = 0, travel_included = 0, travel_location, 
        technician_signature_date, work_accomplished, technicians, stk_tests, materials, equipment_ids 
    } = req.body;
    
    const currentStatus = reportId ? (status || 'draft') : 'draft';
    const userId = req.session.userId;

    const reportData = [client_id, language, work_type, currentStatus, cabinet_name, address, postal_code, city, interlocutor, installation, remarks, travel_costs, travel_included?1:0, travel_location, technician_signature_date, work_accomplished];
    
    let runQuery = "";
    if (reportId) {
        runQuery = `UPDATE reports SET client_id=?, language=?, work_type=?, status=?, cabinet_name=?, address=?, postal_code=?, city=?, interlocutor=?, installation=?, remarks=?, travel_costs=?, travel_included=?, travel_location=?, technician_signature_date=?, work_accomplished=? WHERE id=?`;
        reportData.push(reportId);
    } else {
        runQuery = `INSERT INTO reports (client_id, language, work_type, status, cabinet_name, address, postal_code, city, interlocutor, installation, remarks, travel_costs, travel_included, travel_location, technician_signature_date, work_accomplished, author_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
        reportData.push(userId);
    }

    db.run(runQuery, reportData, function(err) {
        if (err) {
            console.error("Erreur Save Report:", err.message);
            return res.status(500).json({ error: err.message });
        }
        const finalId = reportId || this.lastID;

        logActivity(userId, reportId ? 'update' : 'create', 'report', finalId, { cabinet_name, work_type });

        db.serialize(() => {
            ['report_technicians', 'report_stk_tests', 'report_materials', 'report_equipment'].forEach(t => db.run(`DELETE FROM ${t} WHERE report_id=?`, [finalId]));
            
            if (technicians && technicians.length) { 
                const stmt = db.prepare("INSERT INTO report_technicians (report_id, technician_id, technician_name, work_date, hours_normal, hours_extra) VALUES (?,?,?,?,?,?)"); 
                technicians.forEach(t => stmt.run(finalId, t.technician_id, t.technician_name, t.work_date, t.hours_normal, t.hours_extra)); 
                stmt.finalize(); 
            }
            if (stk_tests && stk_tests.length) { 
                const stmt = db.prepare("INSERT INTO report_stk_tests (report_id, test_name, price, included) VALUES (?,?,?,?)"); 
                stk_tests.forEach(t => stmt.run(finalId, t.test_name, t.price, t.included?1:0)); 
                stmt.finalize(); 
            }
            if (materials && materials.length) { 
                const stmt = db.prepare("INSERT INTO report_materials (report_id, material_id, material_name, product_code, quantity, unit_price, discount, total_price) VALUES (?,?,?,?,?,?,?,?)"); 
                materials.forEach(m => stmt.run(finalId, m.material_id, m.material_name, m.product_code, m.quantity, m.unit_price, m.discount||0, m.total_price)); 
                stmt.finalize(); 
            }
            if (equipment_ids && equipment_ids.length) { 
                const stmt = db.prepare("INSERT INTO report_equipment (report_id, equipment_id) VALUES (?,?)"); 
                equipment_ids.forEach(eid => stmt.run(finalId, eid)); 
                stmt.finalize(); 
            }
            if (!reportId) { 
                const reportNumber = `${new Date().getFullYear()}-${String(finalId).padStart(4, '0')}`; 
                db.run("UPDATE reports SET report_number = ? WHERE id = ?", [reportNumber, finalId]); 
            }
        });
        res.json({ success: true, id: finalId });
    });
};

// --- SUPPRESSION ---
router.delete('/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    // On supprime directement sans vérifier le statut "draft"
    db.run("DELETE FROM reports WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        // On log l'action
        logActivity(req.session.userId, 'delete', 'report', id);
        res.json({ success: true });
    });
});

module.exports = router;