// server/routes/report-templates.js
// CRUD de la bibliothèque de modèles de rapport. Voir migration 029.
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireStaff, requireRoles } = require('../middleware/auth');
const { toInt } = require('../utils/validators');
const log = require('../utils/logger');

// Rôles autorisés à créer / modifier des modèles = ceux qui rédigent des rapports.
const TEMPLATE_AUTHORS = ['admin', 'tech', 'secretary'];

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));

// ─── Normalisation ───────────────────────────────────────────────────────────
const parseJson = (str, fallback) => {
  try { const v = JSON.parse(str); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
};

// Nettoie/verrouille la forme des lignes reçues du client (défense en profondeur).
// Les lignes vides intérieures sont CONSERVÉES (= saut de ligne volontaire) ;
// seules les lignes vides en fin de liste sont retirées.
const cleanWorkLines = (arr) => {
  const lines = (Array.isArray(arr) ? arr : [])
    .map((l) => String(l == null ? '' : l).replace(/\s+$/, '').slice(0, 500))
    .slice(0, 200);
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
};

const cleanStk = (arr) => (Array.isArray(arr) ? arr : [])
  .map((t) => ({
    device_name: String(t.device_name || '').slice(0, 200),
    price:       Number(t.price) || 0,
    discount:    Math.max(0, Math.min(100, Number(t.discount) || 0)),
    included:    !!t.included,
  }))
  .filter((t) => t.device_name.trim() !== '')
  .slice(0, 100);

const cleanMaterials = (arr) => (Array.isArray(arr) ? arr : [])
  .map((m) => ({
    material_id:   toInt(m.material_id) || null,
    material_name: String(m.material_name || '').slice(0, 200),
    product_code:  String(m.product_code || '').slice(0, 80),
    quantity:      Number(m.quantity) || 1,
    unit_price:    Number(m.unit_price) || 0,
    discount:      Math.max(0, Math.min(100, Number(m.discount) || 0)),
    included:      !!m.included,
  }))
  .filter((m) => m.material_name.trim() !== '' || m.product_code.trim() !== '')
  .slice(0, 200);

const normWorkTypes = (v) => {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(list.map((s) => String(s).trim()).filter(Boolean))].join(',');
};

const hydrate = (row) => {
  if (!row) return row;
  row.work_lines = parseJson(row.work_lines_json, []);
  row.stk_tests  = parseJson(row.stk_tests_json, []);
  row.materials  = parseJson(row.materials_json, []);
  row.work_types_list = row.work_types ? row.work_types.split(',').filter(Boolean) : [];
  delete row.work_lines_json; delete row.stk_tests_json; delete row.materials_json;
  return row;
};

// ─── LISTE ───────────────────────────────────────────────────────────────────
router.get('/', requireStaff, async (req, res, next) => {
  try {
    const { search, work_type, device_type, equipment_catalog_id, language, mine, include_archived } = req.query;
    const where = [];
    const params = [];

    if (!include_archived || include_archived === '0') where.push('t.archived_at IS NULL');
    // Visibilité : les modèles partagés OU ses propres brouillons perso.
    where.push('(t.is_shared = 1 OR t.author_id = ?)');
    params.push(req.session.userId);

    if (mine === '1') { where.push('t.author_id = ?'); params.push(req.session.userId); }
    if (search) {
      where.push('(t.name LIKE ? OR t.description LIKE ?)');
      const s = `%${search}%`; params.push(s, s);
    }
    if (work_type)  { where.push("(',' || t.work_types || ',') LIKE ?"); params.push(`%,${work_type},%`); }
    if (device_type) { where.push('t.device_type = ?'); params.push(device_type); }
    if (equipment_catalog_id) { where.push('t.equipment_catalog_id = ?'); params.push(toInt(equipment_catalog_id)); }
    if (language) { where.push('(t.language = ? OR t.language IS NULL)'); params.push(language); }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await all(
      `SELECT t.*,
              COALESCE(u.name, '—') AS author_name,
              ec.brand AS eq_brand, ec.model AS eq_model, ec.name AS eq_name
       FROM report_templates t
       LEFT JOIN users u ON u.id = t.author_id
       LEFT JOIN equipment_catalog ec ON ec.id = t.equipment_catalog_id
       ${whereSQL}
       ORDER BY t.usage_count DESC, t.updated_at DESC`,
      params
    );
    res.json(rows.map(hydrate));
  } catch (e) { next(e); }
});

