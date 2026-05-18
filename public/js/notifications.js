// public/js/notifications.js
// KB Med — Système de notifications unifié (identique au dashboard)
// Injecte automatiquement la cloche + le panel sur toutes les pages

'use strict';

let lastKnownNotifId = 0;
let isFirstLoad      = true;

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  injectBellButton();
  injectPanel();
  loadNotifications();
  setInterval(loadNotifications, 30000); // Refresh toutes les 30s
});

// ══════════════════════════════════════════════════════════════════
//  INJECTION CSS
// ══════════════════════════════════════════════════════════════════

function injectStyles() {
  if (document.getElementById('kb-notif-styles')) return;
  const style = document.createElement('style');
  style.id = 'kb-notif-styles';
  style.innerHTML = `
    /* ─ CLOCHE ─────────────────────────────────────── */
    .kb-notif-bell-wrap {
      position: relative;
      flex-shrink: 0;
    }

    .kb-notif-bell {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg-secondary, #f3f4f6);
      border: 1px solid var(--border-primary, #e5e7eb);
      border-radius: 3px;
      color: var(--text-secondary, #6b7280);
      font-size: 15px;
      cursor: pointer;
      position: relative;
      transition: all 0.15s;
    }

    .kb-notif-bell:hover {
      background: var(--bg-tertiary, #e5e7eb);
      color: var(--color-primary, #2c5aa0);
    }

    .kb-notif-dot {
      position: absolute;
      top: -3px; right: -3px;
      width: 10px; height: 10px;
      background: var(--color-danger, #ef4444);
      border-radius: 50%;
      border: 2px solid var(--bg-elevated, #fff);
      display: none;
    }

    .kb-notif-dot.visible { display: block; }

    /* ─ PANEL SLIDE-IN ──────────────────────────────── */
    .kb-notif-panel {
      position: fixed;
      top: 0; right: -380px;
      width: 360px;
      height: 100vh;
      background: var(--bg-elevated, #fff);
      border-left: 1px solid var(--border-primary, #e5e7eb);
      box-shadow: -4px 0 20px rgba(0,0,0,0.08);
      z-index: 1500;
      display: flex;
      flex-direction: column;
      transition: right 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .kb-notif-panel.open { right: 0; }

    .kb-notif-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.2);
      z-index: 1499;
      backdrop-filter: blur(1px);
    }

    .kb-notif-overlay.visible { display: block; }

    /* ─ PANEL HEADER ────────────────────────────────── */
    .kb-notif-head {
      padding: 16px 18px;
      border-bottom: 1px solid var(--border-primary, #e5e7eb);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      background: var(--bg-secondary, #f9fafb);
    }

    .kb-notif-head-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-primary, #111827);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kb-notif-head-title i {
      color: var(--color-primary, #2c5aa0);
    }

    .kb-notif-count {
      background: var(--color-danger, #ef4444);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 999px;
      display: none;
    }

    .kb-notif-count.visible { display: inline-block; }

    .kb-notif-head-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kb-notif-action-btn {
      background: none;
      border: 1px solid var(--border-primary, #e5e7eb);
      border-radius: 3px;
      color: var(--text-tertiary, #9ca3af);
      font-size: 11px;
      padding: 4px 8px;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .kb-notif-action-btn:hover {
      background: var(--bg-tertiary, #e5e7eb);
      color: var(--text-primary, #111827);
    }

    .kb-notif-action-btn.danger:hover {
      background: var(--color-danger-bg, #fee2e2);
      color: var(--color-danger, #ef4444);
      border-color: var(--color-danger, #ef4444);
    }

    .kb-notif-close {
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      background: none;
      border: 1px solid var(--border-primary, #e5e7eb);
      border-radius: 3px;
      color: var(--text-tertiary, #9ca3af);
      cursor: pointer;
      font-size: 14px;
      transition: all 0.15s;
    }

    .kb-notif-close:hover {
      background: var(--bg-tertiary, #e5e7eb);
      color: var(--text-primary, #111827);
    }

    /* ─ LISTE ───────────────────────────────────────── */
    .kb-notif-list {
      flex: 1;
      overflow-y: auto;
    }

    .kb-notif-list::-webkit-scrollbar { width: 4px; }
    .kb-notif-list::-webkit-scrollbar-thumb {
      background: var(--border-primary, #e5e7eb);
      border-radius: 999px;
    }

    .kb-notif-item {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-primary, #e5e7eb);
      cursor: pointer;
      transition: background 0.12s;
      display: flex;
      gap: 12px;
      align-items: flex-start;
      position: relative;
    }

    .kb-notif-item:hover { background: var(--bg-secondary, #f9fafb); }
    .kb-notif-item.unread { background: rgba(44,90,160,0.04); }

    .kb-notif-item.unread::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 3px;
      background: var(--color-primary, #2c5aa0);
    }

    .kb-notif-icon {
      width: 32px; height: 32px;
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
    }

    .kb-icon-info    { background: rgba(59,130,246,0.12);  color: #3b82f6; }
    .kb-icon-success { background: rgba(16,185,129,0.12);  color: #10b981; }
    .kb-icon-warning { background: rgba(245,158,11,0.12);  color: #f59e0b; }
    .kb-icon-error   { background: rgba(239,68,68,0.12);   color: #ef4444; }

    .kb-notif-body { flex: 1; min-width: 0; }

    .kb-notif-msg {
      font-size: 0.82rem;
      color: var(--text-primary, #111827);
      line-height: 1.45;
      margin-bottom: 3px;
    }

    .kb-notif-time {
      font-size: 0.73rem;
      color: var(--text-tertiary, #9ca3af);
    }

    .kb-notif-del {
      position: absolute;
      right: 10px; top: 10px;
      background: none;
      border: none;
      color: var(--text-tertiary, #9ca3af);
      cursor: pointer;
      padding: 4px;
      border-radius: 3px;
      opacity: 0;
      transition: all 0.12s;
      font-size: 12px;
    }

    .kb-notif-item:hover .kb-notif-del { opacity: 1; }
    .kb-notif-del:hover { color: var(--color-danger, #ef4444); background: var(--color-danger-bg, #fee2e2); }

    .kb-notif-empty {
      padding: 60px 20px;
      text-align: center;
      color: var(--text-tertiary, #9ca3af);
    }

    .kb-notif-empty i {
      font-size: 32px;
      display: block;
      margin-bottom: 12px;
      opacity: 0.2;
    }

    .kb-notif-empty p {
      font-size: 0.85rem;
      margin: 0;
    }

    /* ─ TOASTS ──────────────────────────────────────── */
    #kb-toast-container {
      position: fixed;
      top: 20px; right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .kb-toast {
      background: var(--bg-elevated, #fff);
      border-left: 4px solid var(--color-primary, #2c5aa0);
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      border-radius: 3px;
      padding: 12px 14px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      min-width: 260px;
      max-width: 360px;
      transform: translateX(120%);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: auto;
    }

    .kb-toast.show { transform: translateX(0); }
    .kb-toast.success { border-left-color: #10b981; }
    .kb-toast.warning { border-left-color: #f59e0b; }
    .kb-toast.error   { border-left-color: #ef4444; }

    .kb-toast-icon { font-size: 15px; margin-top: 1px; flex-shrink: 0; }
    .kb-toast-icon.info    { color: var(--color-primary, #2c5aa0); }
    .kb-toast-icon.success { color: #10b981; }
    .kb-toast-icon.warning { color: #f59e0b; }
    .kb-toast-icon.error   { color: #ef4444; }

    .kb-toast-body { flex: 1; min-width: 0; }

    .kb-toast-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-primary, #111827);
      margin-bottom: 2px;
    }

    .kb-toast-msg {
      font-size: 0.78rem;
      color: var(--text-secondary, #6b7280);
      line-height: 1.4;
    }

    .kb-toast-close {
      background: none;
      border: none;
      color: var(--text-tertiary, #9ca3af);
      cursor: pointer;
      font-size: 13px;
      padding: 2px;
      flex-shrink: 0;
      transition: color 0.12s;
    }

    .kb-toast-close:hover { color: var(--color-danger, #ef4444); }

    @media (max-width: 768px) {
      .kb-notif-panel { width: 100vw; right: -100vw; }
      #kb-toast-container { top: auto; bottom: 16px; right: 12px; left: 12px; }
      .kb-toast { max-width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

// ══════════════════════════════════════════════════════════════════
//  INJECTION CLOCHE dans .page-header
// ══════════════════════════════════════════════════════════════════

function injectBellButton() {
  if (document.getElementById('kb-notif-bell')) return;

  // Cherche le bon endroit dans le page-header
  const actionsGroup = document.querySelector('.page-header .header-actions-group')
                    || document.querySelector('.rma-topbar-actions')
                    || document.querySelector('.page-header');
  if (!actionsGroup) return;

  const wrap = document.createElement('div');
  wrap.className = 'kb-notif-bell-wrap';
  wrap.innerHTML = `
    <button class="kb-notif-bell" id="kb-notif-bell"
      onclick="window.kbToggleNotifPanel()" title="Notifications">
      <i class="fas fa-bell"></i>
      <span class="kb-notif-dot" id="kb-notif-dot"></span>
    </button>
  `;

  // ✅ APRÈS — toujours à la fin (extrême droite)
actionsGroup.appendChild(wrap);
}

// ══════════════════════════════════════════════════════════════════
//  INJECTION PANEL (slide-in)
// ══════════════════════════════════════════════════════════════════

function injectPanel() {
  if (document.getElementById('kb-notif-panel')) return;

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'kb-notif-overlay';
  overlay.className = 'kb-notif-overlay';
  overlay.onclick = () => window.kbToggleNotifPanel(false);
  document.body.appendChild(overlay);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'kb-notif-panel';
  panel.className = 'kb-notif-panel';
  panel.innerHTML = `
    <div class="kb-notif-head">
      <div class="kb-notif-head-title">
        <i class="fas fa-bell"></i>
        Notifications
        <span class="kb-notif-count" id="kb-notif-count"></span>
      </div>
      <div class="kb-notif-head-actions">
        <button class="kb-notif-action-btn" onclick="kbMarkAllRead()">
          <i class="fas fa-check-double"></i> Tout lu
        </button>
        <button class="kb-notif-action-btn danger" onclick="kbDeleteAllNotifs()">
          <i class="fas fa-trash-alt"></i> Vider
        </button>
        <button class="kb-notif-close" onclick="window.kbToggleNotifPanel(false)">
          &times;
        </button>
      </div>
    </div>
    <div class="kb-notif-list" id="kb-notif-list">
      <div class="kb-notif-empty">
        <i class="fas fa-bell-slash"></i>
        <p>Aucune notification</p>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // Toast container
  if (!document.getElementById('kb-toast-container')) {
    const tc = document.createElement('div');
    tc.id = 'kb-toast-container';
    document.body.appendChild(tc);
  }

  // Escape ferme le panel
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.kbToggleNotifPanel(false);
  });
}

