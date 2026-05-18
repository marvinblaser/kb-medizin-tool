// server/routes/contract-prices.js

const express = require('express');
const router  = express.Router();
const { db }  = require('../config/database');
const { requireAdmin, requireStaff } = require('../middleware/auth');
const { toInt } = require('../utils/validators');
const log = require('../utils/logger');

const run = (sql, p = []) => new Promise((res, rej) =>
  db.run(sql, p, function(err) { err ? rej(err) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) =>
  db.all(sql, p, (err, rows) => err ? rej(err) : res(rows)));
const get = (sql, p = []) => new Promise((res, rej) =>
  db.get(sql, p, (err, row) => err ? rej(err) : res(row)));

// ── GET /api/contract-prices ─── Liste avec join materials
router.get('/', requireStaff, async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT cp.id, cp.brand, cp.model, cp.notes,
             m.id          AS material_id,
             COALESCE(m.name, '⚠ Matériel supprimé') AS material_name,
             m.product_code AS product_code,
             COALESCE(m.unit_price, 0) AS price
      FROM contract_prices cp
      LEFT JOIN materials m ON cp.material_id = m.id
      ORDER BY cp.brand ASC, cp.model ASC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/contract-prices/match?brand=X&model=Y
router.get('/match', requireStaff, async (req, res, next) => {
  try {
    const { brand, model } = req.query;
    if (!brand) return res.json(null);

    const base = `
      SELECT cp.id, cp.brand, cp.model, cp.notes,
             m.id   as material_id,
             m.name as material_name,
             m.product_code as product_code,
            m.unit_price as price
      FROM contract_prices cp
      JOIN materials m ON cp.material_id = m.id
    `;

    // 1. Correspondance exacte brand + model
    let row = null;
    if (model) {
      row = await get(
        `${base} WHERE LOWER(cp.brand) = LOWER(?) AND LOWER(cp.model) = LOWER(?) LIMIT 1`,
        [brand, model]
      );
    }

    // 2. Brand seul (model vide)
    if (!row) {
      row = await get(
        `${base} WHERE LOWER(cp.brand) = LOWER(?) AND (cp.model IS NULL OR cp.model = '') LIMIT 1`,
        [brand]
      );
    }

    // 3. Correspondance partielle sur la marque
    if (!row) {
      row = await get(
        `${base} WHERE LOWER(?) LIKE '%' || LOWER(cp.brand) || '%'
                    OR LOWER(cp.brand) LIKE '%' || LOWER(?) || '%'
         ORDER BY LENGTH(cp.brand) DESC LIMIT 1`,
        [brand, brand]
      );
    }

    res.json(row || null);
  } catch (err) { next(err); }
});

// ── GET /api/contract-prices/materials-list
// Retourne tous les matériaux disponibles pour le select de l'admin
router.get('/materials-list', requireStaff, async (req, res, next) => {
  try {
    const rows = await all(
      'SELECT id, name, product_code, unit_price FROM materials ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/contract-prices
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { brand, model, material_id, notes } = req.body;
    console.log('POST contract-price:', { brand, model, material_id, notes }); // ← TEMPORAIRE
    if (!brand || !material_id) {
      return res.status(400).json({ error: 'Marque et prestation requis.' });
    }
    const result = await run(
      `INSERT INTO contract_prices (brand, model, material_id, notes) VALUES (?, ?, ?, ?)`,
      [brand.trim(), model?.trim() || null, toInt(material_id), notes?.trim() || null]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) { next(err); }
});

// ── PUT /api/contract-prices/:id
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide.' });
    const { brand, model, material_id, notes } = req.body;
    const result = await run(
      `UPDATE contract_prices
       SET brand=?, model=?, material_id=?, notes=?, updated_at=datetime('now')
       WHERE id=?`,
      [brand.trim(), model?.trim() || null, toInt(material_id), notes?.trim() || null, id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Tarif introuvable.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/bulk', requireAdmin, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: 'Aucun identifiant fourni.' });
 
    const cleanIds = ids.map(id => toInt(id)).filter(Boolean);
    if (!cleanIds.length)
      return res.status(400).json({ error: 'IDs invalides.' });
 
    const placeholders = cleanIds.map(() => '?').join(',');
    const result = await run(
      `DELETE FROM contract_prices WHERE id IN (${placeholders})`,
      cleanIds
    );
    res.json({ success: true, count: result.changes });
  } catch (err) { next(err); }
});

// ── DELETE /api/contract-prices/:id
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide.' });
    const result = await run('DELETE FROM contract_prices WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Tarif introuvable.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});


module.exports = router;