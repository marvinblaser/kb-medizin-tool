// server/routes/bexio.js
// Synchronisation du catalogue Bexio → table materials

const express = require('express');
const router  = express.Router();
const { db }  = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const log = require('../utils/logger');

const BEXIO_API  = 'https://api.bexio.com';
const PAGE_LIMIT = 500; // Articles par page Bexio
// ════════════════════════════════════════════════════════════════════════════
//  BEXIO STATS v3 — Coller dans server/routes/bexio.js, avant module.exports
//  Remplace entièrement le bloc précédent (stats + invoices-raw)
// ════════════════════════════════════════════════════════════════════════════
 
const CACHE_TTL = 10 * 60 * 1000;
 
const BEXIO_STATUS = {
  7: 'Brouillon', 8: 'En attente', 9: 'Payé', 10: 'Partiel',
  11: 'En retard', 13: 'Annulé', 16: 'Rappel envoyé',
  17: 'En recouvrement', 19: 'Partiellement payé',
};
 
// ── Parser montant ─────────────────────────────────────────────────────────
function parseMoney(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).trim().replace(/\s/g,'').replace(/'/g,'')
    .replace(/\u00a0/g,'').replace(/\u2019/g,'');
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s))
    s = s.replace(/\./g,'').replace(',','.');
  return parseFloat(s) || 0;
}
 
// ── Cache partagé ──────────────────────────────────────────────────────────
let _rawInvoices    = null;
let _rawCurrencies  = null;
let _rawCachedAt    = 0;
let _statsCache     = null;
let _statsCachedAt  = 0;
 
async function getSharedData(force = false) {
  if (!force && _rawInvoices && (Date.now() - _rawCachedAt) < CACHE_TTL) {
    return { invoices: _rawInvoices, currencies: _rawCurrencies };
  }
  const token = process.env.BEXIO_API_TOKEN;
  if (!token) throw new Error('BEXIO_API_TOKEN manquant');
 
  // Fetch en parallèle
  const [invoices, currencies] = await Promise.all([
    (async () => {
      let all = [], offset = 0, hasMore = true;
      while (hasMore) {
        const r = await fetch(`${BEXIO_API}/2.0/kb_invoice?limit=${PAGE_LIMIT}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (!r.ok) throw new Error(`Bexio invoices HTTP ${r.status}`);
        const page = await r.json();
        if (!Array.isArray(page) || !page.length) { hasMore = false; break; }
        all = all.concat(page);
        offset += page.length;
        if (page.length < PAGE_LIMIT) hasMore = false;
      }
      return all;
    })(),
    (async () => {
      try {
        const r = await fetch(`${BEXIO_API}/2.0/currencies`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (!r.ok) return { 1: 'CHF', 2: 'EUR' };
        const list = await r.json();
        const map = {};
        if (Array.isArray(list)) list.forEach(c => { map[c.id] = c.name || `#${c.id}`; });
        return map;
      } catch { return { 1: 'CHF', 2: 'EUR' }; }
    })(),
  ]);
 
  _rawInvoices   = invoices;
  _rawCurrencies = currencies;
  _rawCachedAt   = Date.now();
  _statsCache    = null; // invalide le cache stats
  return { invoices, currencies };
}
 
// ── Normalise une facture ──────────────────────────────────────────────────
function normalizeInvoice(inv, currencies) {
  const statusId  = Number(inv.kb_item_status_id);
  const amount    = parseMoney(inv.total ?? inv.total_gross ?? inv.kb_gross_price ?? 0);
  const currCode  = currencies[Number(inv.currency_id)] || `#${inv.currency_id}`;
  const dateStr   = inv.is_valid_from || null;
  const date      = dateStr ? new Date(dateStr) : null;
  const valid     = date && !isNaN(date);
  const client    = (inv.contact_name || '').trim() ||
    (inv.contact_address || '').split(/\r?\n/)[0].trim() ||
    `Contact #${inv.contact_id}`;
 
  return {
    id:           inv.id,
    document_nr:  inv.document_nr || `#${inv.id}`,
    client,
    contact_id:   inv.contact_id,
    amount,
    currency_code: currCode,
    status_id:    statusId,
    status_label: BEXIO_STATUS[statusId] || `Status ${statusId}`,
    date:         dateStr,
    due_date:     inv.is_valid_to || null,
    year:         valid ? date.getFullYear()  : null,
    month_key:    valid ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}` : null,
    month_idx:    valid ? date.getMonth()     : null,
  };
}
 
// ── GET /api/bexio/invoices-raw ───────────────────────────────────────────
router.get('/invoices-raw', requireAdmin, async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    const { invoices, currencies } = await getSharedData(force);
    res.json(invoices.map(inv => normalizeInvoice(inv, currencies)));
  } catch (err) {
    console.error('Bexio invoices-raw:', err.message);
    res.status(500).json({ error: err.message });
  }
});
 
// ── GET /api/bexio/stats (résumé rapide pour dashboard) ──────────────────
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && _statsCache && (Date.now() - _statsCachedAt) < CACHE_TTL) {
      return res.json({ ..._statsCache, cached: true });
    }
    const { invoices, currencies } = await getSharedData(force);
    const normalized = invoices.map(inv => normalizeInvoice(inv, currencies));
 
    // Résumé simple par devise
    const byCurr = {};
    normalized.forEach(inv => {
      if (!byCurr[inv.currency_code]) byCurr[inv.currency_code] = { active: 0, overdue: 0, pending: 0 };
      if (inv.status_id === 9 && inv.year === new Date().getFullYear()) byCurr[inv.currency_code].active += inv.amount;
      if ([11,16,17].includes(inv.status_id)) byCurr[inv.currency_code].overdue += inv.amount;
      if ([8,10,19].includes(inv.status_id)) byCurr[inv.currency_code].pending += inv.amount;
    });
 
    _statsCache = {
      totalInvoices: invoices.length,
      generatedAt:   new Date().toISOString(),
      currentYear:   new Date().getFullYear(),
      summary:       byCurr,
    };
    _statsCachedAt = Date.now();
    res.json({ ..._statsCache, cached: false });
  } catch (err) {
    console.error('Bexio stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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