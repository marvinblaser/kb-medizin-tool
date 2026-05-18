// public/js/sidebar-init.js
// KB Med — Gestionnaire universel de la sidebar

'use strict';

(function() {

  // ── 1. INJECTION RMA + PRÊTS ────────────────────────────────────
  function ensureExtraLinks() {
    const nav = document.querySelector('.sidebar-nav, aside nav');
    if (!nav) return;

    // RMA — après Tickets
    if (!nav.querySelector('a[href="/rmas.html"]')) {
      const ticketLink = nav.querySelector('a[href="/tickets.html"]');
      if (ticketLink) {
        ticketLink.parentNode.insertBefore(
          buildNavLink('/rmas.html', 'fa-tools', 'RMA'),
          ticketLink.nextSibling
        );
      }
    }

    // Prêts — après RMA
    if (!nav.querySelector('a[href="/loans.html"]')) {
      const rmaLink = nav.querySelector('a[href="/rmas.html"]')
                   || nav.querySelector('a[href="/tickets.html"]');
      if (rmaLink) {
        rmaLink.parentNode.insertBefore(
          buildNavLink('/loans.html', 'fa-hand-holding-medical', 'Prêts'),
          rmaLink.nextSibling
        );
      }
    }
  }

  function buildNavLink(href, icon, label) {
    const a      = document.createElement('a');
    a.href       = href;
    const sample = document.querySelector('.sidebar-nav a, aside nav a');
    if (sample) a.className = sample.className;
    a.innerHTML  = `<i class="fas ${icon}"></i><span>${label}</span>`;
    if (window.location.pathname === href ||
        window.location.pathname.endsWith(href)) {
      a.classList.add('active');
    }
    return a;
  }

  // ── 2. BADGE ────────────────────────────────────────────────────
  function setBadge(href, count) {
  const link = document.querySelector(`.sidebar-nav a[href="${href}"]`)
            || document.querySelector(`aside nav a[href="${href}"]`)
            || document.querySelector(`nav a[href="${href}"]`);

  if (!link) {
    setTimeout(() => setBadge(href, count), 600);
    return;
  }

  // Masque aussi tout badge existant codé en dur
  link.querySelectorAll('.sidebar-badge, .nav-badge, [id$="-badge"]').forEach(b => {
    b.style.display = 'none';
    b.textContent   = '';
  });

  if (!count || count <= 0) return;

  const badge = document.createElement('span');
  badge.className   = 'sidebar-badge';
  badge.textContent = count > 99 ? '99+' : count;
  badge.style.cssText = `
    background:var(--color-danger,#ef4444);color:#fff;font-size:10px;
    font-weight:800;padding:1px 6px;border-radius:999px;margin-left:auto;
    flex-shrink:0;min-width:18px;text-align:center;line-height:1.6;
  `;
  link.style.cssText += 'display:flex;align-items:center;';
  link.appendChild(badge);
}

  // ── 3. BADGES — CHARGEMENT PARALLÈLE ───────────────────────────
  async function loadBadges(role) {
    const canValidate = ['admin','validator','sales_director','verifier','verificateur'].includes(role);
    const canArchive  = ['admin','secretary'].includes(role);

    // Toutes les requêtes en parallèle — Promise.allSettled ne plante pas si l'une échoue
    const [tickets, reports, rmaStats, loans] = await Promise.allSettled([

      // Badge Tickets
      fetch('/api/tickets/badge').then(r => r.ok ? r.json() : null),

      // Badge Rapports
      (canValidate || canArchive)
        ? fetch('/api/reports/stats').then(r => r.ok ? r.json() : null)
        : Promise.resolve(null),

      // Badge RMAs — utilise les stats au lieu de charger tous les RMAs
      fetch('/api/rmas/stats/dashboard').then(r => r.ok ? r.json() : null),

      // Badge Prêts — prêts en retard
      fetch('/api/loans/stats').then(r => r.ok ? r.json() : null),
    ]);

    // ── Tickets ──────────────────────────────────────────────────
    if (tickets.status === 'fulfilled' && tickets.value?.count > 0) {
      setBadge('/tickets.html', tickets.value.count);
    }

    // ── Rapports ─────────────────────────────────────────────────
    if (reports.status === 'fulfilled' && reports.value) {
      let count = 0;
      if (canValidate) count += reports.value.pending  || 0;
      if (canArchive)  count += reports.value.validated || 0;
      if (count > 0) setBadge('/reports.html', count);
    }

    // ── RMAs — affiche les actifs hors archives ───────────────────
    if (rmaStats.status === 'fulfilled' && rmaStats.value) {
      const dist   = rmaStats.value.statusDistribution || [];
      const active = dist
        .filter(s => s.status !== 'Archives')
        .reduce((sum, s) => sum + (s.count || 0), 0);
      if (active > 0) setBadge('/rmas.html', active);
    }

    // ── Prêts — affiche seulement les prêts en retard ────────────
    if (loans.status === 'fulfilled' && loans.value?.overdue > 0) {
      setBadge('/loans.html', loans.value.overdue);
    }
  }

  // ── 4. AUTH + USER CARD ────────────────────────────────────────
  async function initAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return;
      const d = await res.json();
      if (!d.user) return;

      const { name, role, id } = d.user;
      window.currentUserRole = role;
      window.currentUserId   = id;

      // User card — compatible avec les différents IDs utilisés selon les pages
      [['user-avatar','u-avatar'], ['user-name','u-name'], ['user-role','u-role']]
        .forEach(([idA, idB], idx) => {
          const vals = [
            name.charAt(0).toUpperCase(), // avatar
            name,                          // name
            role,                          // role
          ];
          [idA, idB].forEach(elId => {
            const el = document.getElementById(elId);
            if (el) el.textContent = vals[idx];
          });
        });

      // Logout
      document.getElementById('logout-btn')
      ?.addEventListener('click', async () => {
        // Confirmation avant déconnexion
        const confirmed = await showLogoutConfirm();
        if (!confirmed) return;
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
      });

      // Charge les badges APRÈS injection des liens
      await loadBadges(role);

    } catch (e) {
      console.warn('[sidebar-init]', e.message);
    }
  }

  // ── 5. LIEN ACTIF ──────────────────────────────────────────────
  function markActiveLink() {
    const path = window.location.pathname;
    document.querySelectorAll('.sidebar-nav a, aside nav a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      // Comparaison exacte pour éviter les faux positifs
      const isActive = path === href
        || path === href.replace('.html', '')
        || (href !== '/' && path.endsWith(href));
      a.classList.toggle('active', isActive);
    });
  }

  // ── INIT ───────────────────────────────────────────────────────
  function init() {
    ensureExtraLinks(); // Injecte RMA + Prêts en premier
    markActiveLink();
    initAuth();         // Auth → puis badges (dans cet ordre)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

function showLogoutConfirm() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.45);
      z-index:99999;display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = `
      <div style="background:var(--bg-elevated);border:1px solid var(--border-primary);
        padding:24px 28px;min-width:300px;box-shadow:var(--shadow-lg);border-radius:4px;">
        <div style="font-weight:700;font-size:var(--text-base);margin-bottom:8px;">
          <i class="fas fa-sign-out-alt" style="color:var(--color-danger);margin-right:8px;"></i>
          Déconnexion
        </div>
        <p style="color:var(--text-secondary);font-size:var(--text-sm);margin-bottom:20px;">
          Êtes-vous sûr de vouloir vous déconnecter ?
        </p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="_logout-cancel" style="padding:7px 16px;border:1px solid var(--border-primary);
            background:var(--bg-secondary);cursor:pointer;font-family:inherit;
            font-size:var(--text-sm);border-radius:3px;">
            Annuler
          </button>
          <button id="_logout-confirm" style="padding:7px 16px;background:var(--color-danger);
            color:#fff;border:none;cursor:pointer;font-family:inherit;
            font-size:var(--text-sm);font-weight:700;border-radius:3px;">
            Se déconnecter
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#_logout-confirm').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#_logout-cancel').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCHES sidebar-init.js
// ═══════════════════════════════════════════════════════════════════════════════


// ── FIX 1 : Badge tickets — sélecteur plus robuste + retry ───────────────────

function setBadge(href, count) {
  // Essaie plusieurs sélecteurs car la structure varie selon les pages
  const link = document.querySelector(`.sidebar-nav a[href="${href}"]`)
            || document.querySelector(`aside nav a[href="${href}"]`)
            || document.querySelector(`nav a[href="${href}"]`)
            || document.querySelector(`a.nav-link[href="${href}"]`);

  if (!link) {
    // Retry après 600ms — la sidebar peut être injectée après init
    setTimeout(() => setBadge(href, count), 600);
    return;
  }

  link.querySelectorAll('.sidebar-badge').forEach(b => b.remove());
  if (!count || count <= 0) return;

  const badge = document.createElement('span');
  badge.className   = 'sidebar-badge';
  badge.textContent = count > 99 ? '99+' : count;
  badge.style.cssText = `
    background: var(--color-danger, #ef4444);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 999px;
    margin-left: auto;
    flex-shrink: 0;
    min-width: 18px;
    text-align: center;
    line-height: 1.6;
  `;
  link.style.cssText += 'display:flex;align-items:center;';
  link.appendChild(badge);
}


// ── FIX 2 : Bouton préférences avec classe sidebar-btn ───────────────────────
// Dans chaque page HTML, le bouton doit être :
/*
<button class="sidebar-btn" onclick="openPreferencesModal()">
  <i class="fas fa-cog"></i> Mes préférences
</button>
*/


// ── FIX 3 : openPreferencesModal() — à ajouter dans sidebar-init.js ──────────

window.openPreferencesModal = function() {
  // Retire un éventuel modal précédent
  document.getElementById('_prefs-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = '_prefs-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.45);
    z-index:99999;display:flex;align-items:center;justify-content:center;
    padding:20px;`;

  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border:1px solid var(--border-primary);
      width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.2);">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:14px 18px;border-bottom:1px solid var(--border-primary);
        background:var(--bg-secondary);">
        <h3 style="margin:0;font-size:var(--text-base);font-weight:var(--font-semibold);
          display:flex;align-items:center;gap:8px;">
          <i class="fas fa-user-cog" style="color:var(--color-primary);"></i>
          Mes préférences
        </h3>
        <button onclick="document.getElementById('_prefs-modal').remove()"
          style="background:none;border:none;font-size:18px;cursor:pointer;
            color:var(--text-tertiary);line-height:1;">&times;</button>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid var(--border-primary);">
        <button onclick="_prefsTab('password')" id="_tab-password"
          style="flex:1;padding:10px;border:none;background:none;cursor:pointer;
            font-family:inherit;font-size:var(--text-sm);font-weight:600;
            color:var(--color-primary);border-bottom:2px solid var(--color-primary);">
          🔒 Mot de passe
        </button>
        <button onclick="_prefsTab('notifs')" id="_tab-notifs"
          style="flex:1;padding:10px;border:none;background:none;cursor:pointer;
            font-family:inherit;font-size:var(--text-sm);color:var(--text-secondary);
            border-bottom:2px solid transparent;">
          🔔 Notifications
        </button>
      </div>

      <!-- Onglet Mot de passe -->
      <div id="_pane-password" style="padding:20px;">
        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;
            letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:6px;">
            Mot de passe actuel
          </label>
          <input type="password" id="_prefs-old-pw"
            style="width:100%;height:38px;border:1px solid var(--border-primary);
              border-radius:3px;padding:0 10px;font-size:var(--text-sm);
              background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;
            letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:6px;">
            Nouveau mot de passe
          </label>
          <input type="password" id="_prefs-new-pw"
            style="width:100%;height:38px;border:1px solid var(--border-primary);
              border-radius:3px;padding:0 10px;font-size:var(--text-sm);
              background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:18px;">
          <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;
            letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:6px;">
            Confirmer le nouveau mot de passe
          </label>
          <input type="password" id="_prefs-confirm-pw"
            style="width:100%;height:38px;border:1px solid var(--border-primary);
              border-radius:3px;padding:0 10px;font-size:var(--text-sm);
              background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;box-sizing:border-box;">
        </div>
        <div id="_prefs-pw-msg" style="display:none;margin-bottom:12px;padding:8px 12px;
          border-radius:3px;font-size:var(--text-sm);"></div>
        <button onclick="_savePassword()"
          style="width:100%;height:38px;background:var(--color-primary);color:#fff;
            border:none;border-radius:3px;font-size:var(--text-sm);font-weight:700;
            cursor:pointer;font-family:inherit;">
          <i class="fas fa-save"></i> Enregistrer
        </button>
      </div>

      <!-- Onglet Notifications -->
      <div id="_pane-notifs" style="padding:20px;display:none;">
        <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:16px;">
          Choisissez les notifications que vous souhaitez recevoir par e-mail.
        </div>
        ${[
          { key: 'pref_mail_assign',  label: 'Ticket assigné',           icon: '🎫' },
          { key: 'pref_mail_comment', label: 'Nouveau commentaire',       icon: '💬' },
          { key: 'pref_mail_status',  label: 'Changement de statut',      icon: '🔄' },
          { key: 'pref_mail_mention', label: 'Mentionné dans un ticket',  icon: '@'  },
        ].map(p => `
          <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;
            background:var(--bg-secondary);border:1px solid var(--border-primary);
            margin-bottom:6px;cursor:pointer;border-radius:3px;">
            <input type="checkbox" id="_notif-${p.key}"
              style="accent-color:var(--color-primary);width:16px;height:16px;cursor:pointer;">
            <span style="font-size:var(--text-sm);">${p.icon} ${p.label}</span>
          </label>`).join('')}
        <div id="_prefs-notif-msg" style="display:none;margin-top:10px;padding:8px 12px;
          border-radius:3px;font-size:var(--text-sm);"></div>
        <button onclick="_saveNotifPrefs()"
          style="width:100%;height:38px;background:var(--color-primary);color:#fff;
            border:none;border-radius:3px;font-size:var(--text-sm);font-weight:700;
            cursor:pointer;font-family:inherit;margin-top:14px;">
          <i class="fas fa-save"></i> Enregistrer
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Ferme si clic hors du panneau
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });

  // Charge les préférences actuelles
  _loadNotifPrefs();
};

