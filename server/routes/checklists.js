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
    
    // MODIFIÉ : Trier par equipment_order
    db.all('SELECT * FROM checklist_equipment WHERE checklist_id = ? ORDER BY equipment_order, id', [id], (err, equipment) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      
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
  const { name, description, equipment, tasks } = req.body;
  
  console.log('📥 Réception PUT /api/checklists/' + id);
  console.log('  Equipment:', equipment);
  console.log('  Tasks:', tasks);
  
  db.run(
    'UPDATE checklists SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP, updated_by_user_id = ? WHERE id = ?',
    [name, description, req.session.userId, id],
    function (err) {
      if (err) {
        console.error('❌ Erreur UPDATE checklist:', err);
        return res.status(500).json({ error: 'Erreur lors de la modification' });
      }
      
      console.log('✅ Checklist mise à jour');
      
      db.run('DELETE FROM checklist_equipment WHERE checklist_id = ?', [id], (err) => {
        if (err) {
          console.error('❌ Erreur DELETE equipment:', err);
          return res.status(500).json({ error: 'Erreur suppression équipements' });
        }
        
        console.log('✅ Anciens équipements supprimés');
        
        db.run('DELETE FROM checklist_tasks WHERE checklist_id = ?', [id], (err) => {
          if (err) {
            console.error('❌ Erreur DELETE tasks:', err);
            return res.status(500).json({ error: 'Erreur suppression tâches' });
          }
          
          console.log('✅ Anciennes tâches supprimées');
          
          // Insérer les nouveaux équipements AVEC L'ORDRE
          const validEquipment = equipment && equipment.length > 0 
            ? equipment.filter(eq => eq.equipment_name && eq.equipment_name.trim() !== '') 
            : [];
          
          console.log(`📦 Insertion de ${validEquipment.length} équipements`);
          
          if (validEquipment.length > 0) {
            const stmtEq = db.prepare('INSERT INTO checklist_equipment (checklist_id, equipment_name, quantity, equipment_order) VALUES (?, ?, ?, ?)');
            validEquipment.forEach((eq, idx) => {
              stmtEq.run(id, eq.equipment_name.trim(), eq.quantity || 1, idx, (err) => {
                if (err) console.error(`❌ Erreur insert equipment ${idx}:`, err);
                else console.log(`  ✅ Équipement ${idx} inséré (ordre: ${idx})`);
              });
            });
            stmtEq.finalize((err) => {
              if (err) console.error('❌ Erreur finalize equipment:', err);
              else console.log('✅ Tous les équipements insérés');
              
              insertTasks();
            });
          } else {
            insertTasks();
          }
          
          function insertTasks() {
            const validTasks = tasks && tasks.length > 0 
              ? tasks.filter(task => task.task_name && task.task_name.trim() !== '') 
              : [];
            
            console.log(`📋 Insertion de ${validTasks.length} tâches`);
            
            if (validTasks.length > 0) {
              const stmtTask = db.prepare('INSERT INTO checklist_tasks (checklist_id, task_name, task_order) VALUES (?, ?, ?)');
              validTasks.forEach((task, idx) => {
                stmtTask.run(id, task.task_name.trim(), idx, (err) => {
                  if (err) console.error(`❌ Erreur insert task ${idx}:`, err);
                  else console.log(`  ✅ Tâche ${idx} insérée: "${task.task_name}" (ordre: ${idx})`);
                });
              });
              stmtTask.finalize((err) => {
                if (err) {
                  console.error('❌ Erreur finalize tasks:', err);
                  return res.status(500).json({ error: 'Erreur insertion tâches' });
                }
                
                console.log('✅ Toutes les tâches insérées');
                
                db.run(
                  'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
                  [req.session.userId, 'update', 'checklist', id],
                  (err) => {
                    if (err) console.error('❌ Erreur log:', err);
                    
                    console.log('🎉 Sauvegarde terminée avec succès');
                    res.json({ success: true });
                  }
                );
              });
            } else {
              console.log('ℹ️ Aucune tâche à insérer');
              
              db.run(
                'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
                [req.session.userId, 'update', 'checklist', id],
                (err) => {
                  if (err) console.error('❌ Erreur log:', err);
                  
                  console.log('🎉 Sauvegarde terminée avec succès');
                  res.json({ success: true });
                }
              );
            }
          }
        });
      });
    }
  );
});

// POST /api/checklists
router.post('/', requireAuth, (req, res) => {
  const { name, description, equipment, tasks, updated_by } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Nom requis' });
  }
  
  db.run(
    'INSERT INTO checklists (name, description, updated_by_user_id) VALUES (?, ?, ?)',
    [name, description || null, req.session.userId],
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
    
    db.run(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
      [req.session.userId, 'delete', 'checklist', id]
    );
    
    res.json({ success: true });
  });
});

module.exports = router;