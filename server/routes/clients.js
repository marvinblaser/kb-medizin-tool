// server/routes/clients.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Configuration pour stocker le fichier en mémoire
const upload = multer({ storage: multer.memoryStorage() });


// --- HELPER : Nettoyage Canton (2 lettres ou FL) ---
const cleanCanton = (val) => {
    if (!val) return '';
    let str = String(val).trim().toUpperCase();
    if (str.includes('LIECH') || str === 'FL') return 'FL';
    return str.substring(0, 2); // Garde les 2 premiers caractères (VD, GE, 75...)
};

// --- HELPER : Formatage Téléphone (Support +41) ---
const formatSwissPhone = (val) => {
    if (!val) return '';
    let str = String(val).replace(/[\s.\-()]/g, '');
    if (str.startsWith('+41')) str = '0' + str.substring(3);
    else if (str.startsWith('0041')) str = '0' + str.substring(4);
    if (/^0\d{9}$/.test(str)) {
        return str.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');
    }
    return str;
};

// --- HELPER : Logs ---
const logActivity = (userId, action, entity, entityId, meta = {}) => {
  db.run(
    "INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)",
    [userId, action, entity, entityId, JSON.stringify(meta)]
  );
};

// ==========================================
// 1. ROUTE IMPORT EXCEL
// ==========================================
router.post('/import', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni" });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (!data || data.length === 0) return res.json({ success: true, count: 0 });

        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT INTO clients (
                    cabinet_name, contact_name, address, postal_code, city, canton, email, phone, activity, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Autre', datetime('now'))
            `);

            data.forEach(row => {
                const cabinet = row['Nom'] || row['Cabinet'] || row['Nom Cabinet'] || 'Cabinet Sans Nom';
                const contact = row['Contact'] || row['Nom Contact'] || '';
                const address = row['Adresse'] || row['Rue'] || '';
                const cp = row['NPA'] || row['CP'] || row['Code Postal'] || '';
                const city = row['Ville'] || row['City'] || 'Ville Inconnue';
                const email = row['Email'] || row['Mail'] || '';
                const canton = cleanCanton(row['Canton'] || row['Ct'] || row['Dpt']);
                const phone = formatSwissPhone(row['Téléphone'] || row['Tel'] || row['Phone']);

                stmt.run(cabinet, contact, address, cp, city, canton, email, phone, (err) => {
                    if (err) console.error(`[Import] Échec ligne "${cabinet}":`, err.message);
                });
            });
            stmt.finalize();
        });

        res.json({ success: true, count: data.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la lecture du fichier Excel" });
    }
});

// ==========================================
// 2. EXPORTS
// ==========================================

// EXPORT SIMPLE
router.get('/export', requireAuth, (req, res) => {
    const sql = `
        SELECT 
            c.id, c.cabinet_name, c.contact_name, c.address, c.postal_code, c.city, c.canton, c.phone, c.email, c.activity,
            ce.serial_number, ce.installed_at, ce.last_maintenance_date, ce.next_maintenance_date,
            ec.name as equip_name, ec.brand as equip_brand, ec.model as equip_model
        FROM clients c
        LEFT JOIN client_equipment ce ON c.id = ce.client_id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        ORDER BY c.cabinet_name
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).send("Erreur serveur lors de l'export");

        const clientsMap = {};

        rows.forEach(row => {
            if (!clientsMap[row.id]) {
                clientsMap[row.id] = {
                    "Cabinet": row.cabinet_name,
                    "Contact": row.contact_name,
                    "Activité": row.activity,
                    "Adresse": row.address,
                    "NPA": row.postal_code,
                    "Ville": row.city,
                    "Canton": row.canton,
                    "Téléphone": row.phone,
                    "Email": row.email,
                    "Machines": [] 
                };
            }
            if (row.equip_name) {
                // Ajout de la date d'expiration (next_maintenance_date)
                const dateExp = row.next_maintenance_date ? ` | Exp: ${row.next_maintenance_date}` : '';
                const machineInfo = `${row.equip_brand} ${row.equip_name} (${row.equip_model || '-'}) [SN:${row.serial_number || '?'}${dateExp}]`;
                clientsMap[row.id].Machines.push(machineInfo);
            }
        });

        const exportData = Object.values(clientsMap).map(c => ({
            ...c,
            "Machines": c.Machines.join(' \n ')
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(exportData);
        ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 5 }, { wch: 15 }, { wch: 25 }, { wch: 80 }];

        xlsx.utils.book_append_sheet(wb, ws, "Clients");
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `Export_Clients_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    });
});

// EXPORT EXCEL COMPLET (Celui utilisé par le bouton Admin)
router.get('/export-excel', requireAuth, (req, res) => {
    const sql = `
        SELECT 
            c.id, c.cabinet_name, c.contact_name, c.activity, c.address, c.postal_code, c.city, c.canton, c.phone, c.email,
            ce.serial_number, ce.installed_at, ce.last_maintenance_date, ce.next_maintenance_date,
            ec.name as equip_name, ec.brand as equip_brand, ec.model as equip_model
        FROM clients c
        LEFT JOIN client_equipment ce ON c.id = ce.client_id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        ORDER BY c.cabinet_name
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).send("Erreur serveur");

        const clientsMap = {};

        rows.forEach(row => {
            if (!clientsMap[row.id]) {
                clientsMap[row.id] = {
                    "Cabinet": row.cabinet_name,
                    "Contact": row.contact_name,
                    "Secteur": row.activity,
                    "Adresse": row.address,
                    "NPA": row.postal_code,
                    "Ville": row.city,
                    "Canton": row.canton,
                    "Téléphone": row.phone,
                    "Email": row.email,
                    "Parc Machines": [] 
                };
            }
            if (row.equip_name) {
                // Ajout de la date d'expiration ici aussi
                const dateExp = row.next_maintenance_date ? ` - Exp: ${row.next_maintenance_date}` : '';
                const machineStr = `• ${row.equip_brand} ${row.equip_name} (${row.equip_model || '-'}) [SN:${row.serial_number || '?'}]${dateExp}`;
                clientsMap[row.id]["Parc Machines"].push(machineStr);
            }
        });

        const exportData = Object.values(clientsMap).map(c => ({
            ...c,
            "Parc Machines": c["Parc Machines"].join('\n')
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(exportData);
        ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 15 }, { wch: 25 }, { wch: 80 }];

        xlsx.utils.book_append_sheet(wb, ws, "Liste Clients");
        const fileName = `Export_Clients_${new Date().toISOString().split('T')[0]}.xlsx`;
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    });
});

