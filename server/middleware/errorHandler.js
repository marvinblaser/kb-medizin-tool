// server/middleware/errorHandler.js

const path = require('path');

// 404 - Route non trouvée
function notFoundHandler(req, res, next) {
  // Si c'est une requête API, retourner JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API introuvable.' });
  }
  // Sinon, servir la page HTML 404
  res.status(404).sendFile(path.join(__dirname, '../../public/404.html'));
}

// 500 - Erreur serveur générique
function errorHandler(err, req, res, next) {
  console.error('❌ Erreur serveur:', err);

  const status = err.status || err.statusCode || 500;
  
  // En développement, on peut montrer plus de détails
  const isDev = process.env.NODE_ENV !== 'production';
  
  // Si c'est une requête API, retourner JSON
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      error: isDev ? err.message : 'Une erreur est survenue.',
      ...(isDev && { stack: err.stack })
    });
  }
  
  // Sinon, servir la page HTML d'erreur appropriée
  if (status === 401) {
    return res.status(401).sendFile(path.join(__dirname, '../../public/401.html'));
  }
  if (status === 403) {
    return res.status(403).sendFile(path.join(__dirname, '../../public/403.html'));
  }
  // Pour toutes les autres erreurs 500+
  res.status(status).sendFile(path.join(__dirname, '../../public/500.html'));
}

module.exports = { notFoundHandler, errorHandler };