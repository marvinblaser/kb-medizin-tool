# KB Medizin Tool

Logiciel ERP de gestion de maintenance pour équipements médicaux.

## 📋 Fonctionnalités

- **Gestion clients** : Fiches clients, équipements installés, historique des interventions
- **Planning de maintenance** : Suivi des dates d'expiration, alertes automatiques
- **Rapports d'intervention** : Création, validation, archivage
- **Tickets** : Système de ticketing interne avec assignation et mentions
- **RMAs** : Suivi des retours fournisseurs (Kanban)
- **Checklists** : Modèles d'intervention réutilisables
- **Catalogue** : Matériel, équipements, secteurs
- **Notifications** : Alertes en temps réel + emails automatiques
- **Statistiques** : Dashboard avec KPIs et carte interactive

## 🚀 Installation

### Prérequis

- **Node.js** 18+ (testé avec v22.21.0)
- **npm** ou **yarn**
- Un serveur SMTP pour les emails (optionnel en dev)

### Installation en local

1. **Cloner le projet**
   ```bash
   git clone https://github.com/marvinblaser/kb-medizin-tool.git
   cd kb-medizin-tool
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configurer l'environnement**
   ```bash
   # Copier le fichier d'exemple
   copy .env.example .env   # Windows
   cp .env.example .env     # macOS/Linux
   ```

4. **Éditer `.env`**
   
   Ouvre `.env` et remplis au minimum :
   ```env
   NODE_ENV=development
   PORT=3000
   
   # Génère une clé secrète aléatoire (IMPORTANT)
   SESSION_SECRET=ta-cle-secrete-ici
   
   # Base de données (chemin par défaut)
   DB_PATH=./server/database.db
   ```
   
   **Pour générer une vraie clé secrète :**
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
   
   Copie le résultat dans `SESSION_SECRET`.

5. **Lancer le serveur**
   ```bash
   npm run dev    # Mode développement (redémarrage auto)
   # ou
   npm start      # Mode production
   ```

6. **Accéder à l'application**
   
   Ouvre ton navigateur : [http://localhost:3000](http://localhost:3000)
   
   **Compte admin par défaut :**
   - Email : `admin@kbmedizin.ch`
   - Mot de passe : `admin123`
   
   ⚠️ **Change ce mot de passe immédiatement en production !**

## 📁 Structure du projet

```
kb-medizin-tool/
├── server/                   # Backend Node.js
│   ├── config/
│   │   └── database.js       # Configuration SQLite + init
│   ├── middleware/
│   │   ├── auth.js           # Authentification et rôles
│   │   ├── security.js       # Helmet + rate limiting
│   │   └── errorHandler.js   # Gestion centralisée des erreurs
│   ├── migrations/
│   │   ├── runner.js         # Système de migrations
│   │   ├── 001_repair_reports.js
│   │   ├── 002_repair_report_equipment.js
│   │   ├── 003_repair_activity_logs.js
│   │   ├── 004_add_user_preferences.js
│   │   └── 005_align_stk_tests.js
│   ├── routes/
│   │   ├── auth.js           # Login, logout, /me
│   │   ├── admin.js          # Users, roles, matériel, équipement
│   │   ├── clients.js        # CRUD clients + équipements
│   │   ├── reports.js        # Rapports d'intervention
│   │   ├── tickets.js        # Tickets internes
│   │   ├── rmas.js           # Retours fournisseurs
│   │   ├── checklists.js     # Modèles d'intervention
│   │   ├── dashboard.js      # Statistiques
│   │   └── notifications.js  # Notifications
│   ├── utils/
│   │   ├── mailer.js         # Envoi d'emails
│   │   └── validators.js     # Helpers de validation
│   ├── cron.js               # Tâches automatiques
│   └── server.js             # Point d'entrée
├── public/                   # Frontend (HTML/CSS/JS)
│   ├── uploads/              # Fichiers uploadés
│   ├── dashboard.html
│   ├── clients.html
│   ├── reports.html
│   └── ...
├── scripts/                  # Utilitaires
│   ├── migrations/archived/  # Anciennes migrations one-shot
│   └── tools/                # backup.js, etc.
├── package.json
├── .env.example
└── README.md
```

## 🔐 Rôles et permissions

| Rôle | Permissions |
|------|-------------|
| **admin** | Accès complet : gestion users, suppression globale, paramètres |
| **tech** | Création/modification rapports, tickets, clients |
| **secretary** | Gestion clients, planning, archivage rapports |
| **sales_tech** | Gestion clients, devis |
| **sales_director** | Exports, statistiques, validation |
| **verifier** | Validation/rejet rapports |

Les permissions sont gérées via `requireRoles()` dans les routes. Voir `server/middleware/auth.js`.

## 🛠️ Scripts disponibles

```bash
npm start          # Lancer le serveur (production)
npm run dev        # Lancer en mode développement (auto-reload)
```

## 🗄️ Base de données

- **Type** : SQLite3
- **Fichier** : `server/database.db` (par défaut)
- **Migrations** : Automatiques au démarrage (voir `server/migrations/`)

### Migrations

Le système de migrations s'exécute automatiquement au boot :
- Les fichiers dans `server/migrations/` sont numérotés (`001_`, `002_`, etc.)
- Chaque migration n'est jouée qu'une seule fois
- L'historique est stocké dans la table `_migrations`

**Créer une nouvelle migration :**

1. Crée un fichier `server/migrations/006_ma_migration.js`
2. Exporte une fonction `up(db, done)` :
   ```js
   function up(db, done) {
     db.run('ALTER TABLE clients ADD COLUMN new_field TEXT', (err) => {
       if (err && !err.message.includes('duplicate column')) return done(err);
       done(null);
     });
   }
   module.exports = { up };
   ```
3. Redémarre le serveur → la migration s'applique automatiquement

## 📧 Configuration des emails

Pour activer les notifications par email, remplis ces variables dans `.env` :

```env
MAIL_HOST=smtp.ton-fournisseur.com
MAIL_PORT=587
MAIL_USER=ton@email.com
MAIL_PASS=ton-mot-de-passe
MAIL_FROM=KB Med <noreply@kbmed.ch>
```

Sans configuration SMTP, l'application fonctionne mais les emails ne seront pas envoyés (tu verras des erreurs dans la console, c'est normal).

## 🚨 Sécurité

### En production

- ✅ Change le mot de passe admin par défaut
- ✅ Génère une vraie `SESSION_SECRET` aléatoire
- ✅ Configure `NODE_ENV=production` dans `.env`
- ✅ Active HTTPS via Nginx/Apache (les cookies `secure` se déclenchent automatiquement)
- ✅ Configure un vrai serveur SMTP (pas de mail = pas d'alertes)
- ✅ Sauvegarde régulière de `server/database.db`

### Rate limiting

- **Login** : 10 tentatives / 15 min par IP
- **API globale** : 500 requêtes / 15 min par IP

Configurable dans `server/middleware/security.js`.

## 🐛 Dépannage

### Erreur "Cannot find module"

```bash
npm install
```

### Erreur "SESSION_SECRET manquant"

Vérifie que tu as bien créé un fichier `.env` avec une `SESSION_SECRET` définie.

### Le serveur ne démarre pas

Vérifie que le port 3000 est libre :
```bash
# Windows
netstat -ano | findstr :3000

