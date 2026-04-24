// server/routes/reports.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// --- UTILITAIRES ASYNC ---
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// --- LOGS ---
const logActivity = (userId, action, entity, entityId, meta = {}) => {
  db.run(
    "INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)",
    [userId, action, entity, entityId, JSON.stringify(meta)],
    (err) => { if (err) console.error("Erreur Log:", err.message); }
  );
};

// --- NOTIFICATIONS ---
const notifyUser = (userId, type, message, link) => {
    db.run("INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)", 
        [userId, type, message, link], 
        (err) => { if(err) console.error("Erreur Notif User:", err.message); }
    );
};

const notifyRoles = (rolesArray, type, message, link) => {
    const placeholders = rolesArray.map(() => '?').join(',');
    db.all(`SELECT id FROM users WHERE role IN (${placeholders})`, rolesArray, (err, rows) => {
        if(err) return console.error("Erreur Notif Roles:", err.message);
        rows.forEach(u => {
            notifyUser(u.id, type, message, link);
        });
    });
};

const getUserRole = (userId) => {
    return get("SELECT role FROM users WHERE id = ?", [userId]).then(row => row ? row.role : null);
};

// --- ROUTES ---

// STATS
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const rows = await all(`SELECT status, COUNT(*) as count FROM reports GROUP BY status`);
        const stats = { draft: 0, pending: 0, validated: 0, archived: 0 };
        if (rows) {
            rows.forEach(r => { 
                const s = r.status || 'draft';
                if (stats[s] !== undefined) stats[s] = r.count; 
            });
        }
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LISTE
router.get('/', requireAuth, async (req, res) => {
    try {
        const { page = 1, limit = 25, search, type, status, client_id } = req.query;
        const limitVal = client_id ? 200 : parseInt(limit); 
        const offset = (page - 1) * limitVal;
        
        let where = ["1=1"];
        let params = [];

        if (search) {
            const s = `%${search}%`;
            where.push(`(r.cabinet_name LIKE ? OR r.city LIKE ? OR r.report_number LIKE ?)`);
            params.push(s, s, s);
        }
        if (type) { where.push("r.work_type = ?"); params.push(type); }
        if (status) { where.push("r.status = ?"); params.push(status); }
        if (client_id) { where.push("r.client_id = ?"); params.push(client_id); }

        const whereSQL = where.join(' AND ');
        const countRow = await get(`SELECT count(*) as count FROM reports r WHERE ${whereSQL}`, params);
        
        const sql = `
            SELECT r.*, 
            COALESCE(u.name, 'Non défini') as validator_name,
            COALESCE(a.name, 'Non défini') as author_name,
            COALESCE(r.archived_at, r.created_at) as archived_at_safe,
            COALESCE(r.validated_at, r.created_at) as validated_at_safe
            FROM reports r 
            LEFT JOIN users u ON r.validator_id = u.id
            LEFT JOIN users a ON r.author_id = a.id
            WHERE ${whereSQL} 
            ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
        
        const rows = await all(sql, [...params, limitVal, offset]);

        res.json({ 
            reports: rows, 
            pagination: { 
                page: parseInt(page), 
                totalPages: Math.ceil((countRow?.count || 0) / limitVal), 
                totalItems: countRow?.count || 0 
            } 
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DETAIL
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const sql = `
            SELECT r.*, 
            COALESCE(u.name, '') as validator_name, 
            COALESCE(a.name, '') as author_name 
            FROM reports r 
            LEFT JOIN users u ON r.validator_id = u.id 
            LEFT JOIN users a ON r.author_id = a.id
            WHERE r.id = ?`;
            
        const report = await get(sql, [id]);
        if (!report) return res.status(404).json({ error: "Introuvable" });

        const [techs, stks, mats, eqs] = await Promise.all([
            all("SELECT * FROM report_technicians WHERE report_id = ?", [id]),
            all("SELECT * FROM report_stk_tests WHERE report_id = ?", [id]),
            all("SELECT * FROM report_materials WHERE report_id = ?", [id]),
            all("SELECT equipment_id FROM report_equipment WHERE report_id = ?", [id])
        ]);

        const stk_rows = await all(
            "SELECT device_name, price, is_included FROM report_stk_tests WHERE report_id = ?", 
            [id]);

        const formattedStk = stk_rows.map(row => ({
            test_name: "Test de sécurité électrique obligatoire i.O - " + row.device_name,
            price: row.price,
            included: row.is_included === 1
        }));

        report.technicians = techs; 
        report.stk_tests = stks; 
        report.materials = mats;
        report.equipment_ids = eqs.map(e => e.equipment_id).filter(id => id != null);
        report.stk_tests = formattedStk;
        
        res.json(report);
    } catch (e) {
        console.error("Erreur Detail Rapport:", e);
        res.status(500).json({ error: "Erreur chargement détails" });
    }
});

// --- CHANGE STATUT (PATCH) ---
router.patch('/:id/status', requireAuth, async (req, res) => {
    const { status, reason } = req.body;
    const reportId = req.params.id;
    const userId = req.session.userId;
    
    try {
        const role = await getUserRole(userId);
        const validators = ['admin', 'validator', 'verificateur', 'verifier', 'sales_director'];
        const archivers = ['admin', 'secretary'];

        // Vérification permissions
        if (status === 'validated' && !validators.includes(role)) return res.status(403).json({ error: "Permission refusée." });
        if (status === 'draft' && reason && !validators.includes(role)) return res.status(403).json({ error: "Permission refusée." });
        if (status === 'archived' && !archivers.includes(role)) return res.status(403).json({ error: "Permission refusée." });

        // Update DB
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
        sql += " WHERE id = ?"; params.push(reportId);

        await run(sql, params);
        logActivity(userId, 'update_status', 'report', reportId, { status, reason });

        // --- NOTIFICATIONS PATCH ---
        const reportInfo = await get("SELECT author_id, cabinet_name FROM reports WHERE id = ?", [reportId]);
        
        if (reportInfo) {
            const link = `/reports.html?id=${reportId}`;
            const cabinetName = reportInfo.cabinet_name || 'Client';

            if (status === 'validated') {
                if (reportInfo.author_id) notifyUser(reportInfo.author_id, 'success', `✅ Rapport validé pour ${cabinetName}`, link);
            } 
            else if (status === 'draft' && reason) {
                if (reportInfo.author_id) notifyUser(reportInfo.author_id, 'error', `❌ Rapport refusé pour ${cabinetName}. Motif : ${reason}`, link);
            }
            else if (status === 'pending') {
                const authorName = (await get("SELECT name FROM users WHERE id=?", [userId]))?.name || "Un technicien";
                notifyRoles(
                    ['admin', 'verifier', 'verificateur', 'sales_director'], 
                    'warning', 
                    `📝 ${authorName} a soumis un rapport pour : ${cabinetName}`,
                    link
                );
            }
            // --- ARCHIVAGE (NAS) STRICTEMENT POUR LES TECHS ---
            else if (status === 'archived') {
                // On prévient tous les techniciens
                notifyRoles(
                    ['tech'], 
                    'info', 
                    `📂 Rapport validé pour ${cabinetName}. À déplacer dans le NAS.`,
                    link
                );
                // On s'assure que l'auteur est prévenu (s'il n'avait pas le rôle tech)
                if (reportInfo.author_id) {
                    notifyUser(reportInfo.author_id, 'info', `📂 Votre rapport pour ${cabinetName} est archivé. Pensez à le mettre sur le NAS.`, link);
                }
            }
        }

        // --- PROTECTION KB MED : Auto-Update Maintenance STRICT & DATE PRÉCISE ---
        if (status === 'validated') {
            // NOUVEAU : On va chercher la "work_date" du technicien (la vraie date d'intervention)
            const row = await get(`
                SELECT 
                    r.technician_signature_date, 
                    r.created_at, 
                    r.work_type,
                    (SELECT work_date FROM report_technicians WHERE report_id = r.id ORDER BY work_date ASC LIMIT 1) as tech_work_date
                FROM reports r WHERE r.id = ?
            `, [reportId]);
            
            if (row) {
                const workType = (row.work_type || '').toLowerCase();
                
                const maintenanceTypes = [
                    "service d'entretien",
                    "service-wartung",
                    "première validation",
                    "erste validierung",
                    "re-validation",
                    "re-validierung"
                ];
                
                const isMaintenance = maintenanceTypes.some(type => workType.includes(type));

                if (isMaintenance) {
                    // 1. Priorité absolue : La date de travail renseignée par le technicien
                    // 2. Sinon : La date de signature
                    // 3. Dernier recours : La date de création du rapport
                    let rawDate = row.tech_work_date || row.technician_signature_date || row.created_at;

                    // Nettoyage de sécurité : on force le format YYYY-MM-DD pour SQLite (on enlève les heures)
                    if (rawDate && rawDate.includes('T')) {
                        rawDate = rawDate.split('T')[0];
                    }

                    const updateEqSql = `UPDATE client_equipment SET last_maintenance_date = ?, next_maintenance_date = date(?, '+' || COALESCE(maintenance_interval, 1) || ' years') WHERE id IN (SELECT equipment_id FROM report_equipment WHERE report_id = ?)`;
                    
                    run(updateEqSql, [rawDate, rawDate, reportId])
                        .then(() => console.log(`✅ Date de maintenance (${rawDate}) mise à jour pour le rapport #${reportId}`))
                        .catch(e => console.error("🔴 Erreur mise à jour date :", e));
                } else {
                    console.log(`ℹ️ Rapport #${reportId} validé (Type: "${row.work_type}"). Les dates de maintenance restent inchangées.`);
                }
            }
        }

        res.json({ success: true, status });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SAVE GLOBAL (POST/PUT) ---
