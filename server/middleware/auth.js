// server/middleware/auth.js

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res
      .status(403)
      .json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

// NOUVEAU : Permet l'accès aux Admins, Secrétariat, et Techniciens (Pour le catalogue)
function requireStaff(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    // Si vous voulez restreindre à certains rôles précis, vous pouvez faire :
    // const allowedRoles = ['admin', 'secretary', 'tech', 'validator'];
    // if (!allowedRoles.includes(req.session.role)) { ... }
    
    // Mais comme tout utilisateur connecté est considéré comme du staff dans votre cas :
    next();
}

module.exports = { requireAuth, requireAdmin, requireStaff };