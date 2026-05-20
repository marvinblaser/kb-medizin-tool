// server/routes/loans.js
'use strict';

const express = require('express');
const router  = express.Router();
const { db }  = require('../config/database');
const { requireAuth, requireStaff, requireAdmin } = require('../middleware/auth');
const log = require('../utils/logger');

// ── Helpers ──────────────────────────────────────────────────────────────────
const run = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function(err) { err ? rej(err) : res(this); }));
const all = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
const get = (sql, params = []) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row)));

// ══════════════════════════════════════════════════════════════════════════════
//  PRÊTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/loans — liste tous les prêts
router.get('/', requireStaff, async (req, res, next) => {
  try {
    const loans = await all(`
      SELECT l.*,
        d.name        as device_name,
        d.brand       as device_brand,
        d.serial_number,
        c.cabinet_name,
        u.name        as created_by_name,
        r.rma_number,
        r.status      as rma_status,
        rc.cabinet_name as rma_client_name
      FROM loans l
      LEFT JOIN loan_devices d ON l.device_id = d.id
      LEFT JOIN clients      c ON l.client_id = c.id
      LEFT JOIN users        u ON l.created_by = u.id
      LEFT JOIN rmas         r ON l.rma_id = r.id
      LEFT JOIN clients     rc ON r.client_id = rc.id
      ORDER BY l.created_at DESC
    `);
    res.json(loans);
  } catch (err) { next(err); }
});

// GET /api/loans/stats — statistiques
router.get('/stats', requireStaff, async (req, res, next) => {
  try {
    const [active, overdue, returned, topDevices, topClients] = await Promise.all([
      get(`SELECT COUNT(*) as count FROM loans WHERE status = 'En cours'`),
      get(`SELECT COUNT(*) as count FROM loans WHERE status = 'En cours'
           AND expected_return_date < date('now')`),
      get(`SELECT COUNT(*) as count FROM loans WHERE status = 'Retourné'`),
      all(`SELECT d.name, d.brand, COUNT(l.id) as loan_count,
             ROUND(AVG(CASE WHEN l.actual_return_date IS NOT NULL
               THEN julianday(l.actual_return_date) - julianday(l.start_date)
               ELSE julianday('now') - julianday(l.start_date) END), 1) as avg_days
           FROM loans l JOIN loan_devices d ON l.device_id = d.id
           GROUP BY l.device_id ORDER BY loan_count DESC LIMIT 5`),
      all(`SELECT c.cabinet_name, COUNT(l.id) as loan_count
           FROM loans l JOIN clients c ON l.client_id = c.id
           GROUP BY l.client_id ORDER BY loan_count DESC LIMIT 5`),
    ]);

    const devices = await all(`
      SELECT status, COUNT(*) as count FROM loan_devices GROUP BY status
    `);

    res.json({
      active:     active?.count   || 0,
      overdue:    overdue?.count  || 0,
      returned:   returned?.count || 0,
      devices,
      topDevices,
      topClients,
    });
  } catch (err) { next(err); }
});

// POST /api/loans — créer un prêt
router.post('/', requireStaff, async (req, res, next) => {
  try {
    const { device_id, client_id, start_date, expected_return_date, reason, notes,
            rma_id, device_owner } = req.body;
    if (!device_id || !start_date) {
      return res.status(400).json({ error: 'Appareil et date de départ requis.' });
    }

    // Vérifie que l'appareil est disponible
    const device = await get('SELECT * FROM loan_devices WHERE id = ?', [device_id]);
    if (!device) return res.status(404).json({ error: 'Appareil introuvable.' });
    if (device.status === 'En prêt') {
      return res.status(409).json({ error: 'Cet appareil est déjà en prêt.' });
    }

    const result = await run(`
      INSERT INTO loans (device_id, client_id, start_date, expected_return_date, reason, notes,
                         rma_id, device_owner, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [device_id, client_id || null, start_date,
       expected_return_date || null, reason || null, notes || null,
       rma_id || null, device_owner ?? '', req.session.userId]
    );

    // Met à jour le statut de l'appareil
    await run(`UPDATE loan_devices SET status = 'En prêt', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [device_id]);

    res.json({ success: true, id: result.lastID });
  } catch (err) { next(err); }
});

