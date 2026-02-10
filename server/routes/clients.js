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

// Récupérer la liste des techniciens pour le selecteur
router.get('/technicians', requireAuth, (req, res) => {
    // J'ai enlevé 'WHERE is_active = 1' au cas où vous auriez des erreurs de données
    // Si vous voulez masquer les anciens employés, remettez : WHERE is_active = 1
    const sql = "SELECT id, name, role FROM users ORDER BY name ASC";
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 3. PLANNING (Modifié : Exclut les clients ayant déjà un RDV futur)
router.get('/planning', requireAuth, (req, res) => {
    const { 
        search, status, canton, category, showHidden,
        brand, model 
    } = req.query; 
    
    let where = ["ce.next_maintenance_date IS NOT NULL"];
    let params = [];

    if (showHidden !== 'true') {
        where.push("(c.is_hidden = 0 OR c.is_hidden IS NULL)");
    }

    if (search) {
        where.push(`(c.cabinet_name LIKE ? OR c.city LIKE ? OR ec.brand LIKE ? OR ec.model LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }
    if (canton) { where.push("c.canton = ?"); params.push(canton); }
    if (category) { where.push("c.activity = ?"); params.push(category); }
    if (brand) { where.push("ec.brand LIKE ?"); params.push(`%${brand}%`); }
    if (model) { where.push("ec.model LIKE ?"); params.push(`%${model}%`); }

    // On récupère les machines ET on regarde s'il y a un RDV futur dans appointments_history
    const sql = `
        SELECT 
            ce.id as equipment_id, ce.next_maintenance_date, ce.serial_number, ce.location,
            c.id as client_id, c.cabinet_name, c.city, c.address, c.canton, c.phone,
            ec.name as catalog_name, ec.brand, ec.model,
            (julianday(ce.next_maintenance_date) - julianday('now')) as days_remaining,
            
            (SELECT id FROM appointments_history ah 
             WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
             ORDER BY ah.appointment_date ASC LIMIT 1) as future_rdv_id,
             
            (SELECT appointment_date FROM appointments_history ah 
             WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
             ORDER BY ah.appointment_date ASC LIMIT 1) as future_rdv_date

        FROM client_equipment ce
        JOIN clients c ON ce.client_id = c.id
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ${where.join(' AND ')}
        ORDER BY c.canton ASC, c.city ASC, ce.next_maintenance_date ASC
    `;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

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
                    worst_status_score: 0,
                    earliest_date: row.next_maintenance_date,
                    has_future_rdv: !!row.future_rdv_id // Correction: utilise future_rdv_id pour le flag
                });
            }

            const client = clientsMap.get(row.client_id);
            
            // Calcul du statut de la machine
            let machineStatus = 'ok';
            if (row.days_remaining < 0) machineStatus = 'expired';
            else if (row.days_remaining <= 60) machineStatus = 'warning';

            // --- LOGIQUE METIER : Si RDV pris, on ignore l'alerte "Expiré" ---
            let score = 0;
            if (machineStatus === 'expired') score = 2;
            else if (machineStatus === 'warning') score = 1;

            // AJOUT: Si RDV prévu, on force le score à 0 (Vert)
            if (row.future_rdv_id) {
                score = 0;
                client.future_rdv_id = row.future_rdv_id;     // On stocke l'ID
                client.future_rdv_date = row.future_rdv_date; // On stocke la date
                machineStatus = 'planned'; // Nouveau statut interne
            }

            if (score > client.worst_status_score) {
                client.worst_status_score = score;
            }
            if (row.next_maintenance_date < client.earliest_date) {
                client.earliest_date = row.next_maintenance_date;
            }

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

        // Filtrage final
        let result = Array.from(clientsMap.values());

        if (status === 'expired') {
            result = result.filter(c => c.worst_status_score === 2);
        } else if (status === 'warning') {
            result = result.filter(c => c.worst_status_score === 1);
        } else if (status === 'ok') {
            result = result.filter(c => c.worst_status_score === 0);
        }

        result.sort((a, b) => {
            if (b.worst_status_score !== a.worst_status_score) {
                return b.worst_status_score - a.worst_status_score;
            }
            return a.earliest_date.localeCompare(b.earliest_date);
        });

        res.json({ data: result }); 
    });
});

// DANS server/routes/clients.js

// server/routes/clients.js

// 4. LISTE DES CLIENTS (ANNUAIRE) - AVEC FILTRE STATUT
router.get('/', requireAuth, (req, res) => {
    const { search, canton, category, sortBy, sortOrder, showHidden, status } = req.query;

    let where = ["1=1"];
    let params = [];
    let having = ""; // Pour filtrer sur les agrégations (RDV, Statuts)

    // Filtres de base
    if (showHidden !== 'true') where.push("(c.is_hidden = 0 OR c.is_hidden IS NULL)");
    
    if (search) {
        where.push(`(c.cabinet_name LIKE ? OR c.city LIKE ? OR c.contact_name LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s);
    }
    if (canton) { where.push("c.canton = ?"); params.push(canton); }
    if (category) { where.push("c.activity = ?"); params.push(category); }

    // Logique de tri
    let order = "c.cabinet_name ASC";
    if (sortBy) {
        const dir = sortOrder === 'desc' ? 'DESC' : 'ASC';
        const allowed = ['cabinet_name', 'city', 'appointment_at', 'created_at'];
        if (allowed.includes(sortBy)) order = `c.${sortBy} ${dir}`;
    }

    // Requête intelligente qui calcule le statut de chaque client
    const sql = `
        SELECT c.*, 
        
        -- Récupération des machines
        (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ';;') 
         FROM client_equipment ce 
         JOIN equipment_catalog ec ON ce.equipment_id = ec.id 
         WHERE ce.client_id = c.id) as equipment_summary,

        -- Vérification RDV Futur (1 = Oui, 0 = Non)
        EXISTS (
            SELECT 1 FROM appointments_history ah 
            WHERE ah.client_id = c.id AND ah.appointment_date >= date('now')
        ) as has_future_rdv,

        -- Vérification Urgence Maintenance (1 = Expiré, 0 = Non)
        EXISTS (
            SELECT 1 FROM client_equipment ce 
            WHERE ce.client_id = c.id AND ce.next_maintenance_date < date('now')
        ) as has_expired_machines

        FROM clients c 
        WHERE ${where.join(' AND ')} 
        GROUP BY c.id
        ${having}
        ORDER BY ${order}`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Filtrage PHP/JS style car SQL complexe sur statuts calculés
        let filteredRows = rows;
        if (status) {
            filteredRows = rows.filter(row => {
                if (status === 'planned') return row.has_future_rdv === 1;
                if (status === 'expired') return row.has_future_rdv === 0 && row.has_expired_machines === 1;
                // Note : Pour warning/ok c'est plus complexe à calculer ici sans alourdir la requête, 
                // mais 'planned' et 'expired' sont les plus critiques.
                return true;
            });
        }

        res.json({
            clients: filteredRows,
            count: filteredRows.length
        });
    });
});

router.put('/:id/toggle-hidden', requireAuth, (req, res) => {
    const { is_hidden } = req.body;
    db.run("UPDATE clients SET is_hidden = ? WHERE id = ?", [is_hidden, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ROUTE AJOUTÉE : Actions de groupe (Bulk Update)
// C'est celle qui manquait pour que la sélection multiple fonctionne !
router.put('/bulk-update', requireAuth, (req, res) => {
    const { ids, action } = req.body;
    
    // Sécurité : On vérifie que c'est bien un tableau
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Aucune sélection." });
    }

    let sql = "";
    // On construit une requête avec autant de "?" que d'IDs
    const placeholders = ids.map(() => '?').join(',');

    if (action === 'hide') {
        sql = `UPDATE clients SET is_hidden = 1 WHERE id IN (${placeholders})`;
    } else if (action === 'show') {
        sql = `UPDATE clients SET is_hidden = 0 WHERE id IN (${placeholders})`;
    } else if (action === 'delete') {
        sql = `DELETE FROM clients WHERE id IN (${placeholders})`;
    } else {
        return res.status(400).json({ error: "Action non reconnue." });
    }

    db.run(sql, ids, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, count: this.changes });
    });
});


// ==========================================
// 5. CRUD CLIENTS
// ==========================================

router.get('/:id', requireAuth, (req, res) => {
    const sql = `
        SELECT c.*,
        (SELECT appointment_date FROM appointments_history ah WHERE ah.client_id = c.id AND ah.appointment_date >= date('now') ORDER BY appointment_date ASC LIMIT 1) as next_rdv_date,
        (SELECT name FROM users u JOIN appointments_history ah ON u.id = ah.technician_id WHERE ah.client_id = c.id AND ah.appointment_date >= date('now') ORDER BY appointment_date ASC LIMIT 1) as next_rdv_tech
        FROM clients c WHERE c.id = ?
    `;
    db.get(sql, [req.params.id], (err, row) => {
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
    const sql = `
        SELECT ce.*, ec.name, ec.brand, ec.model, ec.type, 
        ec.is_secondary, -- <--- AJOUTER CETTE LIGNE
        (ec.name || ' ' || COALESCE(ec.model, '')) as final_name,
        ec.brand as final_brand,
        (julianday(ce.next_maintenance_date) - julianday('${today}')) as days_remaining
        FROM client_equipment ce
        JOIN equipment_catalog ec ON ce.equipment_id = ec.id
        WHERE ce.client_id = ?
        ORDER BY ce.location ASC, ce.next_maintenance_date ASC
    `;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ADD EQUIPMENT (POST)
router.post('/:id/equipment', requireAuth, (req, res) => {
    // MODIF : On récupère 'notes'
    const { equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, location, notes } = req.body;
    
    let nextDate = null;
    if (last_maintenance_date && maintenance_interval) {
        const d = new Date(last_maintenance_date);
        d.setFullYear(d.getFullYear() + parseInt(maintenance_interval));
        nextDate = d.toISOString().split('T')[0];
    }
    
    // MODIF SQL : Ajout de la colonne 'notes' et d'un '?' à la fin
    const sql = `INSERT INTO client_equipment (client_id, equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, next_maintenance_date, location, notes) VALUES (?,?,?,?,?,?,?,?,?)`;
    
    // MODIF RUN : Ajout de 'notes' dans le tableau
    db.run(sql, [req.params.id, equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, nextDate, location, notes], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.userId, 'add_equipment', 'client', req.params.id, { equipment_id });
        res.json({ id: this.lastID });
    });
});

// UPDATE EQUIPMENT (PUT)
router.put('/:clientId/equipment/:eqId', requireAuth, (req, res) => {
    // MODIF : On récupère 'notes'
    const { equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, location, notes } = req.body;
    
    let nextDate = null;
    if (last_maintenance_date && maintenance_interval) {
        const d = new Date(last_maintenance_date);
        d.setFullYear(d.getFullYear() + parseInt(maintenance_interval));
        nextDate = d.toISOString().split('T')[0];
    }
    
    // MODIF SQL : Ajout de 'notes=?'
    const sql = `UPDATE client_equipment SET equipment_id=?, serial_number=?, installed_at=?, last_maintenance_date=?, maintenance_interval=?, next_maintenance_date=?, location=?, notes=? WHERE id=? AND client_id=?`;
    
    // MODIF RUN : Ajout de 'notes' dans le tableau (Attention à l'ordre !)
    db.run(sql, [equipment_id, serial_number, installed_at, last_maintenance_date, maintenance_interval, nextDate, location, notes, req.params.eqId, req.params.clientId], function(err) {
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

// LISTER HISTORIQUE COMPLET (Rapports + RDV Multi-Tech)
router.get('/:id/appointments', requireAuth, (req, res) => {
  const sql = `
    -- 1. LES RAPPORTS (Signés/Archivés)
    SELECT 
        'report' as source_type, 
        r.id as id_unique,
        r.id as report_id,
        r.report_number, 
        r.technician_signature_date as appointment_date, 
        r.work_accomplished as task_description,
        u.name as tech_name, -- Auteur unique pour le rapport
        
        (SELECT group_concat(ec.name || ' (' || ec.brand || ')', ', ') 
         FROM report_equipment re 
         JOIN equipment_catalog ec ON re.equipment_id = ec.id 
         WHERE re.report_id = r.id) as machines

    FROM reports r 
    LEFT JOIN users u ON r.author_id = u.id
    WHERE r.client_id = ? AND r.status IN ('validated', 'archived')

    UNION ALL

    -- 2. LES RENDEZ-VOUS (Table Historique)
    SELECT 
        'rdv' as source_type, 
        ah.id as id_unique,
        ah.report_id as report_id,
        NULL as report_number, 
        ah.appointment_date, 
        ah.task_description,
        
        -- MODIFICATION ICI : On récupère tous les techniciens liés via la nouvelle table
        (SELECT group_concat(u.name, ', ') 
         FROM appointment_technicians at
         JOIN users u ON at.user_id = u.id 
         WHERE at.appointment_id = ah.id) as tech_name,
        
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

// CRÉATION RDV (Multi-Tech + Équipements)
router.post('/:id/appointments', requireAuth, (req, res) => {
    // On récupère technician_ids (tableau) et equipment_ids (tableau)
    const { appointment_date, technician_ids, task_description, equipment_ids } = req.body; 
    
    db.serialize(() => {
        // 1. Insertion RDV de base
        db.run("INSERT INTO appointments_history (client_id, appointment_date, task_description) VALUES (?, ?, ?)", 
        [req.params.id, appointment_date, task_description], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const rdvId = this.lastID;

            // 2. Insertion des techniciens (Multiples)
            if (Array.isArray(technician_ids) && technician_ids.length > 0) {
                const placeholders = technician_ids.map(() => '(?, ?)').join(',');
                const values = [];
                technician_ids.forEach(uid => { values.push(rdvId, uid); });
                
                db.run(`INSERT INTO appointment_technicians (appointment_id, user_id) VALUES ${placeholders}`, values);
            }

            // 3. Insertion des équipements (Si sélectionnés)
            if (Array.isArray(equipment_ids) && equipment_ids.length > 0) { 
                 const placeholders = equipment_ids.map(() => '(?, ?)').join(','); 
                 const values = []; 
                 equipment_ids.forEach(eid => { values.push(rdvId, eid); }); 
                 
                 db.run(`INSERT INTO appointment_equipment (appointment_id, equipment_id) VALUES ${placeholders}`, values); 
            }
            
            // 4. Mise à jour cache date client
            db.run("UPDATE clients SET appointment_at = ? WHERE id = ?", [appointment_date, req.params.id]);
            
            res.json({ message: "RDV créé", id: rdvId });
        });
    });
});

// Supprimer un RDV (depuis le bouton "Annuler")
router.delete('/appointments/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM appointments_history WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "RDV supprimé" });
    });
});

// Récupérer un RDV (Avec les IDs multiples pour pré-remplir le selecteur)
router.get('/appointments/:id', requireAuth, (req, res) => {
    const sql = `
        SELECT ah.*, 
        (SELECT group_concat(user_id) FROM appointment_technicians WHERE appointment_id = ah.id) as technician_ids
        FROM appointments_history ah 
        WHERE id = ?`;
    
    db.get(sql, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "RDV introuvable" });
        // Conversion "1,2" -> [1, 2] pour le frontend
        row.technician_ids = row.technician_ids ? row.technician_ids.split(',').map(Number) : [];
        res.json(row);
    });
});

// Mise à jour RDV (Multi-Tech)
router.put('/appointments/:id', requireAuth, (req, res) => {
    const { appointment_date, technician_ids, task_description } = req.body;
    
    db.serialize(() => {
        // Update infos de base
        db.run("UPDATE appointments_history SET appointment_date = ?, task_description = ? WHERE id = ?", 
            [appointment_date, task_description, req.params.id]);

        // Reset et réinsertion des techniciens
        db.run("DELETE FROM appointment_technicians WHERE appointment_id = ?", [req.params.id]);

        if (Array.isArray(technician_ids) && technician_ids.length > 0) {
            const placeholders = technician_ids.map(() => '(?, ?)').join(',');
            const values = [];
            technician_ids.forEach(uid => { values.push(req.params.id, uid); });
            
            db.run(`INSERT INTO appointment_technicians (appointment_id, user_id) VALUES ${placeholders}`, values);
        }

        // Mise à jour cache client
        db.get("SELECT client_id FROM appointments_history WHERE id = ?", [req.params.id], (err, row) => {
            if(row) db.run("UPDATE clients SET appointment_at = ? WHERE id = ?", [appointment_date, row.client_id]);
            res.json({ message: "RDV mis à jour" });
        });
    });
});



module.exports = router;