// ══════════════════════════════════════════════════════════════════
//  TOGGLE PANEL
// ══════════════════════════════════════════════════════════════════

window.kbToggleNotifPanel = function(forceOpen) {
  const panel   = document.getElementById('kb-notif-panel');
  const overlay = document.getElementById('kb-notif-overlay');
  const bell    = document.getElementById('kb-notif-bell');
  if (!panel) return;

  const isOpen  = panel.classList.contains('open');
  const open    = forceOpen !== undefined ? forceOpen : !isOpen;

  panel.classList.toggle('open', open);
  if (overlay) overlay.classList.toggle('visible', open);
  if (bell)    bell.style.background = open ? 'var(--bg-tertiary)' : '';

  // Compatibilité dashboard (toggleNotifications)
};

// Alias pour compatibilité dashboard.html qui appelle toggleNotifications()
window.toggleNotifications = window.kbToggleNotifPanel;

// ══════════════════════════════════════════════════════════════════
//  CHARGEMENT ET RENDU
// ══════════════════════════════════════════════════════════════════

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications');
    if (!res.ok) return;
    const list = await res.json();

    // Toasts pour nouvelles notifs
    if (!isFirstLoad && list.length > 0) {
      const newNotifs = list.filter(n => n.id > lastKnownNotifId);
      newNotifs.forEach(n => showKbToast(n));
    }
    if (list.length > 0) {
      lastKnownNotifId = Math.max(...list.map(n => n.id));
    }
    isFirstLoad = false;

    renderNotifications(list);
    updateDot(list);
  } catch (e) {
    console.error('Erreur notifs:', e);
  }
}

