// server/routes/bexio.js
// Synchronisation du catalogue Bexio → table materials

const express = require('express');
const router  = express.Router();
const { db }  = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const log = require('../utils/logger');

const BEXIO_API  = 'https://api.bexio.com';
const PAGE_LIMIT = 500; // Articles par page Bexio

// ── Helper : fetch paginé Bexio ──────────────────────────────────────────────
async function fetchAllBexioArticles() {
  const token = process.env.BEXIO_API_TOKEN;
  if (!token) throw new Error('BEXIO_API_TOKEN manquant dans .env');

  let allArticles = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      `${BEXIO_API}/2.0/article?limit=${PAGE_LIMIT}&offset=${offset}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept':        'application/json',
        }
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Bexio API ${res.status}: ${err}`);
    }

    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) {
      hasMore = false;
    } else {
      allArticles = allArticles.concat(page);
      offset += page.length;
      if (page.length < PAGE_LIMIT) hasMore = false;
    }
  }

  return allArticles;
}

// ── Helper DB promisifié ─────────────────────────────────────────────────────
const dbRun = (sql, params) => new Promise((res, rej) =>
  db.run(sql, params, function(err) { err ? rej(err) : res(this); })
);
const dbGet = (sql, params) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row))
);

// ── POST /api/bexio/sync ─── Déclenchement manuel (admin) ───────────────────
router.post('/sync', requireAdmin, async (req, res, next) => {
  try {
    const result = await syncBexio();
    res.json(result);
  } catch (err) {
    console.error('❌ Bexio sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bexio/status ─── Infos de dernière sync ────────────────────────
router.get('/status', requireAdmin, async (req, res, next) => {
  try {
    const [total, synced] = await Promise.all([
      dbGet('SELECT COUNT(*) as cnt FROM materials', []),
      dbGet('SELECT COUNT(*) as cnt FROM materials WHERE bexio_id IS NOT NULL', []),
    ]);
    const last = await dbGet(
      "SELECT created_at FROM activity_logs WHERE action = 'BEXIO_SYNC' ORDER BY created_at DESC LIMIT 1",
      []
    ).catch(() => null);

    res.json({
      total_materials:  total?.cnt   || 0,
      synced_materials: synced?.cnt  || 0,
      last_sync:        last?.created_at || null,
      token_configured: !!process.env.BEXIO_API_TOKEN,
    });
  } catch (err) { next(err); }
});

// ── FONCTION PRINCIPALE DE SYNCHRONISATION ───────────────────────────────────
async function syncBexio() {
  console.log('🔄 Bexio sync démarrée...');
  const articles = await fetchAllBexioArticles();

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const art of articles) {
    // Ignore les articles sans code interne ou nom
    if (!art.intern_code || !art.intern_name) { skipped++; continue; }

    const name         = art.intern_name.trim();
    const product_code = art.intern_code.trim();
    const unit_price   = parseFloat(art.sale_price) || 0;
    const bexio_id     = art.id;

    try {
      // Cherche si l'article existe déjà (par bexio_id OU product_code)
      const existing = await dbGet(
        'SELECT id FROM materials WHERE bexio_id = ? OR product_code = ?',
        [bexio_id, product_code]
      );

      if (existing) {
        // Met à jour les infos qui peuvent changer (nom + prix)
        await dbRun(
          'UPDATE materials SET name = ?, unit_price = ?, bexio_id = ?, product_code = ? WHERE id = ?',
          [name, unit_price, bexio_id, product_code, existing.id]
        );
        updated++;
      } else {
        // Crée le nouveau matériel
        await dbRun(
          'INSERT INTO materials (name, product_code, unit_price, bexio_id) VALUES (?, ?, ?, ?)',
          [name, product_code, unit_price, bexio_id]
        );
        created++;
      }
    } catch (e) {
      console.error(`  ⚠️  Article ${bexio_id} (${product_code}): ${e.message}`);
      errors++;
    }
  }

  // Log dans activity_logs
  try {
    await dbRun(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES (0, 'BEXIO_SYNC', 'Material', 0, ?)`,
      [JSON.stringify({ total: articles.length, created, updated, skipped, errors })]
    );
  } catch {}

  const result = {
    success: true,
    total:   articles.length,
    created,
    updated,
    skipped,
    errors,
    message: `✅ Sync terminée : ${created} créés, ${updated} mis à jour, ${skipped} ignorés${errors ? `, ${errors} erreurs` : ''}.`
  };

  console.log(`✅ Bexio sync terminée:`, result);
  return result;
}

// Exporte la fonction pour le CRON
module.exports = router;
module.exports.syncBexio = syncBexio;