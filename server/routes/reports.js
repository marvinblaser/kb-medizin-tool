const express = require('express');
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports - Liste des rapports
router.get('/', requireAuth, (req, res) => {
  const { page = 1, limit = 25, search = '', status = '', type = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let conditions = [];
  let params = [];
  
  if (search) {
    conditions.push('(r.cabinet_name LIKE ? OR r.report_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  
  if (type) {
    conditions.push('r.work_type = ?');
    params.push(type);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  db.get(`SELECT COUNT(*) as total FROM reports r ${whereClause}`, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    
    const total = countRow.total;
    
    db.all(
      `SELECT r.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM report_technicians WHERE report_id = r.id) as technicians_count,
        (SELECT SUM(total_price) FROM report_materials WHERE report_id = r.id) as materials_total
      FROM reports r
      LEFT JOIN users u ON r.created_by = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset],
      (err, reports) => {
        if (err) return res.status(500).json({ error: 'Erreur serveur' });
        
        res.json({
          reports: reports || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        });
      }
    );
  });
});

// GET /api/reports/:id - Détails d'un rapport
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM reports WHERE id = ?', [id], (err, report) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    if (!report) return res.status(404).json({ error: 'Rapport non trouvé' });
    
    // Charger les intervenants
    db.all('SELECT * FROM report_technicians WHERE report_id = ? ORDER BY work_date', [id], (err, technicians) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      
      // Charger le matériel
      db.all('SELECT * FROM report_materials WHERE report_id = ?', [id], (err, materials) => {
        if (err) return res.status(500).json({ error: 'Erreur serveur' });
        
        // Charger les tests STK
        db.all('SELECT * FROM report_stk_tests WHERE report_id = ?', [id], (err, stkTests) => {
          if (err) return res.status(500).json({ error: 'Erreur serveur' });
          
          res.json({
            ...report,
            technicians: technicians || [],
            materials: materials || [],
            stk_tests: stkTests || []
          });
        });
      });
    });
  });
});

// POST /api/reports - Créer un rapport
router.post('/', requireAuth, (req, res) => {
  const {
    work_type,
    client_id,
    cabinet_name,
    address,
    postal_code,
    city,
    interlocutor,
    installation,
    work_accomplished,
    travel_location,
    travel_costs,
    travel_included,
    remarks,
    status,
    technicians,
    materials,
    stk_tests
  } = req.body;
  
  // Générer automatiquement les dates de signature
  const currentDate = new Date().toISOString().split('T')[0];
  const techSignatureDate = (status === 'completed' || status === 'sent') ? currentDate : null;
  const clientSignatureDate = (status === 'sent') ? currentDate : null;
  
  // Générer le préfixe selon le type de travail
  const year = new Date().getFullYear();
  let prefix;
  
  switch(work_type) {
    case 'Re-validation':
    case 'Première validation':
      prefix = 'RV';
      break;
    case 'Service d\'entretien':
      prefix = 'SE';
      break;
    case 'Réparation':
    case 'Réparation / Garantie':
      prefix = 'RE';
      break;
    case 'Mise en marche':
    case 'Montage':
    case 'Installation':
      prefix = 'IN';
      break;
    case 'Contrôle':
      prefix = 'CO';
      break;
    case 'Instruction':
      prefix = 'IT';
      break;
    default:
      prefix = 'RP'; // Rapport générique
  }
  
  db.get(
    `SELECT MAX(CAST(SUBSTR(report_number, -4) AS INTEGER)) as last_num 
     FROM reports WHERE report_number LIKE ?`,
    [`${prefix}-${year}-%`],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      
      const nextNum = (row?.last_num || 0) + 1;
      const report_number = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
      
      db.run(
        `INSERT INTO reports (
          report_number, client_id, cabinet_name, address, postal_code, city,
          interlocutor, work_type, installation, work_accomplished, 
          travel_location, travel_costs, travel_included, remarks, status, 
          technician_signature_date, client_signature_date, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          report_number, client_id, cabinet_name, address, postal_code, city,
          interlocutor, work_type, installation, work_accomplished,
          travel_location, travel_costs || 0, travel_included ? 1 : 0, remarks, status || 'draft',
          techSignatureDate, clientSignatureDate,
          req.session.userId
        ],
        function(err) {
          if (err) {
            console.error('Erreur création rapport:', err);
            return res.status(500).json({ error: 'Erreur lors de la création' });
          }
          
          const reportId = this.lastID;
          
          // Insérer les intervenants
          if (technicians && technicians.length > 0) {
            const stmt = db.prepare(
              'INSERT INTO report_technicians (report_id, technician_id, technician_name, work_date, hours_normal, hours_extra) VALUES (?, ?, ?, ?, ?, ?)'
            );
            technicians.forEach(tech => {
              stmt.run(reportId, tech.technician_id, tech.technician_name, tech.work_date, tech.hours_normal || 0, tech.hours_extra || 0);
            });
            stmt.finalize();
          }
          
          // Insérer le matériel
          if (materials && materials.length > 0) {
            const stmt = db.prepare(
              'INSERT INTO report_materials (report_id, material_id, material_name, product_code, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            materials.forEach(mat => {
              stmt.run(reportId, mat.material_id, mat.material_name, mat.product_code, mat.quantity || 1, mat.unit_price || 0, mat.total_price || 0);
            });
            stmt.finalize();
          }
          
          // Insérer les tests STK
          if (stk_tests && stk_tests.length > 0) {
            const stmt = db.prepare(
              'INSERT INTO report_stk_tests (report_id, test_name, price, included) VALUES (?, ?, ?, ?)'
            );
            stk_tests.forEach(test => {
              stmt.run(reportId, test.test_name, test.price || 0, test.included ? 1 : 0);
            });
            stmt.finalize();
          }
          
          db.run(
            'INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)',
            [req.session.userId, 'create', 'report', reportId, JSON.stringify({ report_number })],
            () => {
              res.json({ success: true, id: reportId, report_number });
            }
          );
        }
      );
    }
  );
});

// PUT /api/reports/:id - Modifier un rapport
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    cabinet_name,
    address,
    postal_code,
    city,
    interlocutor,
    work_type,
    installation,
    work_accomplished,
    travel_location,
    travel_costs,
    travel_included,
    remarks,
    status,
    technicians,
    materials,
    stk_tests
  } = req.body;
  
  // Récupérer l'ancien statut pour savoir si on doit ajouter les dates
  db.get('SELECT status FROM reports WHERE id = ?', [id], (err, oldReport) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    
    const currentDate = new Date().toISOString().split('T')[0];
    let techSignatureDate = null;
    let clientSignatureDate = null;
    
    // Générer les dates uniquement si le statut change
    if (oldReport && oldReport.status === 'draft') {
      if (status === 'completed' || status === 'sent') {
        techSignatureDate = currentDate;
      }
      if (status === 'sent') {
        clientSignatureDate = currentDate;
      }
    }
    
    // Construire la requête SQL en fonction de si on met à jour les dates ou non
    let sql, params;
    
    if (techSignatureDate || clientSignatureDate) {
      sql = `UPDATE reports SET 
        cabinet_name = ?, address = ?, postal_code = ?, city = ?, interlocutor = ?,
        work_type = ?, installation = ?, work_accomplished = ?, 
        travel_location = ?, travel_costs = ?, travel_included = ?,
        remarks = ?, status = ?,
        technician_signature_date = COALESCE(technician_signature_date, ?),
        client_signature_date = COALESCE(client_signature_date, ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`;
      params = [cabinet_name, address, postal_code, city, interlocutor, work_type, installation, 
               work_accomplished, travel_location, travel_costs || 0, travel_included ? 1 : 0, 
               remarks, status || 'draft', techSignatureDate, clientSignatureDate, id];
    } else {
      sql = `UPDATE reports SET 
        cabinet_name = ?, address = ?, postal_code = ?, city = ?, interlocutor = ?,
        work_type = ?, installation = ?, work_accomplished = ?, 
        travel_location = ?, travel_costs = ?, travel_included = ?,
        remarks = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`;
      params = [cabinet_name, address, postal_code, city, interlocutor, work_type, installation, 
               work_accomplished, travel_location, travel_costs || 0, travel_included ? 1 : 0, 
               remarks, status || 'draft', id];
    }
    
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Erreur mise à jour rapport:', err);
        return res.status(500).json({ error: 'Erreur lors de la modification' });
      }
      
      // Supprimer et réinsérer les intervenants
      db.run('DELETE FROM report_technicians WHERE report_id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Erreur mise à jour intervenants' });
        
        if (technicians && technicians.length > 0) {
          const stmt = db.prepare(
            'INSERT INTO report_technicians (report_id, technician_id, technician_name, work_date, hours_normal, hours_extra) VALUES (?, ?, ?, ?, ?, ?)'
          );
          technicians.forEach(tech => {
            stmt.run(id, tech.technician_id, tech.technician_name, tech.work_date, tech.hours_normal || 0, tech.hours_extra || 0);
          });
          stmt.finalize();
        }
      });
      
      // Supprimer et réinsérer le matériel
      db.run('DELETE FROM report_materials WHERE report_id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Erreur mise à jour matériel' });
        
        if (materials && materials.length > 0) {
          const stmt = db.prepare(
            'INSERT INTO report_materials (report_id, material_id, material_name, product_code, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)'
          );
          materials.forEach(mat => {
            stmt.run(id, mat.material_id, mat.material_name, mat.product_code, mat.quantity || 1, mat.unit_price || 0, mat.total_price || 0);
          });
          stmt.finalize();
        }
      });
      
      // Supprimer et réinsérer les tests STK
      db.run('DELETE FROM report_stk_tests WHERE report_id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Erreur mise à jour tests STK' });
        
        if (stk_tests && stk_tests.length > 0) {
          const stmt = db.prepare(
            'INSERT INTO report_stk_tests (report_id, test_name, price, included) VALUES (?, ?, ?, ?)'
          );
          stk_tests.forEach(test => {
            stmt.run(id, test.test_name, test.price || 0, test.included ? 1 : 0);
          });
          stmt.finalize();
        }
      });
      
      db.run(
        'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
        [req.session.userId, 'update', 'report', id]
      );
      
      res.json({ success: true });
    });
  });
});

// DELETE /api/reports/:id - Supprimer un rapport
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM reports WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: 'Erreur lors de la suppression' });
    
    db.run(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
      [req.session.userId, 'delete', 'report', id]
    );
    
    res.json({ success: true });
  });
});

module.exports = router;