function renderNotifications(list) {
  const container = document.getElementById('kb-notif-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="kb-notif-empty">
        <i class="fas fa-bell-slash"></i>
        <p>Aucune notification</p>
      </div>`;
    return;
  }

  const iconMap = {
    success: { icon: 'fa-check',              cls: 'kb-icon-success' },
    warning: { icon: 'fa-exclamation-triangle', cls: 'kb-icon-warning' },
    error:   { icon: 'fa-times',              cls: 'kb-icon-error'   },
    info:    { icon: 'fa-info-circle',         cls: 'kb-icon-info'    },
  };

  container.innerHTML = list.map(n => {
    const { icon, cls } = iconMap[n.type] || iconMap.info;
    const time = new Date(n.created_at).toLocaleString('fr-CH', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="kb-notif-item ${n.is_read ? '' : 'unread'}"
        id="kb-notif-item-${n.id}"
        onclick="kbHandleNotifClick(${n.id}, '${n.link || ''}')">
        <div class="kb-notif-icon ${cls}"><i class="fas ${icon}"></i></div>
        <div class="kb-notif-body">
          <div class="kb-notif-msg">${escHtml(n.message)}</div>
          <span class="kb-notif-time">${time}</span>
        </div>
        <button class="kb-notif-del" onclick="event.stopPropagation();kbDeleteNotif(${n.id})"
          title="Supprimer"><i class="fas fa-times"></i></button>
      </div>`;
  }).join('');
}

