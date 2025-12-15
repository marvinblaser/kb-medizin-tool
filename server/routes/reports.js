// server/routes/reports.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// === GET ALL (Liste des rapports) ===
router.get('/', requireAuth, (req, res) => {
    const { page = 1, limit = 25, search, type, status } = req.query;
    const offset = (page - 1) * limit;
    let where = ["1=1"];
    let params = [];

    if (search) {
        where.push(`(r.cabinet_name LIKE ? OR r.city LIKE ? OR r.report_number LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s);
    }
    if (type) { where.push("r.work_type = ?"); params.push(type); }
    if (status) { where.push("r.status = ?"); params.push(status); }

    try {
        // On essaie d'abord la requête complète avec le compteur de techniciens
        const sql = `
            SELECT r.*, 
            (SELECT COUNT(*) FROM report_technicians rt WHERE rt.report_id = r.id) as technicians_count 
            FROM reports r 
            WHERE ${where.join(' AND ')} 
            ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;

        const countSql = `SELECT count(*) as count FROM reports r WHERE ${where.join(' AND ')}`;

        db.get(countSql, params, (err, countRow) => {
            if (err) {
                console.error("⚠️ Erreur SQL Count:", err.message);
                return res.status(500).json({ error: "Erreur base de données (Count)" });
            }

            db.all(sql, [...params, limit, offset], (err, rows) => {
                if (err) {
                    // Si l'erreur vient de la table report_technicians qui manque, on fait un fallback
                    if (err.message.includes('no such table')) {
                         console.warn("⚠️ Table report_technicians manquante. Chargement simplifié.");
                         const simpleSql = `SELECT * FROM reports r WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
                         db.all(simpleSql, [...params, limit, offset], (err2, rows2) => {
                             if(err2) return res.status(500).json({ error: err2.message });
                             res.json({ reports: rows2, pagination: { page: parseInt(page), totalPages: Math.ceil(countRow.count / limit), totalItems: countRow.count } });
                         });
                         return;
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ reports: rows, pagination: { page: parseInt(page), totalPages: Math.ceil(countRow.count / limit), totalItems: countRow.count } });
            });
        });
    } catch (e) {
        console.error("CRASH ROUTE GET /:", e);
        res.status(500).json({ error: "Erreur serveur critique" });
    }
});

// === GET ONE (Chargement d'un rapport spécifique) ===
router.get('/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    console.log(`Chargement rapport ID: ${id}...`);

    db.get("SELECT * FROM reports WHERE id = ?", [id], async (err, report) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!report) return res.status(404).json({ error: "Rapport introuvable" });

        // Fonction helper : essaie de charger une liste, renvoie vide si erreur (table manquante)
        const safeGet = (sql, logName) => {
            return new Promise((resolve) => {
                db.all(sql, [id], (e, rows) => {
                    if (e) {
                        console.error(`⚠️ Impossible de charger ${logName}: ${e.message}`);
                        resolve([]); // On renvoie un tableau vide pour ne pas planter
                    } else {
                        resolve(rows);
                    }
                });
            });
        };

        // Chargement parallèle sécurisé
        const [techs, stks, mats, eqs] = await Promise.all([
            safeGet("SELECT * FROM report_technicians WHERE report_id = ?", "Techniciens"),
            safeGet("SELECT * FROM report_stk_tests WHERE report_id = ?", "Tests STK"),
            safeGet("SELECT * FROM report_materials WHERE report_id = ?", "Matériel"),
            safeGet("SELECT equipment_id FROM report_equipment WHERE report_id = ?", "Équipements liés")
        ]);

        report.technicians = techs;
        report.stk_tests = stks;
        report.materials = mats;
        report.equipment_ids = eqs.map(e => e.equipment_id); // Format simple [1, 5, 8]

        res.json(report);
    });
});

// === SAVE DATA (Fonction commune CREATE / UPDATE) ===
const saveReportData = (req, res, reportId = null) => {
    const { 
        client_id, work_type, status, cabinet_name, address, postal_code, city, interlocutor, 
        installation, remarks, travel_costs, travel_included, travel_location, 
        technician_signature_date, work_accomplished,
        technicians, stk_tests, materials, equipment_ids 
    } = req.body;

    const reportData = [
        client_id, work_type, status, cabinet_name, address, postal_code, city, interlocutor, 
        installation, remarks, travel_costs, travel_included ? 1 : 0, travel_location, 
        technician_signature_date, work_accomplished
    ];

    const runQuery = reportId 
        ? `UPDATE reports SET client_id=?, work_type=?, status=?, cabinet_name=?, address=?, postal_code=?, city=?, interlocutor=?, installation=?, remarks=?, travel_costs=?, travel_included=?, travel_location=?, technician_signature_date=?, work_accomplished=? WHERE id=?`
        : `INSERT INTO reports (client_id, work_type, status, cabinet_name, address, postal_code, city, interlocutor, installation, remarks, travel_costs, travel_included, travel_location, technician_signature_date, work_accomplished) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

    if (reportId) reportData.push(reportId);

    db.run(runQuery, reportData, function(err) {
        if (err) {
            console.error("❌ Erreur SQL Save Report:", err.message);
            return res.status(500).json({ error: "Erreur sauvegarde rapport: " + err.message });
        }
        
        const finalId = reportId || this.lastID;

        // Mise à jour des tables liées (Delete All + Insert New)
        db.serialize(() => {
            
            // 1. TECHNICIENS
            db.run("DELETE FROM report_technicians WHERE report_id=?", [finalId], (e) => { if(e) console.error("Err Delete Techs:", e.message); });
            if (technicians && technicians.length > 0) {
                const stmt = db.prepare("INSERT INTO report_technicians (report_id, technician_id, technician_name, work_date, hours_normal, hours_extra) VALUES (?,?,?,?,?,?)");
                technicians.forEach(t => {
                    stmt.run(finalId, t.technician_id, t.technician_name, t.work_date, t.hours_normal, t.hours_extra, (e) => {
                        if(e) console.error("Err Insert Tech:", e.message);
                    });
                });
                stmt.finalize();
            }

            // 2. TESTS STK
            db.run("DELETE FROM report_stk_tests WHERE report_id=?", [finalId], (e) => { if(e) console.error("Err Delete STK:", e.message); });
            if (stk_tests && stk_tests.length > 0) {
                const stmt = db.prepare("INSERT INTO report_stk_tests (report_id, test_name, price, included) VALUES (?,?,?,?)");
                stk_tests.forEach(t => {
                    stmt.run(finalId, t.test_name, t.price, t.included ? 1 : 0, (e) => {
                        if(e) console.error("Err Insert STK:", e.message);
                    });
                });
                stmt.finalize();
            }

            // 3. MATÉRIEL
            db.run("DELETE FROM report_materials WHERE report_id=?", [finalId], (e) => { if(e) console.error("Err Delete Mats:", e.message); });
            if (materials && materials.length > 0) {
                // MODIFICATION ICI : Ajout de la colonne 'discount'
                const stmt = db.prepare("INSERT INTO report_materials (report_id, material_id, material_name, product_code, quantity, unit_price, discount, total_price) VALUES (?,?,?,?,?,?,?,?)");
                materials.forEach(m => {
                    // MODIFICATION ICI : Ajout de m.discount dans les valeurs
                    stmt.run(finalId, m.material_id, m.material_name, m.product_code, m.quantity, m.unit_price, m.discount || 0, m.total_price, (e) => {
                        if(e) console.error("Err Insert Mat:", e.message);
                    });
                });
                stmt.finalize();
            }

            // 4. ÉQUIPEMENTS (CASES COCHÉES)
            db.run("DELETE FROM report_equipment WHERE report_id=?", [finalId], (e) => { if(e) console.error("Err Delete Eqs:", e.message); });
            if (equipment_ids && equipment_ids.length > 0) {
                const stmt = db.prepare("INSERT INTO report_equipment (report_id, equipment_id) VALUES (?,?)");
                equipment_ids.forEach(eid => {
                    stmt.run(finalId, eid, (e) => {
                        if(e) console.error("Err Insert Eq:", e.message);
                    });
                });
                stmt.finalize();
            }

            // Mise à jour du numéro de rapport si c'est une création
            if (!reportId) {
                const reportNumber = `${new Date().getFullYear()}-${String(finalId).padStart(4, '0')}`;
                db.run("UPDATE reports SET report_number = ? WHERE id = ?", [reportNumber, finalId]);
            }
        });

        res.json({ success: true, id: finalId });
    });
};

router.post('/', requireAuth, (req, res) => saveReportData(req, res));
router.put('/:id', requireAuth, (req, res) => saveReportData(req, res, req.params.id));

// === DELETE ===
router.delete('/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM reports WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;