// ==========================================
// 3. PLANNING (Refondu : Groupement par Client)
// ==========================================
router.get('/planning', requireAuth, (req, res) => {
    const { 
        search, status, canton, category, 
        brand, model 
    } = req.query; 
    
    // 1. On récupère TOUTES les machines qui ont une date de maintenance
    let where = ["ce.next_maintenance_date IS NOT NULL"];
    let params = [];

    // Filtres SQL de base
    if (search) {
        where.push(`(c.cabinet_name LIKE ? OR c.city LIKE ? OR ec.brand LIKE ? OR ec.model LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }
    if (canton) { where.push("c.canton = ?"); params.push(canton); }
    if (category) { where.push("c.activity = ?"); params.push(category); }
    if (brand) { where.push("ec.brand LIKE ?"); params.push(`%${brand}%`); }
    if (model) { where.push("ec.model LIKE ?"); params.push(`%${model}%`); }

    // Note : On ne filtre pas le statut (expired/ok) en SQL strict ici pour avoir une vue d'ensemble,
    // mais on le fera lors du groupement ou via l'interface.
    // Cependant, pour la performance, on peut exclure ceux qui sont dans le futur lointain si aucun statut n'est demandé.
    
    const sql = `
        SELECT 
            ce.id as equipment_id, ce.next_maintenance_date, ce.last_maintenance_date, ce.serial_number, ce.location,
            c.id as client_id, c.cabinet_name, c.city, c.address, c.canton, c.phone,
            ec.name as catalog_name, ec.brand, ec.model, ec.type,
            (julianday(ce.next_maintenance_date) - julianday('now')) as days_remaining
        FROM client_equipment ce
        JOIN clients c ON ce.client_id = c.id
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ${where.join(' AND ')}
        ORDER BY c.canton ASC, c.city ASC, ce.next_maintenance_date ASC
    `;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // 2. LOGIQUE D'AGRÉGATION (Transformation des données)
        const clientsMap = new Map();

        rows.forEach(row => {
            if (!clientsMap.has(row.client_id)) {
                clientsMap.set(row.client_id, {
                    client_id: row.client_id,
                    cabinet_name: row.cabinet_name,
                    city: row.city,
                    canton: row.canton,
                    address: row.address,
                    phone: row.phone,
                    machines: [],
                    worst_status_score: 0, // Pour le tri : 2=Expired, 1=Warning, 0=OK
                    earliest_date: row.next_maintenance_date // La date la plus urgente
                });
            }

            const client = clientsMap.get(row.client_id);
            
            // Calcul du statut de la machine
            let machineStatus = 'ok';
            if (row.days_remaining < 0) machineStatus = 'expired';
            else if (row.days_remaining <= 60) machineStatus = 'warning'; // 60 jours avant

            // Mise à jour du score du client (on prend le pire cas)
            let score = 0;
            if (machineStatus === 'expired') score = 2;
            else if (machineStatus === 'warning') score = 1;

            if (score > client.worst_status_score) {
                client.worst_status_score = score;
            }
            if (row.next_maintenance_date < client.earliest_date) {
                client.earliest_date = row.next_maintenance_date;
            }

            // Ajout de la machine
            client.machines.push({
                id: row.equipment_id,
                name: `${row.brand} ${row.catalog_name}`,
                model: row.model,
                serial: row.serial_number,
                location: row.location,
                next_date: row.next_maintenance_date,
                status: machineStatus,
                days: Math.round(row.days_remaining)
            });
        });

        // 3. Filtrage final selon le statut demandé par le front
        let result = Array.from(clientsMap.values());

        if (status === 'expired') {
            result = result.filter(c => c.worst_status_score === 2);
        } else if (status === 'warning') {
            result = result.filter(c => c.worst_status_score >= 1);
        }

        // Tri final : Les plus urgents en haut
        result.sort((a, b) => b.worst_status_score - a.worst_status_score || a.earliest_date.localeCompare(b.earliest_date));

        res.json({ data: result }); 
    });
});

// ==========================================
// 4. LISTE DES CLIENTS
// ==========================================
router.get('/', requireAuth, (req, res) => {
    const { page = 1, limit = 25, search, canton, category, sortBy, sortOrder } = req.query;
    const offset = (page - 1) * limit;

    let where = ["1=1"];
    let params = [];

    if (search) {
        where.push(`(cabinet_name LIKE ? OR city LIKE ? OR contact_name LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s);
    }
    if (canton) { where.push("canton = ?"); params.push(canton); }
    if (category) { where.push("activity = ?"); params.push(category); }

    let order = "cabinet_name ASC";
    if (sortBy) {
        const dir = sortOrder === 'desc' ? 'DESC' : 'ASC';
        const allowed = ['cabinet_name', 'city', 'appointment_at', 'created_at'];
        if (allowed.includes(sortBy)) order = `${sortBy} ${dir}`;
    }

    const countSql = `SELECT count(*) as count FROM clients WHERE ${where.join(' AND ')}`;
    const sql = `
        SELECT c.*, 
        (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ';;') 
         FROM client_equipment ce 
         JOIN equipment_catalog ec ON ce.equipment_id = ec.id 
         WHERE ce.client_id = c.id) as equipment_summary
        FROM clients c 
        WHERE ${where.join(' AND ')} 
        ORDER BY ${order} 
        LIMIT ? OFFSET ?`;

    db.get(countSql, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: "DB Error" });
        
        db.all(sql, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                clients: rows,
                pagination: {
                    page: parseInt(page),
                    totalPages: Math.ceil(countRow.count / limit),
                    totalItems: countRow.count
                }
            });
        });
    });
});

