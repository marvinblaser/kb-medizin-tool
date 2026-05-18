// server/utils/logger.js
// Helper centralisé pour les logs d'activité
// Usage : log(req, 'CREATE', 'rapport', id, 'Cabinet Dr. Dupont — Service d\'entretien')

'use strict';

const { db } = require('../config/database');

/**
 * Enregistre une action dans activity_logs
 * @param {object} req      - Requête Express (pour userId)
 * @param {string} action   - CREATE | UPDATE | DELETE | LOGIN | LOGOUT | STATUS | ARCHIVE | VALIDATE | RETURN | FAIL
 * @param {string} entity   - ticket | rapport | rma | client | prêt | utilisateur | matériel | checklist
 * @param {number|null} entityId
 * @param {string} details  - Description lisible par un humain
 */
function log(req, action, entity, entityId = null, details = '') {
  const userId = req?.session?.userId || null;

  db.run(
    `INSERT INTO activity_logs (user_id, action, entity, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, action, entity, entityId || null, details || null],
    (err) => { if (err) console.error('[logger]', err.message); }
  );
}

/**
 * Raccourcis lisibles
 */
log.create   = (req, entity, id, details) => log(req, 'CREATE',   entity, id, details);
log.update   = (req, entity, id, details) => log(req, 'UPDATE',   entity, id, details);
log.delete   = (req, entity, id, details) => log(req, 'DELETE',   entity, id, details);
log.status   = (req, entity, id, details) => log(req, 'STATUS',   entity, id, details);
log.login    = (req, details)             => log(req, 'LOGIN',    'auth',  null, details);
log.logout   = (req, details)             => log(req, 'LOGOUT',   'auth',  null, details);
log.fail     = (req, details)             => log(req, 'FAIL',     'auth',  null, details);
log.archive  = (req, entity, id, details) => log(req, 'ARCHIVE',  entity, id, details);
log.validate = (req, entity, id, details) => log(req, 'VALIDATE', entity, id, details);
log.ret      = (req, entity, id, details) => log(req, 'RETURN',   entity, id, details);

module.exports = log;