// ─── DÉTAIL ──────────────────────────────────────────────────────────────────
router.get('/:id', requireStaff, async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide.' });
    const row = await get(
      `SELECT t.*, COALESCE(u.name,'—') AS author_name,
              ec.brand AS eq_brand, ec.model AS eq_model, ec.name AS eq_name
       FROM report_templates t
       LEFT JOIN users u ON u.id = t.author_id
       LEFT JOIN equipment_catalog ec ON ec.id = t.equipment_catalog_id
       WHERE t.id = ?`, [id]);
    if (!row) return res.status(404).json({ error: 'Modèle introuvable.' });
    if (!row.is_shared && row.author_id !== req.session.userId) {
      return res.status(403).json({ error: 'Ce modèle est privé.' });
    }
    res.json(hydrate(row));
  } catch (e) { next(e); }
});

// ─── Corps commun create / update ────────────────────────────────────────────
const buildPayload = (body) => ({
  name:            String(body.name || '').trim().slice(0, 160),
  description:     String(body.description || '').trim().slice(0, 500) || null,
  work_types:      normWorkTypes(body.work_types),
  device_type:     body.device_type ? String(body.device_type).trim().slice(0, 120) : null,
  equipment_catalog_id: toInt(body.equipment_catalog_id) || null,
  language:        ['fr', 'de'].includes(body.language) ? body.language : null,
  suggested_title: String(body.suggested_title || '').trim().slice(0, 200) || null,
  installation_text: String(body.installation_text || '').trim().slice(0, 4000) || null,
  remarks:         String(body.remarks || '').trim().slice(0, 4000) || null,
  work_lines_json: JSON.stringify(cleanWorkLines(body.work_lines)),
  stk_tests_json:  JSON.stringify(cleanStk(body.stk_tests)),
  materials_json:  JSON.stringify(cleanMaterials(body.materials)),
  is_shared:       body.is_shared === false || body.is_shared === 0 ? 0 : 1,
});

const isEmptyTemplate = (p) =>
  JSON.parse(p.work_lines_json).every((l) => !String(l).trim()) &&
  JSON.parse(p.stk_tests_json).length === 0 &&
  JSON.parse(p.materials_json).length === 0 &&
  !p.installation_text && !p.remarks && !p.suggested_title;