// ── Switch onglets préférences ────────────────────────────────────────────────
window._prefsTab = function(tab) {
  ['password', 'notifs'].forEach(t => {
    document.getElementById(`_pane-${t}`).style.display   = t === tab ? '' : 'none';
    const btn = document.getElementById(`_tab-${t}`);
    btn.style.color       = t === tab ? 'var(--color-primary)' : 'var(--text-secondary)';
    btn.style.borderBottom = t === tab
      ? '2px solid var(--color-primary)'
      : '2px solid transparent';
  });
};

// ── Enregistre le mot de passe ────────────────────────────────────────────────
window._savePassword = async function() {
  const oldPw  = document.getElementById('_prefs-old-pw').value;
  const newPw  = document.getElementById('_prefs-new-pw').value;
  const confPw = document.getElementById('_prefs-confirm-pw').value;
  const msg    = document.getElementById('_prefs-pw-msg');

  const showMsg = (text, ok) => {
    msg.style.display    = '';
    msg.style.background = ok ? 'var(--color-success-bg)' : 'var(--color-danger-bg)';
    msg.style.color      = ok ? 'var(--color-success)'    : 'var(--color-danger)';
    msg.style.border     = `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`;
    msg.textContent      = text;
  };

  if (!oldPw || !newPw || !confPw) return showMsg('Tous les champs sont requis.', false);
  if (newPw !== confPw)            return showMsg('Les mots de passe ne correspondent pas.', false);
  if (newPw.length < 6)            return showMsg('Minimum 6 caractères.', false);

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: oldPw, newPassword: newPw }),
    });
    const d = await res.json();
    if (res.ok) {
      showMsg('✅ Mot de passe modifié avec succès.', true);
      document.getElementById('_prefs-old-pw').value    = '';
      document.getElementById('_prefs-new-pw').value    = '';
      document.getElementById('_prefs-confirm-pw').value = '';
    } else {
      showMsg(d.error || 'Erreur lors du changement.', false);
    }
  } catch (e) {
    showMsg('Erreur réseau.', false);
  }
};