function updateDot(list) {
  const unread = list.filter(n => !n.is_read).length;

  // Point rouge sur la cloche
  const dot = document.getElementById('kb-notif-dot');
  if (dot) dot.classList.toggle('visible', unread > 0);

  // Compteur dans le panel
  const count = document.getElementById('kb-notif-count');
  if (count) {
    count.textContent = unread > 99 ? '99+' : unread;
    count.classList.toggle('visible', unread > 0);
  }

  // Compatibilité : dashboard utilise notif-dot et notif-badge
  const dashDot   = document.getElementById('notif-dot');
  const dashBadge = document.getElementById('notif-badge');
  if (dashDot)   dashDot.style.display   = unread > 0 ? 'block' : 'none';
  if (dashBadge) {
    dashBadge.textContent = unread > 99 ? '99+' : unread;
    dashBadge.classList.toggle('show', unread > 0);
  }
}

// ══════════════════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════════════════

async function kbHandleNotifClick(id, link) {
  // Marque comme lu
  await fetch(`/api/notifications/${id}/read`, { method: 'PUT' }).catch(() => {});
  const item = document.getElementById(`kb-notif-item-${id}`);
  if (item) item.classList.remove('unread');
  loadNotifications();
  if (link) window.location.href = link;
}

window.kbMarkAllRead = async function() {
  await fetch('/api/notifications/read-all', { method: 'PUT' }).catch(() => {});
  document.querySelectorAll('.kb-notif-item').forEach(el => el.classList.remove('unread'));
  loadNotifications();
};

window.kbDeleteNotif = async function(id) {
  await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
  document.getElementById(`kb-notif-item-${id}`)?.remove();
  loadNotifications();
};

window.kbDeleteAllNotifs = async function() {
  const ok = await showConfirm({
    title: 'Vider les notifications ?',
    message: 'Toutes les notifications seront supprimées.',
    type: 'danger',
    confirmText: 'Vider',
    cancelText: 'Annuler'
  });
  if (!ok) return;
  await fetch('/api/notifications/all', { method: 'DELETE' }).catch(() => {});
  loadNotifications();
};

// Aliases pour compatibilité avec l'ancien code (dashboard.js)
window.markAllRead     = window.kbMarkAllRead;
window.deleteNotif     = window.kbDeleteNotif;
window.deleteAllNotifs = window.kbDeleteAllNotifs;
window.loadNotifications = loadNotifications;

// ══════════════════════════════════════════════════════════════════
//  TOAST SYSTEM
// ══════════════════════════════════════════════════════════════════

function showKbToast(notif) {
  const container = document.getElementById('kb-toast-container');
  if (!container) return;

  const icons = {
    success: 'fa-check-circle',
    warning: 'fa-exclamation-triangle',
    error:   'fa-times-circle',
    info:    'fa-info-circle',
  };

  const toast = document.createElement('div');
  toast.className = `kb-toast ${notif.type || 'info'}`;
  toast.innerHTML = `
    <i class="fas ${icons[notif.type] || icons.info} kb-toast-icon ${notif.type || 'info'}"></i>
    <div class="kb-toast-body" onclick="kbHandleNotifClick(${notif.id}, '${notif.link || ''}');this.closest('.kb-toast').remove();" style="cursor:pointer">
      <div class="kb-toast-msg">${escHtml(notif.message)}</div>
    </div>
    <button class="kb-toast-close" onclick="this.closest('.kb-toast').remove()">&times;</button>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 30);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// API publique pour toasts manuels (window.toast.success etc.)
window.toast = {
  show: (type, title, message) => {
    const container = document.getElementById('kb-toast-container');
    if (!container) return;
    const icons = { success:'fa-check-circle', warning:'fa-exclamation-triangle', error:'fa-times-circle', info:'fa-info-circle' };
    const t = document.createElement('div');
    t.className = `kb-toast ${type}`;
    t.innerHTML = `
      <i class="fas ${icons[type]||icons.info} kb-toast-icon ${type}"></i>
      <div class="kb-toast-body">
        ${title ? `<div class="kb-toast-title">${escHtml(title)}</div>` : ''}
        ${message ? `<div class="kb-toast-msg">${escHtml(message)}</div>` : ''}
      </div>
      <button class="kb-toast-close" onclick="this.closest('.kb-toast').remove()">&times;</button>`;
    container.appendChild(t);
    setTimeout(() => t.classList.add('show'), 30);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4500);
  },
  success: (title, msg) => window.toast.show('success', title, msg),
  error:   (title, msg) => window.toast.show('error',   title, msg),
  warning: (title, msg) => window.toast.show('warning', title, msg),
  info:    (title, msg) => window.toast.show('info',    title, msg),
};

// Alias showNotification (utilisé dans checklists.js etc.)
window.showNotification = (message, type = 'info') => window.toast.show(type, message, '');

// ══════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════

function escHtml(t) {
  if (!t) return '';
  const d = document.createElement('div');
  d.textContent = String(t);
  return d.innerHTML;
}