// server/middleware/auth.js

// ─── Authentification de base ─────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

// ─── Factory : exige un ou plusieurs rôles spécifiques ────────────────────────
// Usage : router.get('/admin-only', requireRoles('admin'), handler)
//         router.post('/validate', requireRoles('admin', 'verifier'), handler)
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    if (!allowedRoles.includes(req.session.role)) {
      return res.status(403).json({
        error: 'Vous n\'avez pas la permission d\'effectuer cette action.'
      });
    }
    next();
  };
}

// ─── Raccourcis pour les rôles courants ───────────────────────────────────────
const requireAdmin = requireRoles('admin');

// requireStaff : accès limité au personnel interne (tous les rôles connus).
// À RESTREINDRE selon les besoins : si certaines actions doivent être réservées
// par exemple à 'admin' + 'verifier', utilise requireRoles('admin', 'verifier').
const requireStaff = requireRoles(
  'admin',
  'tech',
  'secretary',
  'sales_tech',
  'sales_director',
  'verifier'
);

module.exports = { requireAuth, requireAdmin, requireStaff, requireRoles };
