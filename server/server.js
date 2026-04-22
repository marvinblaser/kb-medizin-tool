// server/server.js

const express = require('express');
const session = require('express-session');
const path = require('path');
const SQLiteStore = require('connect-sqlite3')(session);
const { initDatabase } = require('./config/database');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const clientsRoutes = require('./routes/clients');
const adminRoutes = require('./routes/admin');
const checklistsRoutes = require('./routes/checklists');
const reportsRoutes = require('./routes/reports');
const ticketsRoutes = require('./routes/tickets');
const rmasRoutes = require('./routes/rmas');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.db',
      dir: './' // Stocke le fichier à la racine du projet
    }),
    secret: 'kb-medizin-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Laissez false car Nginx gère le SSL
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // Défaut 24h (sera écrasé par le login)
    }
  })
);

// Fichiers statiques (Site Web)
app.use(express.static(path.join(__dirname, '../public')));

// Fichiers statiques (Uploads/Photos) - IMPORTANT POUR LES PROFILS
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Routes API
app.use('/api', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/checklists', checklistsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/rmas', rmasRoutes);

// Redirection intelligente
app.get('/', (req, res) => {
  // Si l'utilisateur a une session active, on l'envoie direct au tableau de bord
  if (req.session.userId) {
    return res.redirect('/dashboard.html');
  }
  // Sinon, on l'envoie se connecter
  res.redirect('/login.html');
});

// --- LANCEMENT DES TÂCHES AUTOMATIQUES (CRON) ---
require('./cron').initCronJobs();

// Initialiser la DB et démarrer le serveur
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Serveur démarré sur http://localhost:${PORT}`);
      console.log(`📋 Compte admin: admin@kbmedizin.ch / admin123\n`);
    });
  })
  .catch((err) => {
    console.error('❌ Erreur initialisation DB:', err);
    process.exit(1);
  });