// ==========================================
// 5. CRUD CLIENTS
// ==========================================

router.get('/:id', requireAuth, (req, res) => {
    db.get("SELECT * FROM clients WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Client introuvable" });
        res.json(row);
    });
});

router.post('/', requireAuth, (req, res) => {
    const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, notes, latitude, longitude } = req.body;
    const sql = `INSERT INTO clients (cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, notes, latitude, longitude) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
    
    db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, notes, latitude, longitude], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.userId, 'create', 'client', this.lastID, { name: cabinet_name });
        res.json({ id: this.lastID });
    });
});

router.put('/:id', requireAuth, (req, res) => {
    const { cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, notes, latitude, longitude } = req.body;
    const sql = `UPDATE clients SET cabinet_name=?, contact_name=?, activity=?, address=?, postal_code=?, city=?, canton=?, phone=?, email=?, notes=?, latitude=?, longitude=? WHERE id=?`;
    
    db.run(sql, [cabinet_name, contact_name, activity, address, postal_code, city, canton, phone, email, notes, latitude, longitude, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.userId, 'update', 'client', req.params.id, { name: cabinet_name });
        res.json({ success: true });
    });
});

router.delete('/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM clients WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.userId, 'delete', 'client', req.params.id);
        res.json({ success: true });
    });
});

// ==========================================
// 6. SOUS-ROUTES (Équipements & RDV)
// ==========================================

// GET EQUIPMENT
router.get('/:id/equipment', requireAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    // On sélectionne ce.* donc la colonne 'location' sera incluse automatiquement
    const sql = `
        SELECT ce.*, ec.name, ec.brand, ec.model, ec.type,
        (ec.name || ' ' || COALESCE(ec.model, '')) as final_name,
        ec.brand as final_brand,
        (julianday(ce.next_maintenance_date) - julianday('${today}')) as days_remaining
        FROM client_equipment ce
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ce.client_id = ?
        ORDER BY ce.location ASC, ce.next_maintenance_date ASC
    `; // J'ai ajouté un tri par location pour que ce soit propre
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ADD EQUIPMENT (POST)
router.post('/:id/equipment', requireAuth, (req, res) => {
    // MODIFICATION : Ajout de 'location'
    const { equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, location } = req.body;
    
    let nextDate = null;
    if (last_maintenance_date && maintenance_interval) {
        const d = new Date(last_maintenance_date);
        d.setFullYear(d.getFullYear() + parseInt(maintenance_interval));
        nextDate = d.toISOString().split('T')[0];
    }
    
    // MODIFICATION SQL : Ajout de la colonne et du paramètre
    const sql = `INSERT INTO client_equipment (client_id, equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, next_maintenance_date, location) VALUES (?,?,?,?,?,?,?,?)`;
    
    db.run(sql, [req.params.id, equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, nextDate, location], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.userId, 'add_equipment', 'client', req.params.id, { equipment_id });
        res.json({ id: this.lastID });
    });
});

// UPDATE EQUIPMENT (PUT)
router.put('/:clientId/equipment/:eqId', requireAuth, (req, res) => {
    // MODIFICATION : Ajout de 'location'
    const { equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, location } = req.body;
    
    let nextDate = null;
    if (last_maintenance_date && maintenance_interval) {
        const d = new Date(last_maintenance_date);
        d.setFullYear(d.getFullYear() + parseInt(maintenance_interval));
        nextDate = d.toISOString().split('T')[0];
    }
    
    // MODIFICATION SQL : Ajout de location=?
    const sql = `UPDATE client_equipment SET equipment_id=?, serial_number=?, installed_at=?, last_maintenance_date=?, maintenance_interval=?, next_maintenance_date=?, location=? WHERE id=? AND client_id=?`;
    
    db.run(sql, [equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, nextDate, location, req.params.eqId, req.params.clientId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// DELETE EQUIPMENT
router.delete('/:clientId/equipment/:eqId', requireAuth, (req, res) => {
    db.run("DELETE FROM client_equipment WHERE id=? AND client_id=?", [req.params.eqId, req.params.clientId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// GET HISTORY
router.get('/:id/appointments', requireAuth, (req, res) => {
  const sql = `
    SELECT 'report' as source_type, r.id as report_id, r.report_number, r.technician_signature_date as appointment_date, r.work_accomplished as task_description, NULL as equipment_name,
    (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ', ') FROM report_equipment re JOIN equipment_catalog ec ON re.equipment_id = ec.id WHERE re.report_id = r.id) as machines
    FROM reports r WHERE r.client_id = ? AND r.status IN ('validated', 'archived')
    UNION ALL
    SELECT 'appointment' as source_type, ah.id as report_id, NULL as report_number, ah.appointment_date, ah.task_description, NULL as equipment_name,
    (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ', ') FROM appointment_equipment ae JOIN client_equipment ce ON ae.equipment_id = ce.id JOIN equipment_catalog ec ON ce.equipment_id = ec.id WHERE ae.appointment_id = ah.id) as machines
    FROM appointments_history ah WHERE ah.client_id = ?
    ORDER BY appointment_date DESC
  `;
  db.all(sql, [req.params.id, req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ADD MANUAL APPOINTMENT
router.post('/:id/appointments', requireAuth, (req, res) => {
  const { appointment_date, task_description, technician_id, report_id, equipment_ids } = req.body;
  db.serialize(() => {
    db.run("INSERT INTO appointments_history (client_id, appointment_date, task_description, technician_id, report_id) VALUES (?,?,?,?,?)", [req.params.id, appointment_date, task_description, technician_id, report_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const appId = this.lastID;
        if (equipment_ids && equipment_ids.length > 0) { const placeholders = equipment_ids.map(() => '(?, ?)').join(','); const values = []; equipment_ids.forEach(eid => { values.push(appId, eid); }); db.run(`INSERT INTO appointment_equipment (appointment_id, equipment_id) VALUES ${placeholders}`, values); }
        db.run("UPDATE clients SET appointment_at = ? WHERE id = ?", [appointment_date, req.params.id]);
        res.json({ id: appId });
    });
  });
});

module.exports = router;