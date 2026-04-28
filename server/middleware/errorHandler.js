// server/middleware/errorHandler.js

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── 404 - Route introuvable ──────────────────────────────────────────────────
function notFoundHandler(req, res, next) {
  // Si la requête attend du JSON (API), on répond en JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API introuvable.' });
  }
  // Sinon, redirection vers la page d'accueil
  res.redirect('/');
}

// ─── Gestionnaire d'erreurs global ───────────────────────────────────────────
// Express reconnaît ce middleware grâce aux 4 paramètres (err, req, res, next)
function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;

  // En développement : log complet avec la stack trace
  // En production : log minimal pour ne pas exposer l'intérieur du serveur
  if (!IS_PRODUCTION) {
    console.error(`\n❌ [${req.method}] ${req.path}`);
    console.error(err.stack || err.message);
  } else {
    console.error(`❌ Erreur ${statusCode} sur [${req.method}] ${req.path} : ${err.message}`);
  }

  // Les requêtes API reçoivent toujours du JSON
  if (req.path.startsWith('/api/')) {
    return res.status(statusCode).json({
      error: IS_PRODUCTION
        ? 'Une erreur est survenue. Veuillez réessayer.'
        : err.message
    });
  }

  // Les autres requêtes (pages HTML) redirigent vers l'accueil
  res.redirect('/');
}

// ─── Helper pour créer des erreurs avec un code HTTP ────────────────────────
// Utilisation dans les routes : throw createError(403, 'Accès refusé');
function createError(statusCode, message) {
  const err = new Error(message);
  err.status = statusCode;
  return err;
}

module.exports = { notFoundHandler, errorHandler, createError };
