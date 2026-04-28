// server/middleware/security.js

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ─── Limite globale ────────────────────────────────────────────────────────────
// 200 requêtes par IP par 15 minutes (usage normal d'une app ERP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de requêtes, veuillez réessayer dans quelques minutes.'
  }
});

// ─── Limite stricte pour l'authentification ───────────────────────────────────
// 10 tentatives de connexion par IP par 15 minutes (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
  }
});

// ─── Application de tous les middlewares de sécurité ──────────────────────────
function applySecurityMiddleware(app) {
  // Helmet : sécurise les headers HTTP (XSS, clickjacking, sniffing MIME, etc.)
  app.use(
    helmet({
      // Content Security Policy désactivé pour l'instant car peut casser
      // les assets existants — à activer progressivement plus tard
      contentSecurityPolicy: false
    })
  );

  // Rate limiting global
  app.use(globalLimiter);

  // Rate limiting strict sur les routes de connexion
  app.use('/api/login', authLimiter);
  app.use('/api/auth', authLimiter);
}

module.exports = { applySecurityMiddleware, authLimiter };