router.post('/', requireAuth, async (req, res) => { await saveReportData(req, res); });
router.put('/:id', requireAuth, async (req, res) => { await saveReportData(req, res, req.params.id); });

const saveReportData = async (req, res, reportId = null) => {
    const { 
        client_id, title, language = 'fr', work_type, status, cabinet_name, address, postal_code, city, interlocutor, 
        installation, remarks, travel_costs = 0, travel_included = 0, travel_location, 
        technician_signature_date, work_accomplished, technicians, stk_tests, materials, equipment_ids 
    } = req.body;
    
    const userId = req.session.userId;
    const currentStatus = status || 'draft';

    try {
        await run("BEGIN TRANSACTION");
        let finalId = reportId;
        
        const reportParams = [
            client_id, title, language, work_type, currentStatus, cabinet_name, address, postal_code, city, interlocutor, 
            installation, remarks, travel_costs, travel_included?1:0, travel_location, technician_signature_date, work_accomplished
        ];

        if (reportId) {
            const sqlUpdate = `UPDATE reports SET client_id=?, title=?, language=?, work_type=?, status=?, cabinet_name=?, address=?, postal_code=?, city=?, interlocutor=?, installation=?, remarks=?, travel_costs=?, travel_included=?, travel_location=?, technician_signature_date=?, work_accomplished=? WHERE id=?`;
            await run(sqlUpdate, [...reportParams, reportId]);
        } else {
            const sqlInsert = `INSERT INTO reports (client_id, title, language, work_type, status, cabinet_name, address, postal_code, city, interlocutor, installation, remarks, travel_costs, travel_included, travel_location, technician_signature_date, work_accomplished, author_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
            const result = await run(sqlInsert, [...reportParams, userId]);
            finalId = result.lastID;
        }

        // Nettoyage et Réinsertion
        await run(`DELETE FROM report_technicians WHERE report_id=?`, [finalId]);
        await run(`DELETE FROM report_stk_tests WHERE report_id=?`, [finalId]);
        await run(`DELETE FROM report_materials WHERE report_id=?`, [finalId]);
        await run(`DELETE FROM report_equipment WHERE report_id=?`, [finalId]);

        if (technicians && technicians.length) {
            for (const t of technicians) {
                if (t.technician_id) {
                    await run(
                        "INSERT INTO report_technicians (report_id, technician_id, technician_name, work_date, hours_normal, hours_extra, included) VALUES (?,?,?,?,?,?,?)",
                        [finalId, t.technician_id, t.technician_name, t.work_date, t.hours_normal, t.hours_extra, t.included ? 1 : 0]
                    );
                }
            }
        }

        if (equipment_ids && equipment_ids.length) {
            for (const eid of equipment_ids) {
                const eqRow = await get(`SELECT ce.id, ec.brand, ec.name, ce.serial_number FROM client_equipment ce LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ce.id = ?`, [eid]);
                if (eqRow) {
                    const info = `${eqRow.brand || ""} ${eqRow.name || "Appareil"} ${eqRow.serial_number ? `[SN:${eqRow.serial_number}]` : ""}`.trim();
                    await run(`INSERT INTO report_equipment (report_id, equipment_id, equipment_info) VALUES (?, ?, ?)`, [finalId, eid, info]);
                }
            }
        }

        if (materials && materials.length) {
            for (const m of materials) {
                const isIncluded = (m.included === true || m.included === 1 || m.included === "true") ? 1 : 0;
                await run(
                    "INSERT INTO report_materials (report_id, material_id, material_name, product_code, quantity, unit_price, discount, total_price, included) VALUES (?,?,?,?,?,?,?,?,?)",
                    [finalId, m.material_id, m.material_name, m.product_code, m.quantity, m.unit_price, m.discount || 0, m.total_price, isIncluded]
                );
            }
        }
        
        if (req.body.stk_tests && Array.isArray(req.body.stk_tests)) {
            for (const stk of req.body.stk_tests) {
                const deviceName = stk.test_name.replace("Test de sécurité électrique obligatoire i.O - ", "");
                await run("INSERT INTO report_stk_tests (report_id, device_name, price, is_included) VALUES (?, ?, ?, ?)", [finalId, deviceName, stk.price, stk.included ? 1 : 0]);
            }
        }

        if (!reportId) { 
            const reportNumber = `${new Date().getFullYear()}-${String(finalId).padStart(4, '0')}`; 
            await run("UPDATE reports SET report_number = ? WHERE id = ?", [reportNumber, finalId]); 
        }

        logActivity(userId, reportId ? 'update' : 'create', 'report', finalId, { cabinet_name, work_type });
        
        // --- NOTIFICATIONS SAVE ---
        if (currentStatus === 'pending') {
            const authorName = (await get("SELECT name FROM users WHERE id=?", [userId]))?.name || "Un technicien";
            notifyRoles(
                ['admin', 'verifier', 'verificateur', 'sales_director'], 
                'warning', 
                `📝 ${authorName} a soumis un rapport pour : ${cabinet_name}`,
                `/reports.html?id=${finalId}`
            );
        }
        // ARCHIVAGE (NAS) - STRICTEMENT POUR LES TECHS
        else if (currentStatus === 'archived') {
            notifyRoles(
                ['tech'],
                'info',
                `📂 Rapport validé pour ${cabinet_name}. À déplacer dans le NAS.`,
                `/reports.html?id=${finalId}`
            );
        }

        await run("COMMIT");
        res.json({ success: true, id: finalId });

    } catch (err) {
        await run("ROLLBACK");
        console.error("❌ Erreur Save Report:", err);
        res.status(500).json({ error: err.message });
    }
};

router.delete('/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    try {
        await run("DELETE FROM reports WHERE id = ?", [id]);
        logActivity(req.session.userId, 'delete', 'report', id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;