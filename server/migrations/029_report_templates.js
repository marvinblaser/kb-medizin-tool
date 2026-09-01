// server/migrations/029_report_templates.js
// Bibliothèque de modèles de rapport (« rapports prédéfinis »).
// Un modèle = un paquet de contenu générique (lignes de travaux, tests STK,
// matériel type, texte d'installation, remarques) rangé par type d'intervention
// + machine. Il n'est JAMAIS appliqué automatiquement : l'utilisateur choisit
// depuis l'éditeur de rapport lequel appliquer. Alimenté par tous les auteurs
// de rapports (création directe ou « Enregistrer comme modèle » depuis un
// rapport existant).

module.exports = {
  id: '029_report_templates',
  up(db, callback) {
    db.run(
      `CREATE TABLE IF NOT EXISTS report_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        work_types TEXT,                       -- csv : "Service d'entretien,Contrôle"
        device_type TEXT,                      -- libellé (device_types.name) ou NULL
        equipment_catalog_id INTEGER,          -- modèle précis ou NULL
        language TEXT,                         -- 'fr' | 'de' | NULL (les deux)
        suggested_title TEXT,
        installation_text TEXT,
        remarks TEXT,
        work_lines_json TEXT NOT NULL DEFAULT '[]',
        stk_tests_json TEXT NOT NULL DEFAULT '[]',
        materials_json TEXT NOT NULL DEFAULT '[]',
        author_id INTEGER,
        is_shared INTEGER NOT NULL DEFAULT 1,  -- 1 = bibliothèque commune, 0 = brouillon perso
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        archived_at TEXT,
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (equipment_catalog_id) REFERENCES equipment_catalog(id) ON DELETE SET NULL
      )`,
      (err) => {
        if (err) return callback(err);
        db.run(
          'CREATE INDEX IF NOT EXISTS idx_report_templates_scope ON report_templates (archived_at, language, device_type, equipment_catalog_id)',
          (err2) => callback(err2 || null)
        );
      }
    );
  }
};
