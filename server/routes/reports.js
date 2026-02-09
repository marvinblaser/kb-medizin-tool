// server/routes/reports.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// --- UTILITAIRES ASYNC (Promisify) ---
// Ces fonctions permettent d'utiliser await sur la DB
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

// --- HELPER : Gestion des Logs ---
const logActivity = (userId, action, entity, entityId, meta = {}) => {
  db.run(
    "INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)",
    [userId, action, entity, entityId, JSON.stringify(meta)],
    (err) => { if (err) console.error("Erreur Log:", err.message); }
  );
};

const getUserRole = (userId) => {
    return get("SELECT role FROM users WHERE id = ?", [userId]).then(row => row ? row.role : null);
};

// --- STATISTIQUES ---
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

// --- LISTE DES RAPPORTS ---
router.get('/', requireAuth, async (req, res) => {
    try {
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

// --- DÉTAIL D'UN RAPPORT ---
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
        // --- AJOUTER CECI ---
        const stk_rows = await all(
            "SELECT device_name, price, is_included FROM report_stk_tests WHERE report_id = ?", 
            [id]);

            const formattedStk = stk_rows.map(row => ({
            test_name: "Test de sécurité électrique obligatoire i.O - " + row.device_name,
            price: row.price,
            included: row.is_included === 1 // Conversion 1 -> true
        }));

        report.technicians = techs; 
        report.stk_tests = stks; 
        report.materials = mats;
        report.equipment_ids = eqs.map(e => e.equipment_id).filter(id => id != null);
        report.stk_tests = formattedStk; // <-- On remplace les stk_tests par la version formatée
        
        res.json(report);
    } catch (e) {
        console.error("Erreur Detail Rapport:", e);
        res.status(500).json({ error: "Erreur chargement détails" });
    }
});