// ── Charge les préférences notifications ──────────────────────────────────────
async function _loadNotifPrefs() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return;
    const d = await res.json();
    const u = d.user;
    if (!u) return;
    ['pref_mail_assign','pref_mail_comment','pref_mail_status','pref_mail_mention'].forEach(k => {
      const el = document.getElementById(`_notif-${k}`);
      if (el) el.checked = !!u[k];
    });
  } catch {}
}

// ── Enregistre les préférences notifications ──────────────────────────────────
window._saveNotifPrefs = async function() {
  const data = {};
  ['pref_mail_assign','pref_mail_comment','pref_mail_status','pref_mail_mention'].forEach(k => {
    data[k] = document.getElementById(`_notif-${k}`)?.checked ? 1 : 0;
  });

  const msg = document.getElementById('_prefs-notif-msg');
  try {
    const res = await fetch('/api/auth/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    msg.style.display    = '';
    msg.style.background = res.ok ? 'var(--color-success-bg)' : 'var(--color-danger-bg)';
    msg.style.color      = res.ok ? 'var(--color-success)'    : 'var(--color-danger)';
    msg.style.border     = `1px solid ${res.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`;
    msg.textContent      = res.ok ? '✅ Préférences enregistrées.' : '❌ Erreur lors de l\'enregistrement.';
  } catch {
    msg.style.display = '';
    msg.textContent   = '❌ Erreur réseau.';
  }
};