# macOS/Linux
lsof -i :3000
```

### Emails non envoyés

Normal si tu n'as pas configuré de SMTP. L'app fonctionne sans emails, tu verras juste des logs d'erreur dans la console.

## 📝 Changelog

### v2.0.0 (Refactor complet - Avril 2025)

**Sécurité :**
- ✅ Ajout helmet + rate limiting
- ✅ Validation stricte des entrées (helpers `validators.js`)
- ✅ Protection timing attack sur login
- ✅ Régénération de session après login (anti session-fixation)
- ✅ Gestion centralisée des erreurs
- ✅ Protection path traversal sur uploads
- ✅ `crypto.randomBytes()` au lieu de `Math.random()`
- ✅ Anti-lockout admin (impossible de supprimer le dernier admin)

**Architecture :**
- ✅ Système de migrations versionné (plus de `fix-db.js`)
- ✅ Middleware `requireRoles()` granulaire
- ✅ Validation d'entrées systématique
- ✅ Gestion des erreurs 404/500 propres
- ✅ Nettoyage racine du projet (25+ scripts archivés)

**Bugs corrigés :**
- ✅ Race condition dans import matériel
- ✅ Schéma `report_stk_tests` incohérent
- ✅ Erreurs SQL exposées au client
- ✅ Cookie `secure` en dur
- ✅ Mot de passe admin loggué en clair

## 📄 Licence

Propriétaire - KB Medizin

## 👥 Support

Pour toute question ou bug, contacte l'équipe technique interne.