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
    
    // 1. On convertit en texte et on enlève espaces, points, tirets, parenthèses
    let str = String(val).replace(/[\s.\-()]/g, '');

    // 2. Gestion international (+41 ou 0041) -> 0
    if (str.startsWith('+41')) str = '0' + str.substring(3);
    else if (str.startsWith('0041')) str = '0' + str.substring(4);

    // 3. Formatage joli (0XX XXX XX XX) si c'est un numéro suisse standard (10 chiffres)
    if (/^0\d{9}$/.test(str)) {
        return str.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');
    }

    // Si ça ne ressemble pas à un numéro suisse standard, on rend le numéro nettoyé tel quel
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
// ROUTE IMPORT EXCEL (Blindée)
// ==========================================
router.post('/import', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni" });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (!data || data.length === 0) return res.json({ success: true, count: 0 });

        db.serialize(() => {
            // Activité forcée à 'Autre' comme demandé
            const stmt = db.prepare(`
                INSERT INTO clients (
                    cabinet_name, contact_name, address, postal_code, city, canton, email, phone, activity, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Autre', datetime('now'))
            `);

            data.forEach(row => {
                // Lecture flexible des colonnes (Gestion des vides)
                // Si 'Nom' est vide, on met 'Cabinet Sans Nom' pour éviter une erreur SQL
                const cabinet = row['Nom'] || row['Cabinet'] || row['Nom Cabinet'] || 'Cabinet Sans Nom';
                
                // Champs facultatifs : si vide, reste vide
                const contact = row['Contact'] || row['Nom Contact'] || '';
                const address = row['Adresse'] || row['Rue'] || '';
                const cp = row['NPA'] || row['CP'] || row['Code Postal'] || '';
                
                // Ville obligatoire : fallback si vide
                const city = row['Ville'] || row['City'] || 'Ville Inconnue';
                
                const email = row['Email'] || row['Mail'] || '';

                // Nettoyage intelligent
                const canton = cleanCanton(row['Canton'] || row['Ct'] || row['Dpt']);
                const phone = formatSwissPhone(row['Téléphone'] || row['Tel'] || row['Phone']);

                stmt.run(cabinet, contact, address, cp, city, canton, email, phone, (err) => {
                    // On logue juste l'erreur dans la console serveur sans planter tout le processus
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
// PLANNING (Code existant inchangé)
// ==========================================
router.get('/planning', requireAuth, (req, res) => {
    const { 
        search, status, canton, category, 
        brand, model, serial, year, device,
        sortBy, sortOrder 
    } = req.query; 
    
    let where = ["ce.next_maintenance_date IS NOT NULL"];
    let params = [];

    if (search) {
        where.push(`(c.cabinet_name LIKE ? OR c.city LIKE ? OR ec.brand LIKE ? OR ec.model LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }
    if (canton) { where.push("c.canton = ?"); params.push(canton); }
    if (category) { where.push("c.activity = ?"); params.push(category); }
    
    // Filtres Avancés
    if (brand) { where.push("ec.brand LIKE ?"); params.push(`%${brand}%`); }
    if (model) { where.push("ec.model LIKE ?"); params.push(`%${model}%`); }
    if (serial) { where.push("ce.serial_number LIKE ?"); params.push(`%${serial}%`); }

    // Statut (Basé sur la date)
    const today = new Date().toISOString().split('T')[0];
    if (status === 'expired') { where.push("ce.next_maintenance_date < ?"); params.push(today); }
    else if (status === 'warning') { where.push("ce.next_maintenance_date BETWEEN ? AND date(?, '+30 days')"); params.push(today, today); }
    else if (status === 'ok') { where.push("ce.next_maintenance_date > date(?, '+30 days')"); params.push(today); }

    let orderBy = "ce.next_maintenance_date ASC"; // Par défaut : urgence
    if (sortBy) {
        const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
        const map = {
            'status': 'ce.next_maintenance_date',
            'cabinet_name': 'c.cabinet_name',
            'city': 'c.city',
            'catalog_name': 'ec.name',
            'last_maintenance_date': 'ce.last_maintenance_date',
            'next_maintenance_date': 'ce.next_maintenance_date'
        };
        if (map[sortBy]) orderBy = `${map[sortBy]} ${order}`;
    }

    const sql = `
        SELECT 
            ce.id, ce.next_maintenance_date, ce.last_maintenance_date, ce.serial_number,
            c.id as client_id, c.cabinet_name, c.city, c.canton,
            ec.name as catalog_name, ec.brand, ec.model, ec.type, ec.device_type,
            (julianday(ce.next_maintenance_date) - julianday('now')) as days_remaining
        FROM client_equipment ce
        JOIN clients c ON ce.client_id = c.id
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
    `;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows }); 
    });
});

// ==========================================
// LISTE DES CLIENTS (Code existant inchangé)
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
// CRUD CLIENTS (Code existant inchangé)
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
// SOUS-ROUTES (Équipements & RDV)
// ==========================================

// GET EQUIPMENT (Equipement d'un client spécifique)
router.get('/:id/equipment', requireAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
        SELECT ce.*, ec.name, ec.brand, ec.model, ec.type,
        (ec.name || ' ' || COALESCE(ec.model, '')) as final_name,
        ec.brand as final_brand,
        (julianday(ce.next_maintenance_date) - julianday('${today}')) as days_remaining
        FROM client_equipment ce
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ce.client_id = ?
        ORDER BY ce.next_maintenance_date ASC
    `;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ADD EQUIPMENT (A un client)
router.post('/:id/equipment', requireAuth, (req, res) => {
    const { equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval } = req.body;
    
    // Calcul de la prochaine date
    let nextDate = null;
    if (last_maintenance_date && maintenance_interval) {
        const d = new Date(last_maintenance_date);
        d.setFullYear(d.getFullYear() + parseInt(maintenance_interval));
        nextDate = d.toISOString().split('T')[0];
    }

    const sql = `INSERT INTO client_equipment (client_id, equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, next_maintenance_date) VALUES (?,?,?,?,?,?,?)`;
    db.run(sql, [req.params.id, equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, nextDate], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.userId, 'add_equipment', 'client', req.params.id, { equipment_id });
        res.json({ id: this.lastID });
    });
});

// UPDATE EQUIPMENT (D'un client)
router.put('/:clientId/equipment/:eqId', requireAuth, (req, res) => {
    const { equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval } = req.body;
    let nextDate = null;
    if (last_maintenance_date && maintenance_interval) {
        const d = new Date(last_maintenance_date);
        d.setFullYear(d.getFullYear() + parseInt(maintenance_interval));
        nextDate = d.toISOString().split('T')[0];
    }
    const sql = `UPDATE client_equipment SET equipment_id=?, serial_number=?, installed_at=?, last_maintenance_date=?, maintenance_interval=?, next_maintenance_date=? WHERE id=? AND client_id=?`;
    db.run(sql, [equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, nextDate, req.params.eqId, req.params.clientId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// DELETE EQUIPMENT (D'un client uniquement - Pas du catalogue global)
router.delete('/:clientId/equipment/:eqId', requireAuth, (req, res) => {
    db.run("DELETE FROM client_equipment WHERE id=? AND client_id=?", [req.params.eqId, req.params.clientId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// GET HISTORY (Fusion Reports + RDV Manuels)
router.get('/:id/appointments', requireAuth, (req, res) => {
  const sql = `
    SELECT 
        'report' as source_type,
        r.id as report_id, 
        r.report_number, 
        r.technician_signature_date as appointment_date, 
        r.work_accomplished as task_description,
        NULL as equipment_name,
        (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ', ') 
         FROM report_equipment re 
         JOIN equipment_catalog ec ON re.equipment_id = ec.id 
         WHERE re.report_id = r.id) as machines
    FROM reports r 
    WHERE r.client_id = ? AND r.status IN ('validated', 'archived')

    UNION ALL

    SELECT 
        'appointment' as source_type,
        ah.id as report_id,
        NULL as report_number,
        ah.appointment_date,
        ah.task_description,
        NULL as equipment_name,
        (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ', ')
         FROM appointment_equipment ae
         JOIN client_equipment ce ON ae.equipment_id = ce.id
         JOIN equipment_catalog ec ON ce.equipment_id = ec.id
         WHERE ae.appointment_id = ah.id) as machines
    FROM appointments_history ah
    WHERE ah.client_id = ?

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

// ==========================================
// EXPORT EXCEL (Client spécifique ou liste)
// ==========================================
router.get('/export-excel', requireAuth, (req, res) => {
    const sql = `
        SELECT 
            c.id, c.cabinet_name, c.contact_name, c.activity, c.address, c.postal_code, c.city, c.canton, c.phone, c.email,
            ce.serial_number, ce.installed_at, ce.last_maintenance_date,
            ec.name as equip_name, ec.brand as equip_brand, ec.model as equip_model
        FROM clients c
        LEFT JOIN client_equipment ce ON c.id = ce.client_id
        LEFT JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        ORDER BY c.cabinet_name
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Erreur export:", err);
            return res.status(500).send("Erreur serveur");
        }

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
                const machineStr = `• ${row.equip_brand} ${row.equip_name} (${row.equip_model || '-'}) [SN:${row.serial_number || '?'}]`;
                clientsMap[row.id]["Parc Machines"].push(machineStr);
            }
        });

        const exportData = Object.values(clientsMap).map(c => ({
            ...c,
            "Parc Machines": c["Parc Machines"].join('\n')
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(exportData);

        ws['!cols'] = [
            { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, 
            { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 15 }, 
            { wch: 25 }, { wch: 60 }
        ];

        xlsx.utils.book_append_sheet(wb, ws, "Liste Clients");

        const fileName = `Export_Clients_${new Date().toISOString().split('T')[0]}.xlsx`;
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    });
});

module.exports = router;