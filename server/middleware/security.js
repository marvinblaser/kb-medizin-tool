// server/middleware/security.js

const helmet = require('helmet');

// ─── Application de tous les middlewares de sécurité ──────────────────────────
function applySecurityMiddleware(app) {
  // Helmet : headers HTTP sécurisés
  app.use(
    helmet({
      contentSecurityPolicy: false // à activer plus tard
    })
  );

  // Rate limiting désactivé pour le développement
  // Pour le réactiver en production, décommenter les lignes ci-dessous
  
  /*
  const rateLimit = require('express-rate-limit');
  
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Trop de requêtes, veuillez réessayer dans quelques minutes.'
    }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
    }
  });

  app.use('/api', apiLimiter);
  app.use('/api/login', authLimiter);
  app.use('/api/auth', authLimiter);
  */
}

module.exports = { applySecurityMiddleware };