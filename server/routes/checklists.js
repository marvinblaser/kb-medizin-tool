// server/routes/checklists.js

const express = require('express');
const { db } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// --- AUTO-RÉPARATION DE LA BASE DE DONNÉES ---
// Ce bloc vérifie si les colonnes manquantes existent et les ajoute si nécessaire.
db.serialize(() => {
    db.all("PRAGMA table_info(checklists)", (err, columns) => {
        if (err) {
            console.error("Erreur vérification schéma checklists:", err);
            return;
        }
        
        // 1. Vérification de la colonne 'category'
        const hasCategory = columns.some(col => col.name === 'category');
        if (!hasCategory) {
            console.log("MIGRATION BDD: Ajout de la colonne 'category' à la table checklists...");
            db.run("ALTER TABLE checklists ADD COLUMN category TEXT DEFAULT 'Autre'", (err) => {
                if (err) console.error("Erreur ajout colonne category:", err.message);
                else console.log("Succès: Colonne 'category' ajoutée.");
            });
        }

        // 2. Vérification de la colonne 'updated_by_user_id'
        const hasUpdatedBy = columns.some(col => col.name === 'updated_by_user_id');
        if (!hasUpdatedBy) {
            console.log("MIGRATION BDD: Ajout de la colonne 'updated_by_user_id'...");
            db.run("ALTER TABLE checklists ADD COLUMN updated_by_user_id INTEGER", (err) => {
                if (err) console.error("Erreur ajout colonne updated_by_user_id:", err.message);
                else console.log("Succès: Colonne 'updated_by_user_id' ajoutée.");
            });
        }
    });
});
// ---------------------------------------------

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
      if (err) {
          console.error("Erreur GET Checklists:", err.message);
          // Si la colonne n'existe pas encore (race condition au démarrage), on renvoie un tableau vide temporairement
          return res.json([]); 
      }
      res.json(rows || []);
    }
  );
});

// GET /api/checklists/:id
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM checklists WHERE id = ?', [id], (err, checklist) => {
    if (err) {
        console.error("Erreur GET Checklist ID:", err.message);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (!checklist) return res.status(404).json({ error: 'Checklist non trouvée' });

    db.all('SELECT * FROM checklist_equipment WHERE checklist_id = ?', [id], (err, equipment) => {
      if (err) return res.status(500).json({ error: 'Erreur équipement' });
      
      db.all('SELECT * FROM checklist_tasks WHERE checklist_id = ? ORDER BY task_order ASC', [id], (err, tasks) => {
        if (err) return res.status(500).json({ error: 'Erreur tâches' });
        
        res.json({ ...checklist, equipment, tasks });
      });
    });
  });
});

// POST /api/checklists (Création)
router.post('/', requireAuth, (req, res) => {
  const { name, description, category, equipment, tasks } = req.body;
  const userId = req.session.userId;

  if (!name) return res.status(400).json({ error: 'Le nom est obligatoire' });

  db.run(
    `INSERT INTO checklists (name, description, category, updated_by_user_id, created_at, updated_at) 
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [name, description || '', category || 'Autre', userId],
    function (err) {
      if (err) {
          console.error("Erreur Création Checklist:", err.message);
          return res.status(500).json({ error: "Erreur base de données: " + err.message });
      }
      
      const checklistId = this.lastID;

      db.serialize(() => {
          if (equipment && Array.isArray(equipment) && equipment.length > 0) {
            const stmt = db.prepare('INSERT INTO checklist_equipment (checklist_id, equipment_name, quantity) VALUES (?, ?, ?)');
            equipment.forEach(eq => {
                if (eq.equipment_name) {
                    stmt.run(checklistId, eq.equipment_name, eq.quantity || 1);
                }
            });
            stmt.finalize();
          }

          if (tasks && Array.isArray(tasks) && tasks.length > 0) {
            const stmt = db.prepare('INSERT INTO checklist_tasks (checklist_id, task_name, task_order) VALUES (?, ?, ?)');
            tasks.forEach((task, index) => {
                if (task.task_name) {
                    stmt.run(checklistId, task.task_name, index);
                }
            });
            stmt.finalize();
          }
      });
      
      db.run(
        'INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)',
        [userId, 'create', 'checklist', checklistId, JSON.stringify({ name })]
      );

      res.json({ success: true, id: checklistId });
    }
  );
});

// PUT /api/checklists/:id (Mise à jour)
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { name, description, category, equipment, tasks } = req.body;
  const userId = req.session.userId;

  if (!name) return res.status(400).json({ error: 'Le nom est obligatoire' });

  db.run(
    `UPDATE checklists SET name = ?, description = ?, category = ?, updated_by_user_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [name, description || '', category || 'Autre', userId, id],
    function (err) {
      if (err) {
          console.error("Erreur Update Checklist:", err.message);
          return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
      }

      db.serialize(() => {
          db.run('DELETE FROM checklist_equipment WHERE checklist_id = ?', [id]);
          db.run('DELETE FROM checklist_tasks WHERE checklist_id = ?', [id]);

          if (equipment && Array.isArray(equipment) && equipment.length > 0) {
            const stmt = db.prepare('INSERT INTO checklist_equipment (checklist_id, equipment_name, quantity) VALUES (?, ?, ?)');
            equipment.forEach(eq => {
                if(eq.equipment_name) stmt.run(id, eq.equipment_name, eq.quantity || 1);
            });
            stmt.finalize();
          }

          if (tasks && Array.isArray(tasks) && tasks.length > 0) {
            const stmt = db.prepare('INSERT INTO checklist_tasks (checklist_id, task_name, task_order) VALUES (?, ?, ?)');
            tasks.forEach((task, index) => {
                if(task.task_name) stmt.run(id, task.task_name, index);
            });
            stmt.finalize();
          }
      });

      db.run(
        'INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)',
        [userId, 'update', 'checklist', id, JSON.stringify({ name })]
      );

      res.json({ success: true });
    }
  );
});

// DELETE /api/checklists/:id
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM checklists WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Erreur lors de la suppression' });
    
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