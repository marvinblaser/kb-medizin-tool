// server/routes/checklists.js

const express = require('express');
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/checklists
router.get('/', requireAuth, (req, res) => {
  db.all(
    `SELECT c.*, 
      (SELECT COUNT(*) FROM checklist_equipment WHERE checklist_id = c.id) as equipment_count,
      (SELECT COUNT(*) FROM checklist_tasks WHERE checklist_id = c.id) as tasks_count,
      u.name as updated_by
    FROM checklists c
    LEFT JOIN users u ON c.updated_by_user_id = u.id
    ORDER BY c.updated_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      res.json(rows || []);
    }
  );
});

// GET /api/checklists/:id
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM checklists WHERE id = ?', [id], (err, checklist) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    if (!checklist) return res.status(404).json({ error: 'Checklist non trouvée' });
    
    // Récupérer équipements
    db.all('SELECT * FROM checklist_equipment WHERE checklist_id = ? ORDER BY equipment_order, id', [id], (err, equipment) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      
      // Récupérer tâches
      db.all('SELECT * FROM checklist_tasks WHERE checklist_id = ? ORDER BY task_order, id', [id], (err, tasks) => {
        if (err) return res.status(500).json({ error: 'Erreur serveur' });
        
        res.json({
          ...checklist,
          equipment: equipment || [],
          tasks: tasks || []
        });
      });
    });
  });
});

// PUT /api/checklists/:id
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  // Ajout de 'category' ici
  const { name, description, category, equipment, tasks } = req.body;
  
  // Update avec category
  db.run(
    'UPDATE checklists SET name = ?, description = ?, category = ?, updated_at = CURRENT_TIMESTAMP, updated_by_user_id = ? WHERE id = ?',
    [name, description, category || 'Autre', req.session.userId, id],
    function (err) {
      if (err) {
        console.error('❌ Erreur UPDATE checklist:', err);
        return res.status(500).json({ error: 'Erreur lors de la modification' });
      }
      
      // Suppression anciens items pour les recréer (méthode simple)
      db.run('DELETE FROM checklist_equipment WHERE checklist_id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Erreur suppression équipements' });
        
        db.run('DELETE FROM checklist_tasks WHERE checklist_id = ?', [id], (err) => {
          if (err) return res.status(500).json({ error: 'Erreur suppression tâches' });
          
          // Réinsertion Equipements
          const validEquipment = equipment && equipment.length > 0 
            ? equipment.filter(eq => eq.equipment_name && eq.equipment_name.trim() !== '') 
            : [];
          
          if (validEquipment.length > 0) {
            const stmtEq = db.prepare('INSERT INTO checklist_equipment (checklist_id, equipment_name, quantity, equipment_order) VALUES (?, ?, ?, ?)');
            validEquipment.forEach((eq, idx) => {
              stmtEq.run(id, eq.equipment_name.trim(), eq.quantity || 1, idx);
            });
            stmtEq.finalize();
          }

          // Réinsertion Tâches
          const validTasks = tasks && tasks.length > 0 
            ? tasks.filter(task => task.task_name && task.task_name.trim() !== '') 
            : [];
            
          if (validTasks.length > 0) {
            const stmtTask = db.prepare('INSERT INTO checklist_tasks (checklist_id, task_name, task_order) VALUES (?, ?, ?)');
            validTasks.forEach((task, idx) => {
              stmtTask.run(id, task.task_name.trim(), idx);
            });
            stmtTask.finalize();
          }

          // Log
          db.run(
            'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
            [req.session.userId, 'update', 'checklist', id],
            (err) => {
              res.json({ success: true });
            }
          );
        });
      });
    }
  );
});

// POST /api/checklists
router.post('/', requireAuth, (req, res) => {
  // Ajout de 'category' ici
  const { name, description, category, equipment, tasks } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Nom requis' });
  }
  
  db.run(
    'INSERT INTO checklists (name, description, category, updated_by_user_id) VALUES (?, ?, ?, ?)',
    [name, description || null, category || 'Autre', req.session.userId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erreur lors de la création' });
      
      const checklistId = this.lastID;
      
      const validEquipment = equipment && equipment.length > 0
        ? equipment.filter(eq => eq.equipment_name && eq.equipment_name.trim() !== '')
        : [];
      
      if (validEquipment.length > 0) {
        const stmt = db.prepare('INSERT INTO checklist_equipment (checklist_id, equipment_name, quantity, equipment_order) VALUES (?, ?, ?, ?)');
        validEquipment.forEach((eq, idx) => {
          stmt.run(checklistId, eq.equipment_name.trim(), eq.quantity || 1, idx);
        });
        stmt.finalize();
      }
      
      const validTasks = tasks && tasks.length > 0
        ? tasks.filter(task => task.task_name && task.task_name.trim() !== '')
        : [];
      
      if (validTasks.length > 0) {
        const stmt = db.prepare('INSERT INTO checklist_tasks (checklist_id, task_name, task_order) VALUES (?, ?, ?)');
        validTasks.forEach((task, index) => {
          stmt.run(checklistId, task.task_name.trim(), index);
        });
        stmt.finalize();
      }
      
      db.run(
        'INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)',
        [req.session.userId, 'create', 'checklist', checklistId, JSON.stringify({ name })],
        () => {
          res.json({ success: true, id: checklistId });
        }
      );
    }
  );
});

// DELETE /api/checklists/:id
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM checklists WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Erreur lors de la suppression' });
    
    // Nettoyage en cascade manuel si pas de foreign keys
    db.run('DELETE FROM checklist_equipment WHERE checklist_id = ?', [id]);
    db.run('DELETE FROM checklist_tasks WHERE checklist_id = ?', [id]);
    
    db.run(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
      [req.session.userId, 'delete', 'checklist', id]
    );
    
    res.json({ success: true });
  });
});

module.exports = router;