// PUT /api/loans/:id — modifier un prêt
router.put('/:id', requireStaff, async (req, res, next) => {
  try {
    const { client_id, start_date, expected_return_date, reason, notes,
            rma_id, device_owner } = req.body;
    await run(`
      UPDATE loans SET client_id=?, start_date=?, expected_return_date=?, reason=?, notes=?,
        rma_id=?, device_owner=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [client_id || null, start_date || null, expected_return_date || null,
       reason || null, notes || null, rma_id || null,
      device_owner ?? '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/loans/:id/return — marquer comme retourné
router.put('/:id/return', requireStaff, async (req, res, next) => {
  try {
    const { actual_return_date, return_condition, return_notes } = req.body;
    const loan = await get('SELECT * FROM loans WHERE id = ?', [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Prêt introuvable.' });

    await run(`
      UPDATE loans SET status='Retourné', actual_return_date=?, return_condition=?,
        return_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [actual_return_date || new Date().toISOString().split('T')[0],
       return_condition || null, return_notes || null, req.params.id]
    );

    // Remet l'appareil en Disponible
    await run(`UPDATE loan_devices SET status='Disponible', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [loan.device_id]);

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/loans/:id
router.delete('/:id', requireStaff, async (req, res, next) => {
  try {
    const loan = await get('SELECT * FROM loans WHERE id = ?', [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Prêt introuvable.' });

    // Si encore en cours, remet l'appareil en Disponible
    if (loan.status === 'En cours') {
      await run(`UPDATE loan_devices SET status='Disponible', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [loan.device_id]);
    }

    await run('DELETE FROM loans WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CATALOGUE D'APPAREILS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/loans/devices
router.get('/devices', requireStaff, async (req, res, next) => {
  try {
    const devices = await all(`
      SELECT d.*,
        COUNT(CASE WHEN l.status = 'En cours' THEN 1 END)  as active_loans,
        COUNT(l.id)                                          as total_loans
      FROM loan_devices d
      LEFT JOIN loans l ON l.device_id = d.id
      GROUP BY d.id ORDER BY d.name ASC
    `);

    // Ajoute l'historique des prêts pour chaque appareil
    for (const d of devices) {
      d.history = await all(`
        SELECT l.*, c.cabinet_name
        FROM loans l LEFT JOIN clients c ON l.client_id = c.id
        WHERE l.device_id = ? ORDER BY l.created_at DESC LIMIT 10
      `, [d.id]);
    }

    res.json(devices);
  } catch (err) { next(err); }
});

// POST /api/loans/devices
router.post('/devices', requireStaff, async (req, res, next) => {
  try {
    const { name, brand, serial_number, status, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis.' });
    const result = await run(`
      INSERT INTO loan_devices (name, brand, serial_number, status, notes)
      VALUES (?, ?, ?, ?, ?)`,
      [name, brand || null, serial_number || null, status || 'Disponible', notes || null]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) { next(err); }
});

// PUT /api/loans/devices/:id
router.put('/devices/:id', requireStaff, async (req, res, next) => {
  try {
    const { name, brand, serial_number, status, notes } = req.body;
    await run(`
      UPDATE loan_devices SET name=?, brand=?, serial_number=?, status=?, notes=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [name, brand || null, serial_number || null, status, notes || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/loans/devices/:id
router.delete('/devices/:id', requireStaff, async (req, res, next) => {
  try {
    const active = await get(
      `SELECT COUNT(*) as count FROM loans WHERE device_id = ? AND status = 'En cours'`,
      [req.params.id]
    );
    if (active?.count > 0) {
      return res.status(409).json({ error: 'Impossible de supprimer un appareil actuellement en prêt.' });
    }
    await run('DELETE FROM loan_devices WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Lier un prêt existant à un RMA (depuis la page RMA) ──────────────────────
// PUT /api/loans/:id/link-rma  { rma_id }
router.put('/:id/link-rma', requireStaff, async (req, res, next) => {
  try {
    const { rma_id } = req.body;
    await run(
      `UPDATE loans SET rma_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [rma_id || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;