// ─── CRÉATION ────────────────────────────────────────────────────────────────
router.post('/', requireRoles(...TEMPLATE_AUTHORS), async (req, res, next) => {
  try {
    const p = buildPayload(req.body);
    if (!p.name) return res.status(400).json({ error: 'Le nom du modèle est obligatoire.' });
    if (isEmptyTemplate(p)) return res.status(400).json({ error: 'Un modèle vide ne sert à rien : ajoutez au moins une ligne.' });

    const r = await run(
      `INSERT INTO report_templates
        (name, description, work_types, device_type, equipment_catalog_id, language,
         suggested_title, installation_text, remarks, work_lines_json, stk_tests_json,
         materials_json, is_shared, author_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.name, p.description, p.work_types, p.device_type, p.equipment_catalog_id, p.language,
       p.suggested_title, p.installation_text, p.remarks, p.work_lines_json, p.stk_tests_json,
       p.materials_json, p.is_shared, req.session.userId]
    );
    log.create(req, 'report_template', r.lastID, `"${p.name}"`);
    res.json({ success: true, id: r.lastID });
  } catch (e) { next(e); }
});

// ─── MODIFICATION (auteur ou admin) ──────────────────────────────────────────
router.put('/:id', requireRoles(...TEMPLATE_AUTHORS), async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide.' });
    const existing = await get('SELECT author_id FROM report_templates WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Modèle introuvable.' });
    if (existing.author_id !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Seul l\'auteur (ou un admin) peut modifier ce modèle.' });
    }
    const p = buildPayload(req.body);
    if (!p.name) return res.status(400).json({ error: 'Le nom du modèle est obligatoire.' });
    if (isEmptyTemplate(p)) return res.status(400).json({ error: 'Un modèle vide ne sert à rien : ajoutez au moins une ligne.' });

    await run(
      `UPDATE report_templates SET
        name=?, description=?, work_types=?, device_type=?, equipment_catalog_id=?, language=?,
        suggested_title=?, installation_text=?, remarks=?, work_lines_json=?, stk_tests_json=?,
        materials_json=?, is_shared=?, updated_at=datetime('now')
       WHERE id=?`,
      [p.name, p.description, p.work_types, p.device_type, p.equipment_catalog_id, p.language,
       p.suggested_title, p.installation_text, p.remarks, p.work_lines_json, p.stk_tests_json,
       p.materials_json, p.is_shared, id]
    );
    log.update(req, 'report_template', id, `"${p.name}"`);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── DUPLICATION (tout auteur) ───────────────────────────────────────────────
router.post('/:id/duplicate', requireRoles(...TEMPLATE_AUTHORS), async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const src = await get('SELECT * FROM report_templates WHERE id = ?', [id]);
    if (!src) return res.status(404).json({ error: 'Modèle introuvable.' });
    if (!src.is_shared && src.author_id !== req.session.userId) {
      return res.status(403).json({ error: 'Ce modèle est privé.' });
    }
    const r = await run(
      `INSERT INTO report_templates
        (name, description, work_types, device_type, equipment_catalog_id, language,
         suggested_title, installation_text, remarks, work_lines_json, stk_tests_json,
         materials_json, is_shared, author_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [`${src.name} (copie)`, src.description, src.work_types, src.device_type, src.equipment_catalog_id,
       src.language, src.suggested_title, src.installation_text, src.remarks, src.work_lines_json,
       src.stk_tests_json, src.materials_json, 0, req.session.userId]
    );
    res.json({ success: true, id: r.lastID });
  } catch (e) { next(e); }
});

// ─── ARCHIVER / RESTAURER (auteur ou admin) ──────────────────────────────────
const setArchived = (archived) => async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const t = await get('SELECT author_id FROM report_templates WHERE id = ?', [id]);
    if (!t) return res.status(404).json({ error: 'Modèle introuvable.' });
    if (t.author_id !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Action réservée à l\'auteur ou à un admin.' });
    }
    await run(`UPDATE report_templates SET archived_at = ${archived ? "datetime('now')" : 'NULL'}, updated_at = datetime('now') WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (e) { next(e); }
};
router.post('/:id/archive', requireRoles(...TEMPLATE_AUTHORS), setArchived(true));
router.post('/:id/restore', requireRoles(...TEMPLATE_AUTHORS), setArchived(false));

// ─── COMPTEUR D'UTILISATION ──────────────────────────────────────────────────
router.post('/:id/used', requireStaff, async (req, res, next) => {
  try {
    await run('UPDATE report_templates SET usage_count = usage_count + 1 WHERE id = ?', [toInt(req.params.id)]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── SUPPRESSION (auteur ou admin) ───────────────────────────────────────────
router.delete('/:id', requireRoles(...TEMPLATE_AUTHORS), async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const t = await get('SELECT author_id, name FROM report_templates WHERE id = ?', [id]);
    if (!t) return res.status(404).json({ error: 'Modèle introuvable.' });
    if (t.author_id !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Seul l\'auteur (ou un admin) peut supprimer ce modèle.' });
    }
    await run('DELETE FROM report_templates WHERE id = ?', [id]);
    log.delete(req, 'report_template', id, `"${t.name}"`);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
