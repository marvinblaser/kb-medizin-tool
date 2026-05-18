// server/server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const SQLiteStore = require('connect-sqlite3')(session);
const { initDatabase } = require('./config/database');

const { applySecurityMiddleware } = require('./middleware/security');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const clientsRoutes = require('./routes/clients');
const adminRoutes = require('./routes/admin');
const checklistsRoutes = require('./routes/checklists');
const reportsRoutes = require('./routes/reports');
const ticketsRoutes = require('./routes/tickets');
const rmasRoutes = require('./routes/rmas');
const notificationsRoutes = require('./routes/notifications');
const bexioRouter = require('./routes/bexio');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── Sécurité (helmet, rate-limit) ────────────────────────────────────────────
applySecurityMiddleware(app);

// ─── Parsing des requêtes ──────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session ──────────────────────────────────────────────────────────────────
if (!process.env.SESSION_SECRET) {
  console.error('❌ SESSION_SECRET manquant dans .env — arrêt du serveur.');
  process.exit(1);
}

app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.db',
      dir: './'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: IS_PRODUCTION, // true en prod (Nginx gère le SSL), false en dev
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24h par défaut (écrasé par le login)
    }
  })
);

// ─── Fichiers statiques ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// Une seule route pour les uploads (évite les ambiguïtés)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes API ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/checklists', checklistsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/rmas', rmasRoutes);
app.use('/api/contract-prices', require('./routes/contract-prices'));
app.use('/api/bexio', bexioRouter);
app.use('/api/loans', require('./routes/loans'));

// ─── Redirection racine ───────────────────────────────────────────────────────

app.get('/api/me', (req, res) => res.redirect('/api/auth/me'));
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard.html');
  }
  res.redirect('/login.html');
});

// ─── Gestion des erreurs (toujours en dernier) ────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Tâches automatiques (cron) ───────────────────────────────────────────────
require('./cron').initCronJobs();

// ─── Démarrage ────────────────────────────────────────────────────────────────
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Serveur démarré sur http://localhost:${PORT}`);
      console.log(`🌍 Environnement : ${process.env.NODE_ENV || 'development'}\n`);
    });
  })
  .catch((err) => {
    console.error('❌ Erreur initialisation DB:', err);
    process.exit(1);
  });