// --- CHANGEMENT DE STATUT + AUTO-UPDATE MAINTENANCE ---
router.patch('/:id/status', requireAuth, async (req, res) => {
    const { status, reason } = req.body;
    const reportId = req.params.id;
    const userId = req.session.userId;
    
    try {
        const role = await getUserRole(userId);
        const validators = ['admin', 'validator', 'verificateur', 'verifier', 'sales_director'];
        const archivers = ['admin', 'secretary'];

        if (status === 'validated' && !validators.includes(role)) return res.status(403).json({ error: "Permission refusée." });
        if (status === 'draft' && reason && !validators.includes(role)) return res.status(403).json({ error: "Permission refusée." });
        if (status === 'archived' && !archivers.includes(role)) return res.status(403).json({ error: "Permission refusée." });

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

        // --- PARTIE 2 : Mise à jour automatique des dates machines (Uniquement à la validation) ---
        if (status === 'validated') {
            console.log(`✅ Rapport ${reportId} validé. Début mise à jour équipements...`);
            
            const row = await get("SELECT technician_signature_date, created_at FROM reports WHERE id = ?", [reportId]);
            
            if (row) {
                const interventionDate = row.technician_signature_date || row.created_at;
                
                const updateEqSql = `
                    UPDATE client_equipment 
                    SET last_maintenance_date = ?, 
                        next_maintenance_date = date(?, '+' || COALESCE(maintenance_interval, 1) || ' years') 
                    WHERE id IN (SELECT equipment_id FROM report_equipment WHERE report_id = ?)
                `;
                
                // On n'attend pas forcément le résultat de ça pour répondre au client, 
                // mais on loggue l'erreur si besoin
                run(updateEqSql, [interventionDate, interventionDate, reportId])
                    .then(res => console.log(`✅ Équipements mis à jour avec la date : ${interventionDate}`))
                    .catch(err => console.error("❌ Erreur Auto-Update Equipment:", err.message));
            }
        }

        res.json({ success: true, status });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CRÉATION / MODIFICATION (REFAIT AVEC ASYNC/AWAIT & TRANSACTION) ---
router.post('/', requireAuth, async (req, res) => {
    await saveReportData(req, res);
});

router.put('/:id', requireAuth, async (req, res) => {
    await saveReportData(req, res, req.params.id);
});

const saveReportData = async (req, res, reportId = null) => {
    // 1. On récupère le champ 'title' ici
    const { 
        client_id, title, language = 'fr', work_type, status, cabinet_name, address, postal_code, city, interlocutor, 
        installation, remarks, travel_costs = 0, travel_included = 0, travel_location, 
        technician_signature_date, work_accomplished, technicians, stk_tests, materials, equipment_ids 
    } = req.body;
    
    const userId = req.session.userId;
    const currentStatus = reportId ? (status || 'draft') : 'draft';

    try {
        console.log("--- DÉBUT SAUVEGARDE RAPPORT ---");
        await run("BEGIN TRANSACTION");

        let finalId = reportId;
        
        // 2. On ajoute 'title' dans le tableau des paramètres (juste après client_id par exemple)
        const reportParams = [
            client_id, 
            title, // <--- AJOUTÉ ICI
            language, work_type, currentStatus, cabinet_name, address, postal_code, city, interlocutor, installation, remarks, travel_costs, travel_included?1:0, travel_location, technician_signature_date, work_accomplished
        ];

        // ÉTAPE 1 : RAPPORT
        console.log("1. Sauvegarde Rapport (Parent)...");
        if (reportId) {
            // 3. On modifie la requête UPDATE pour inclure title=?
            const sqlUpdate = `UPDATE reports SET client_id=?, title=?, language=?, work_type=?, status=?, cabinet_name=?, address=?, postal_code=?, city=?, interlocutor=?, installation=?, remarks=?, travel_costs=?, travel_included=?, travel_location=?, technician_signature_date=?, work_accomplished=? WHERE id=?`;
            
            await run(sqlUpdate, [...reportParams, reportId]);
        } else {
            // 4. On modifie la requête INSERT pour inclure title et un ? supplémentaire
            const sqlInsert = `INSERT INTO reports (client_id, title, language, work_type, status, cabinet_name, address, postal_code, city, interlocutor, installation, remarks, travel_costs, travel_included, travel_location, technician_signature_date, work_accomplished, author_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
            
            const result = await run(sqlInsert, [...reportParams, userId]);
            finalId = result.lastID;
        }
        console.log(`   -> OK (ID: ${finalId})`);

        // NETTOYAGE
        console.log("2. Nettoyage anciennes liaisons...");
        await run(`DELETE FROM report_technicians WHERE report_id=?`, [finalId]);
        await run(`DELETE FROM report_stk_tests WHERE report_id=?`, [finalId]);
        await run(`DELETE FROM report_materials WHERE report_id=?`, [finalId]);
        await run(`DELETE FROM report_equipment WHERE report_id=?`, [finalId]);

        // ÉTAPE 2 : TECHNICIENS
        if (technicians && technicians.length) {
            console.log(`3. Insertion ${technicians.length} Techniciens...`);
            for (const t of technicians) {
                if (t.technician_id) {
                    // C'est souvent ici que ça casse si l'ID utilisateur n'existe plus
                    console.log(`   -> Insert Tech ID: ${t.technician_id}`);
                    await run(
                        "INSERT INTO report_technicians (report_id, technician_id, technician_name, work_date, hours_normal, hours_extra, included) VALUES (?,?,?,?,?,?,?)",
                        [finalId, t.technician_id, t.technician_name, t.work_date, t.hours_normal, t.hours_extra, t.included ? 1 : 0]
                    );
                }
            }
        }

        // ÉTAPE 3 : ÉQUIPEMENTS
        if (equipment_ids && equipment_ids.length) {
            console.log(`4. Insertion ${equipment_ids.length} Équipements...`);
            for (const eid of equipment_ids) {
                console.log(`   -> Traitement Equipment ID: ${eid}`);
                const eqRow = await get(`SELECT ce.id, ec.brand, ec.name, ce.serial_number FROM client_equipment ce LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ce.id = ?`, [eid]);

                if (eqRow) {
                    const info = `${eqRow.brand || ""} ${eqRow.name || "Appareil"} ${eqRow.serial_number ? `[SN:${eqRow.serial_number}]` : ""}`.trim();
                    // C'est peut-être ici que ça casse
                    await run(`INSERT INTO report_equipment (report_id, equipment_id, equipment_info) VALUES (?, ?, ?)`, [finalId, eid, info]);
                } else {
                    console.warn(`   ⚠️ ATTENTION: Équipement ID ${eid} introuvable en base !`);
                }
            }
        }

        // ÉTAPE 4 : MATÉRIELS
        if (materials && materials.length) {
            console.log(`5. Insertion Matériels (${materials.length} éléments)...`);
            for (const m of materials) {
                // S'assurer que included est bien un entier (1 ou 0)
                const isIncluded = (m.included === true || m.included === 1 || m.included === "true") ? 1 : 0;
                
                await run(
                    "INSERT INTO report_materials (report_id, material_id, material_name, product_code, quantity, unit_price, discount, total_price, included) VALUES (?,?,?,?,?,?,?,?,?)",
                    [
                        finalId, 
                        m.material_id, 
                        m.material_name, 
                        m.product_code, 
                        m.quantity, 
                        m.unit_price, 
                        m.discount || 0, 
                        m.total_price,
                        isIncluded // <--- NOUVEAU CHAMP SAUVEGARDÉ
                    ]
                );
            }
        }

        await run("DELETE FROM report_stk_tests WHERE report_id = ?", [finalId]);

        // 2. On insère les nouvelles lignes reçues du frontend
        if (req.body.stk_tests && Array.isArray(req.body.stk_tests)) {
            for (const stk of req.body.stk_tests) {
                // On nettoie le nom si nécessaire (optionnel, selon ta préférence)
                const deviceName = stk.test_name.replace("Test de sécurité électrique obligatoire i.O - ", "");
                
                await run(
                    "INSERT INTO report_stk_tests (report_id, device_name, price, is_included) VALUES (?, ?, ?, ?)",
                    [finalId, deviceName, stk.price, stk.included ? 1 : 0]
                );
            }
        }

        // FIN
        if (!reportId) { 
            const reportNumber = `${new Date().getFullYear()}-${String(finalId).padStart(4, '0')}`; 
            await run("UPDATE reports SET report_number = ? WHERE id = ?", [reportNumber, finalId]); 
        }

        logActivity(userId, reportId ? 'update' : 'create', 'report', finalId, { cabinet_name, work_type });
        
        await run("COMMIT");
        console.log("--- SUCCÈS ---");
        res.json({ success: true, id: finalId });

    } catch (err) {
        await run("ROLLBACK");
        console.error("❌ CLASH ICI :", err);
        res.status(500).json({ error: err.message });
    }
};

// --- SUPPRESSION ---
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