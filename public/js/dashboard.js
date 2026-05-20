// public/js/dashboard.js — v3.0
// Synchronisé avec dashboard.html (nouveau design system)

'use strict';

// ══════════════════════════════════════════════════════════════════
//  ÉTAT GLOBAL
// ══════════════════════════════════════════════════════════════════

let map           = null;
let allMapData    = [];
let mapMarkers    = [];
let currentUser   = null;
let currentFilters = ['all']; // Multi-sélection

const cityCoords = {
  Aarau:[47.3919,8.0458], Baden:[47.4724,8.3064], Bern:[46.948,7.4474],
  Biel:[47.1372,7.2459], Basel:[47.5596,7.5886], 'Biel-Benken':[47.5056,7.5533],
  Fribourg:[46.8036,7.1517], Genève:[46.2044,6.1432], Lausanne:[46.5197,6.6323],
  Zürich:[47.3769,8.5417], Winterthur:[47.5,8.75], Neuchâtel:[46.99,6.9298]
};

const cantonCoords = {
  AG:[47.4,8.15], AI:[47.32,9.42], AR:[47.37,9.3], BE:[46.95,7.45],
  BL:[47.48,7.73], BS:[47.56,7.59], FR:[46.8,7.15], GE:[46.2,6.15],
  GL:[47.04,9.07], GR:[46.85,9.53], JU:[47.35,7.15], LU:[47.05,8.3],
  NE:[47.0,6.93], NW:[46.93,8.38], OW:[46.88,8.25], SG:[47.42,9.37],
  SH:[47.7,8.63], SO:[47.3,7.53], SZ:[47.02,8.65], TG:[47.55,9.0],
  TI:[46.33,8.8], UR:[46.88,8.63], VD:[46.57,6.65], VS:[46.23,7.36],
  ZG:[47.17,8.52], ZH:[47.37,8.54]
};

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  applyWidgetVisibility();
  initMap();
  setupMapFilters();
  loadNotifDot();

  await Promise.allSettled([
    loadStats(),
    loadAlerts(),
    loadAppointments(),
    loadContacts(),
    loadMaintenanceMonth(),
    loadTicketsWidget(),
    loadActivityWidget(),
    loadMapData(),
    loadPendingReportsWidget(),
  ]);

  // Refresh toutes les 60s
  setInterval(() => {
    loadStats();
    loadAlerts();
    loadAppointments();
    loadContacts();
    loadTicketsWidget();
    loadActivityWidget();
    loadNotifDot();
  }, 60000);
});

// ══════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════

async function checkAuth() {
  try {
    const res  = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    currentUser = data.user;

    const roleMap = {
      admin: 'Administrateur', validator: 'Validateur',
      verifier: 'Vérificateur', verificateur: 'Vérificateur',
      secretary: 'Secrétariat', tech: 'Technicien'
    };

    // Sidebar user card
    const avatar = document.getElementById('user-avatar');
    const name   = document.getElementById('user-name');
    const role   = document.getElementById('user-role');
    const legacy = document.getElementById('user-info'); // compatibilité loader.js

    if (avatar) avatar.textContent = data.user.name.charAt(0).toUpperCase();
    if (name)   name.textContent   = data.user.name;
    if (role)   role.textContent   = roleMap[data.user.role] || data.user.role;
    if (legacy) legacy.innerHTML   = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details">
        <strong>${escHtml(data.user.name)}</strong>
        <span>${roleMap[data.user.role] || data.user.role}</span>
      </div>`;
  } catch { window.location.href = '/login.html'; }
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATIONS (dot)
// ══════════════════════════════════════════════════════════════════

async function loadNotifDot() {
  try {
    const data = await fetch('/api/notifications').then(r => r.json());
    const unread = data.filter(n => !n.is_read).length;
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = unread ? 'block' : 'none';
  } catch {}
}

async function loadNotifications() {
  const el = document.getElementById('notif-list');
  if (!el) return;
  try {
    const data = await fetch('/api/notifications').then(r => r.json());
    const unread = data.filter(n => !n.is_read).length;
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = unread ? 'block' : 'none';

    if (!data.length) {
      el.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Aucune notification</p></div>';
      return;
    }
    el.innerHTML = data.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" id="notif-${n.id}">
        <div class="notif-icon" style="background:var(--bg-tertiary);color:var(--color-primary)">
          <i class="fas fa-info-circle"></i>
        </div>
        <div class="notif-body" onclick="markNotifRead(${n.id})" style="cursor:pointer">
          <div class="notif-message">${escHtml(n.message)}</div>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
        <button class="notif-delete" onclick="deleteNotif(${n.id})"><i class="fas fa-times"></i></button>
      </div>`).join('');
  } catch {}
}

window.toggleNotifications = function() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (open) loadNotifications();
};

window.markNotifRead = async function(id) {
  await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
  document.getElementById(`notif-${id}`)?.classList.remove('unread');
  loadNotifDot();
};

window.markAllRead = async function() {
  await fetch('/api/notifications/read-all', { method: 'PUT' });
  document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('unread'));
  document.getElementById('notif-dot').style.display = 'none';
};

window.deleteNotif = async function(id) {
  await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
  const el = document.getElementById(`notif-${id}`);
  if (el) el.remove();
  loadNotifDot();
};

window.deleteAllNotifs = async function() {
  const ok = await showConfirm({ title: 'Tout supprimer ?', message: 'Supprimer toutes les notifications ?', type: 'danger' });
  if (!ok) return;
  await fetch('/api/notifications/all', { method: 'DELETE' });
  document.getElementById('notif-list').innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Aucune notification</p></div>';
  document.getElementById('notif-dot').style.display = 'none';
};

// ══════════════════════════════════════════════════════════════════
//  STATS KPIs
// ══════════════════════════════════════════════════════════════════

async function loadStats() {
  try {
    const [statsRes, expiredRes, warningRes] = await Promise.all([
      fetch('/api/dashboard/stats'),
      fetch('/api/dashboard/details?type=expired'),
      fetch('/api/dashboard/details?type=warning'),
    ]);
    const s       = await statsRes.json();
    const expired = await expiredRes.json();
    const warning = await warningRes.json();

    setText('stat-expired',    expired.length);
    setText('stat-warning',    warning.length);
    setText('stat-uptodate',   `${s.clientsUpToDate}/${s.totalClients}`);
    setText('stat-equipment',  s.equipmentInstalled);
  } catch (e) { console.error(e); }
}

// Clic sur les KPIs → modal détails
window.openDetails = async function(type) {
  const titles = {
    expired: 'Maintenances expirées',
    warning: 'À planifier (30 prochains jours)'
  };
  openModal('details-modal');
  document.getElementById('details-modal-title').textContent = titles[type] || 'Détails';
  document.getElementById('details-modal-body').innerHTML = spinnerHtml();

  try {
    const data = await fetch(`/api/dashboard/details?type=${type}`).then(r => r.json());
    if (!data.length) {
      document.getElementById('details-modal-body').innerHTML =
        '<p style="text-align:center;padding:40px;color:var(--text-tertiary)">Aucune donnée.</p>';
      return;
    }
    document.getElementById('details-modal-body').innerHTML = buildGroupedTable(data, type);
  } catch {
    document.getElementById('details-modal-body').innerHTML =
      '<p style="color:var(--color-danger);text-align:center;padding:20px">Erreur de chargement.</p>';
  }
};

function buildGroupedTable(rows, type) {
  const color = type === 'expired' ? 'var(--color-danger)' : 'var(--color-warning)';
  const groups = {};
  rows.forEach(r => {
    if (!groups[r.client_id]) groups[r.client_id] = { name: r.cabinet_name, city: r.city, id: r.client_id, machines: [] };
    groups[r.client_id].machines.push(r);
  });

  let rows_html = '';
  Object.values(groups).forEach((g, i) => {
    const gid = `grp-${i}`;
    if (g.machines.length === 1) {
      const m = g.machines[0];
      rows_html += `
        <tr onclick="window.location.href='/clients.html?open=${g.id}'" style="cursor:pointer;border-bottom:1px solid var(--border-primary);">
          <td style="padding:10px 14px"><strong style="color:var(--text-primary)">${escHtml(g.name)}</strong><br><small style="color:var(--text-tertiary)">${escHtml(g.city)}</small></td>
          <td style="padding:10px 14px;color:var(--text-secondary)">${escHtml(m.catalog_name || m.name || '—')}<br><small>${escHtml(m.brand || '')}</small></td>
          <td style="padding:10px 14px;font-weight:700;color:${color}">${fmtDate(m.next_maintenance_date)}</td>
          <td style="padding:10px 14px;text-align:right;color:var(--color-primary)"><i class="fas fa-arrow-right"></i></td>
        </tr>`;
    } else {
      const worst = g.machines.map(m => m.next_maintenance_date).sort()[0];
      rows_html += `
        <tr onclick="toggleGroup('${gid}', this)" style="cursor:pointer;border-bottom:1px solid var(--border-primary);">
          <td style="padding:10px 14px"><strong style="color:var(--text-primary)">${escHtml(g.name)}</strong><br><small style="color:var(--text-tertiary)">${escHtml(g.city)}</small></td>
          <td style="padding:10px 14px"><span style="background:${type==='expired'?'var(--color-danger-bg)':'var(--color-warning-bg)'};color:${color};padding:2px 8px;border-radius:2px;font-size:11px;font-weight:700">${g.machines.length} appareils</span></td>
          <td style="padding:10px 14px;font-weight:700;color:${color}">${fmtDate(worst)}</td>
          <td style="padding:10px 14px;text-align:right"><i class="fas fa-chevron-down" id="icon-${gid}" style="transition:transform 0.2s;color:var(--text-tertiary)"></i></td>
        </tr>
        <tr id="${gid}" style="display:none;background:var(--bg-secondary)">
          <td colspan="4" style="padding:0 14px 12px 28px">
            ${g.machines.map(m => `
              <div onclick="window.location.href='/clients.html?open=${g.id}'" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--border-primary);cursor:pointer;">
                <span style="color:var(--text-secondary);font-size:var(--text-sm)">${escHtml(m.catalog_name || m.name || '—')} <span style="color:var(--text-tertiary)">(${escHtml(m.brand || '')})</span></span>
                <strong style="color:${color};font-size:var(--text-sm)">${fmtDate(m.next_maintenance_date)}</strong>
              </div>`).join('')}
          </td>
        </tr>`;
    }
  });

  return `
    <table style="width:100%;border-collapse:collapse;">
      <thead style="background:var(--bg-secondary)">
        <tr>
          <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary)">Client</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary)">Appareil</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary)">Échéance</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>`;
}

window.toggleGroup = function(id, row) {
  const tr   = document.getElementById(id);
  const icon = document.getElementById(`icon-${id}`);
  if (!tr) return;
  const open = tr.style.display === 'none';
  tr.style.display   = open ? 'table-row' : 'none';
  if (icon) icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
};

// ══════════════════════════════════════════════════════════════════
//  WIDGET — RENDEZ-VOUS
// ══════════════════════════════════════════════════════════════════

async function loadAppointments() {
  const el = document.getElementById('appointments-list');
  if (!el) return;
  try {
    const data = await fetch('/api/dashboard/upcoming-appointments').then(r => r.json());
    if (!data.length) { el.innerHTML = emptyHtml('fa-calendar-times', 'Aucun RDV prévu'); return; }
    el.innerHTML = data.slice(0, 6).map(a => `
      <div class="w-item" onclick="window.location.href='/clients.html?open=${a.client_id}'" style="cursor:pointer">
        <div class="w-item-icon" style="background:var(--color-info-bg);color:var(--color-info)">
          <i class="fas fa-calendar-alt"></i>
        </div>
        <div class="w-item-body">
          <div class="w-item-title">${escHtml(a.cabinet_name)}</div>
          <div class="w-item-sub">
            <i class="fas fa-calendar" style="color:var(--color-primary);margin-right:3px"></i>${fmtDate(a.appointment_date)}
            ${a.technician_names ? `&nbsp;·&nbsp;<i class="fas fa-user" style="margin-right:3px"></i>${escHtml(a.technician_names)}` : '<span style="font-style:italic;color:var(--text-tertiary)"> Non assigné</span>'}
          </div>
        </div>
        <button onclick="event.stopPropagation();window.location.href='/clients.html?open=${a.client_id}&edit_rdv=${a.appointment_id}'"
          style="background:none;border:1px solid var(--border-primary);border-radius:3px;padding:4px 8px;color:var(--text-tertiary);cursor:pointer;font-size:11px;">
          <i class="fas fa-pen"></i>
        </button>
      </div>`).join('') +
      (data.length > 6 ? `<div style="text-align:center;padding:8px;border-top:1px solid var(--border-primary)"><a href="#" onclick="openStatPopup('appointments_full');return false;" style="font-size:var(--text-xs);color:var(--color-primary)">Voir tous les ${data.length} RDV →</a></div>` : '');
  } catch { el.innerHTML = errorHtml(); }
}

// ══════════════════════════════════════════════════════════════════
//  WIDGET — CLIENTS À CONTACTER
// ══════════════════════════════════════════════════════════════════

async function loadContacts() {
  const el = document.getElementById('contacts-list');
  if (!el) return;
  try {
    const data = await fetch('/api/dashboard/clients-to-contact').then(r => r.json());
    if (!data.length) { el.innerHTML = emptyHtml('fa-smile', 'Tout est à jour'); return; }
    el.innerHTML = data.slice(0, 6).map(c => {
      const expired = new Date(c.maintenance_due_date) < new Date();
      return `
        <div class="w-item" onclick="window.location.href='/clients.html?open=${c.id}'" style="cursor:pointer">
          <div class="w-item-icon" style="background:${expired ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)'};color:${expired ? 'var(--color-danger)' : 'var(--color-warning)'}">
            <i class="fas fa-${expired ? 'exclamation-triangle' : 'clock'}"></i>
          </div>
          <div class="w-item-body">
            <div class="w-item-title">${escHtml(c.cabinet_name)}</div>
            <div class="w-item-sub">${escHtml(c.phone || '—')} &nbsp;·&nbsp; Échéance : <strong style="color:${expired?'var(--color-danger)':'var(--color-warning)'}">${fmtDate(c.maintenance_due_date)}</strong></div>
          </div>
          ${c.phone ? `<a href="tel:${escHtml(c.phone)}" onclick="event.stopPropagation()" style="background:none;border:1px solid var(--color-success);border-radius:3px;padding:4px 8px;color:var(--color-success);font-size:11px;text-decoration:none;"><i class="fas fa-phone"></i></a>` : ''}
        </div>`;
    }).join('') +
      (data.length > 6 ? `<div style="text-align:center;padding:8px;border-top:1px solid var(--border-primary)"><a href="#" onclick="openStatPopup('contacts_full');return false;" style="font-size:var(--text-xs);color:var(--color-primary)">Voir tous les ${data.length} clients →</a></div>` : '');
  } catch { el.innerHTML = errorHtml(); }
}

// ══════════════════════════════════════════════════════════════════
//  WIDGET — MAINTENANCES DU MOIS
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
//  ALERTES CROSS-MODULES
// ══════════════════════════════════════════════════════════════════

async function loadAlerts() {
  try {
    const data = await fetch('/api/dashboard/alerts').then(r => r.json());

    // ── KPIs ──────────────────────────────────────────────────────
    setText('kpi-reports', data.reportsPending);
    setText('kpi-rmas',    data.rmasActive);
    setText('kpi-loans',   data.loansActive);

    const rmaOverdueEl = document.getElementById('kpi-rmas-overdue');
    if (rmaOverdueEl) {
      rmaOverdueEl.textContent = data.rmasOverdue;
      rmaOverdueEl.style.color = data.rmasOverdue > 0 ? 'var(--color-danger)' : 'var(--text-tertiary)';
    }
    const loanOverdueEl = document.getElementById('kpi-loans-overdue');
    if (loanOverdueEl) {
      loanOverdueEl.textContent = data.loansOverdue;
      loanOverdueEl.style.color = data.loansOverdue > 0 ? 'var(--color-danger)' : 'var(--text-tertiary)';
    }

    // Colore les stat-cards si urgence
    const rmaCard = document.getElementById('kpi-rmas')?.closest('.stat-card');
    if (rmaCard) rmaCard.style.borderTopColor = data.rmasOverdue > 0 ? 'var(--color-danger)' : '#8b5cf6';

    const loanCard = document.getElementById('kpi-loans')?.closest('.stat-card');
    if (loanCard) loanCard.style.borderTopColor = data.loansOverdue > 0 ? 'var(--color-danger)' : '#8b5cf6';

    // ── Widgets ───────────────────────────────────────────────────
    loadRmasWidget(data.rmasUrgent, data.rmasOverdue);
    loadLoansWidget(data.loansOverdueList, data.loansOverdue);

  } catch (e) { console.error('Alerts:', e); }
}

function loadRmasWidget(rmas, overdueCount) {
  const el = document.getElementById('rmas-list');
  if (!el) return;

  // Badge
  const badge = document.getElementById('badge-rmas');
  if (badge && rmas.length) {
    badge.textContent = rmas.length;
    badge.style.display = 'inline-block';
  }

  if (!rmas.length) {
    el.innerHTML = emptyHtml('fa-check-circle', 'Aucun RMA urgent cette semaine');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  el.innerHTML = rmas.map(r => {
    const isOverdue = r.due_date < today;
    const daysLeft  = Math.ceil((new Date(r.due_date) - new Date()) / 86400000);
    const color     = isOverdue ? 'var(--color-danger)' : 'var(--color-warning)';
    const label     = isOverdue
      ? `${Math.abs(daysLeft)}j de retard`
      : daysLeft === 0 ? "Aujourd'hui !" : `J+${daysLeft}`;
    return `
      <div class="w-item" onclick="window.location.href='/rmas.html?open=${r.id}'" style="cursor:pointer;border-left:3px solid ${color};">
        <div class="w-item-icon" style="background:${isOverdue ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)'};color:${color};">
          <i class="fas fa-${isOverdue ? 'exclamation-triangle' : 'clock'}"></i>
        </div>
        <div class="w-item-body">
          <div class="w-item-title">${escHtml(r.rma_number || '#' + r.id)} — ${escHtml(r.cabinet_name || '—')}</div>
          <div class="w-item-sub">
            ${escHtml(r.equipment_name || r.supplier_name || '—')}
            &nbsp;·&nbsp;
            <strong style="color:${color};">${label}</strong>
          </div>
        </div>
        <i class="fas fa-arrow-right" style="color:var(--text-tertiary);font-size:11px;flex-shrink:0;"></i>
      </div>`;
  }).join('') +
  `<div style="padding:8px 14px;text-align:center;border-top:1px solid var(--border-primary);">
    <a href="/rmas.html" style="font-size:var(--text-xs);color:var(--color-primary);text-decoration:none;font-weight:600;">
      Voir tous les RMAs →
    </a>
  </div>`;
}

function loadLoansWidget(loans, overdueCount) {
  const el = document.getElementById('loans-overdue-list');
  if (!el) return;

  // Badge
  const badge = document.getElementById('badge-loans');
  if (badge && overdueCount > 0) {
    badge.textContent = overdueCount;
    badge.style.display = 'inline-block';
  }

  if (!loans.length) {
    el.innerHTML = emptyHtml('fa-check-circle', 'Aucun prêt en retard');
    return;
  }

  el.innerHTML = loans.map(l => {
    const days = Math.ceil((new Date() - new Date(l.expected_return_date)) / 86400000);
    return `
      <div class="w-item" onclick="window.location.href='/loans.html'" style="cursor:pointer;border-left:3px solid var(--color-danger);">
        <div class="w-item-icon" style="background:var(--color-danger-bg);color:var(--color-danger);">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <div class="w-item-body">
          <div class="w-item-title">${escHtml(l.device_name)}${l.device_brand ? ` — ${escHtml(l.device_brand)}` : ''}</div>
          <div class="w-item-sub">
            <i class="fas fa-hospital" style="font-size:10px;opacity:0.5;margin-right:3px;"></i>
            ${escHtml(l.cabinet_name || 'Client inconnu')}
            &nbsp;·&nbsp;
            <strong style="color:var(--color-danger);">${days}j de retard</strong>
          </div>
        </div>
        <i class="fas fa-arrow-right" style="color:var(--text-tertiary);font-size:11px;flex-shrink:0;"></i>
      </div>`;
  }).join('') +
  `<div style="padding:8px 14px;text-align:center;border-top:1px solid var(--border-primary);">
    <a href="/loans.html" style="font-size:var(--text-xs);color:var(--color-primary);text-decoration:none;font-weight:600;">
      Voir tous les prêts →
    </a>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════
//  WIDGET — RAPPORTS EN ATTENTE
// ══════════════════════════════════════════════════════════════════

async function loadPendingReportsWidget() {
  try {
    const res = await fetch('/api/reports/stats');
    if (!res.ok) return;
    const stats = await res.json();
    const pending   = stats.pending   || 0;
    const validated = stats.validated || 0;

    // Met à jour le KPI si loadAlerts n'est pas encore passé
    if (pending > 0) setText('kpi-reports', pending);

    // Widget dédié si présent
    const el = document.getElementById('pending-reports-list');
    if (!el) return;
    if (!pending && !validated) {
      el.innerHTML = emptyHtml('fa-check-circle', 'Aucun rapport en attente');
      return;
    }
    el.innerHTML = `
      <div class="w-item" onclick="window.location.href='/reports.html'" style="cursor:pointer;">
        <div class="w-item-icon" style="background:rgba(249,115,22,0.1);color:#f97316;">
          <i class="fas fa-file-signature"></i>
        </div>
        <div class="w-item-body">
          <div class="w-item-title">${pending} rapport${pending > 1 ? 's' : ''} à valider</div>
          <div class="w-item-sub">${validated} validé${validated > 1 ? 's' : ''} récemment</div>
        </div>
        <i class="fas fa-arrow-right" style="color:var(--text-tertiary);font-size:11px;"></i>
      </div>`;
  } catch (e) { console.error('Reports widget:', e); }
}

async function loadMaintenanceMonth() {
  const el = document.getElementById('maintenance-list');
  if (!el) return;
  try {
    const data = await fetch('/api/dashboard/details?type=warning').then(r => r.json());
    if (!data.length) { el.innerHTML = emptyHtml('fa-check-circle', 'Aucune maintenance imminente'); return; }
    el.innerHTML = data.slice(0, 6).map(m => `
      <div class="w-item" onclick="window.location.href='/clients.html?open=${m.client_id}'" style="cursor:pointer">
        <div class="w-item-icon" style="background:var(--color-warning-bg);color:var(--color-warning)">
          <i class="fas fa-wrench"></i>
        </div>
        <div class="w-item-body">
          <div class="w-item-title">${escHtml(m.cabinet_name)}</div>
          <div class="w-item-sub">${escHtml(m.catalog_name || '—')} &nbsp;·&nbsp; ${fmtDate(m.next_maintenance_date)}</div>
        </div>
      </div>`).join('');
  } catch { el.innerHTML = errorHtml(); }
}

// ══════════════════════════════════════════════════════════════════
//  WIDGET — TICKETS (riche)
// ══════════════════════════════════════════════════════════════════

async function loadTicketsWidget() {
  const el = document.getElementById('tickets-list');
  if (!el) return;
  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) { el.innerHTML = emptyHtml('fa-ticket-alt', 'Aucun ticket'); return; }
    const tickets = await res.json();
    const list    = Array.isArray(tickets) ? tickets : (tickets.tickets || []);

    if (!list.length) { el.innerHTML = emptyHtml('fa-ticket-alt', 'Aucun ticket ouvert'); return; }

    const uid     = String(currentUser?.id || '');
    const active  = list.filter(t => t.status !== 'Clôturé');
    const urgent  = active.filter(t => t.is_urgent === 1);
    const unassigned = active.filter(t => t.is_urgent !== 1 && (!t.assigned_ids || t.assigned_ids === ''));
    const mine    = active.filter(t => t.is_urgent !== 1 && t.assigned_ids && t.assigned_ids.split(',').includes(uid));
    const others  = active.filter(t => t.is_urgent !== 1 && t.assigned_ids && !t.assigned_ids.split(',').includes(uid));

    // Badge total
    const badge = document.getElementById('badge-tickets');
    if (badge && active.length) { badge.textContent = active.length; badge.style.display = 'inline-block'; }

    const sectionHdr = (bg, color, icon, text, count) =>
      `<div style="padding:5px 14px;background:${bg};border-bottom:1px solid var(--border-primary);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${color}"><i class="fas ${icon}" style="margin-right:5px"></i>${text}</span>
        <span style="font-size:10px;font-weight:700;color:${color};background:${color}20;padding:1px 7px;border-radius:2px;">${count}</span>
      </div>`;

    const ticketRow = (t, accentColor) => {
      const priorityColors = { urgent:'var(--color-danger)', high:'var(--color-warning)', normal:'var(--color-info)', low:'var(--neutral-400)' };
      const pColor = priorityColors[t.priority] || 'var(--color-info)';
      return `
        <div class="w-item" onclick="window.location.href='/tickets.html?open=${t.id}'" style="cursor:pointer;border-left:3px solid ${accentColor}">
          <div style="width:8px;height:8px;border-radius:50%;background:${pColor};flex-shrink:0;margin-top:4px"></div>
          <div class="w-item-body">
            <div class="w-item-title" style="color:${t.is_urgent ? 'var(--color-danger)' : 'var(--text-primary)'}">#${t.id} — ${escHtml(t.title || t.subject || 'Sans titre')}</div>
            <div class="w-item-sub">
              ${t.cabinet_name ? `<i class="fas fa-hospital" style="font-size:10px;margin-right:3px;color:var(--text-tertiary)"></i>${escHtml(t.cabinet_name)}&nbsp;·&nbsp;` : ''}
              ${t.status} &nbsp;·&nbsp; ${timeAgo(t.created_at)}
            </div>
          </div>
          <i class="fas fa-arrow-right" style="color:var(--text-tertiary);font-size:11px;flex-shrink:0"></i>
        </div>`;
    };

    let html = '';

    if (urgent.length) {
      html += sectionHdr('var(--color-danger-bg)', 'var(--color-danger)', 'fa-exclamation-triangle', 'Urgences', urgent.length);
      html += urgent.slice(0, 3).map(t => ticketRow(t, 'var(--color-danger)')).join('');
    }

    if (unassigned.length) {
      html += sectionHdr('var(--color-warning-bg)', 'var(--color-warning)', 'fa-inbox', 'Non assignés', unassigned.length);
      html += unassigned.slice(0, 3).map(t => ticketRow(t, 'var(--color-warning)')).join('');
    }

    if (mine.length) {
      html += sectionHdr('var(--color-info-bg)', 'var(--color-info)', 'fa-user', 'Mes tickets', mine.length);
      html += mine.slice(0, 3).map(t => ticketRow(t, 'var(--color-info)')).join('');
    }

    if (others.length && !urgent.length && !unassigned.length && !mine.length) {
      html += sectionHdr('var(--bg-tertiary)', 'var(--text-secondary)', 'fa-ticket-alt', 'Tickets actifs', others.length);
      html += others.slice(0, 4).map(t => ticketRow(t, 'var(--border-secondary)')).join('');
    }

    if (!html) {
      html = emptyHtml('fa-check-circle', 'Aucun ticket en attente');
    } else {
      html += `<div style="padding:8px 14px;text-align:center;border-top:1px solid var(--border-primary)">
        <a href="/tickets.html" style="font-size:var(--text-xs);color:var(--color-primary);text-decoration:none;font-weight:600">
          Voir tous les tickets (${active.length}) →
        </a>
      </div>`;
    }

    el.innerHTML = html;
  } catch (e) { console.error(e); el.innerHTML = errorHtml(); }
}

// ══════════════════════════════════════════════════════════════════
//  WIDGET — ACTIVITÉ
// ══════════════════════════════════════════════════════════════════

async function loadActivityWidget() {
  const el = document.getElementById('activity-list');
  if (!el) return;
  try {
    const data = await fetch('/api/notifications').then(r => r.json());
    if (!data.length) { el.innerHTML = emptyHtml('fa-bed', 'Aucune activité récente'); return; }
    el.innerHTML = data.slice(0, 5).map(n => `
      <div class="w-item" style="${n.is_read ? '' : 'background:rgba(44,90,160,0.04);border-left:3px solid var(--color-primary);'}">
        <div class="w-item-body">
          <div class="w-item-title" style="font-weight:${n.is_read ? 'normal' : '600'}">${escHtml(n.message)}</div>
          <div class="w-item-sub"><i class="far fa-clock" style="margin-right:3px"></i>${timeAgo(n.created_at)}</div>
        </div>
      </div>`).join('') +
      `<div style="padding:8px 14px;text-align:center;border-top:1px solid var(--border-primary)">
        <a href="#" onclick="openActivityModal();return false;" style="font-size:var(--text-xs);color:var(--color-primary);text-decoration:none;font-weight:600">Voir tout l'historique →</a>
      </div>`;
  } catch { el.innerHTML = errorHtml(); }
}

window.openActivityModal = async function() {
  openModal('details-modal');
  document.getElementById('details-modal-title').textContent = 'Historique d\'activité';
  document.getElementById('details-modal-body').innerHTML = spinnerHtml();
  try {
    const data = await fetch('/api/notifications').then(r => r.json());
    if (!data.length) {
      document.getElementById('details-modal-body').innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-tertiary)">Aucune activité.</p>';
      return;
    }
    document.getElementById('details-modal-body').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;padding:16px;">
        ${data.map(n => `
          <div style="padding:12px 14px;border:1px solid var(--border-primary);background:${n.is_read ? 'var(--bg-elevated)' : 'rgba(44,90,160,0.04)'};border-radius:3px;">
            <div style="font-size:var(--text-sm);color:var(--text-primary);font-weight:${n.is_read ? 'normal' : '600'}">${escHtml(n.message)}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px"><i class="far fa-clock"></i> ${new Date(n.created_at).toLocaleString('fr-CH')}</div>
          </div>`).join('')}
      </div>`;
  } catch {
    document.getElementById('details-modal-body').innerHTML = '<p style="color:var(--color-danger);text-align:center;padding:20px">Erreur.</p>';
  }
};

// ══════════════════════════════════════════════════════════════════
//  WIDGET — RAPPORTS EN ATTENTE
// ══════════════════════════════════════════════════════════════════

// (loadPendingReportsWidget is defined above with loadAlerts)


// ══════════════════════════════════════════════════════════════════
//  MODALS POPUP STATS
// ══════════════════════════════════════════════════════════════════

window.openStatPopup = async function(type) {
  openModal('details-modal');
  const titleEl = document.getElementById('details-modal-title');
  const bodyEl  = document.getElementById('details-modal-body');
  bodyEl.innerHTML = spinnerHtml();

  try {
    if (type === 'appointments_full') {
      const data = await fetch('/api/dashboard/upcoming-appointments').then(r => r.json());
      titleEl.textContent = `Agenda complet (${data.length} RDV)`;
      bodyEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--bg-secondary)">
            <tr>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-tertiary)">Client</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-tertiary)">Technicien</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-tertiary)">Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${data.map(a => `
              <tr onclick="window.location.href='/clients.html?open=${a.client_id}'" style="cursor:pointer;border-bottom:1px solid var(--border-primary)">
                <td style="padding:10px 14px"><strong style="color:var(--text-primary)">${escHtml(a.cabinet_name)}</strong><br><small style="color:var(--text-tertiary)">${escHtml(a.city||'')}</small></td>
                <td style="padding:10px 14px;color:var(--text-secondary)">${a.technician_names || '<span style="font-style:italic;color:var(--text-tertiary)">Non assigné</span>'}</td>
                <td style="padding:10px 14px;font-weight:600;color:var(--text-primary)">${fmtDate(a.appointment_date)}</td>
                <td style="padding:10px 14px;text-align:right"><button onclick="event.stopPropagation();window.location.href='/clients.html?open=${a.client_id}&edit_rdv=${a.appointment_id}'" style="background:none;border:1px solid var(--border-primary);border-radius:3px;padding:4px 8px;color:var(--text-tertiary);cursor:pointer;font-size:11px;"><i class="fas fa-pen"></i></button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;

    } else if (type === 'contacts_full') {
      const data = await fetch('/api/dashboard/clients-to-contact').then(r => r.json());
      titleEl.textContent = `Clients à contacter (${data.length})`;
      bodyEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--bg-secondary)">
            <tr>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-tertiary)">Client</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-tertiary)">Téléphone</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-tertiary)">Échéance</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(c => `
              <tr onclick="window.location.href='/clients.html?open=${c.id}'" style="cursor:pointer;border-bottom:1px solid var(--border-primary)">
                <td style="padding:10px 14px"><strong style="color:var(--text-primary)">${escHtml(c.cabinet_name)}</strong></td>
                <td style="padding:10px 14px;color:var(--text-secondary)">${c.phone ? `<a href="tel:${escHtml(c.phone)}" onclick="event.stopPropagation()" style="color:var(--color-primary)">${escHtml(c.phone)}</a>` : '—'}</td>
                <td style="padding:10px 14px;font-weight:700;color:var(--color-danger)">${fmtDate(c.maintenance_due_date)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;

    } else {
      await window.openDetails(type);
      return;
    }
  } catch {
    bodyEl.innerHTML = '<p style="color:var(--color-danger);text-align:center;padding:20px">Erreur.</p>';
  }
};

// ══════════════════════════════════════════════════════════════════
//  CARTE LEAFLET
// ══════════════════════════════════════════════════════════════════

function initMap() {
  try {
    map = L.map('map', {
      closePopupOnClick: false,
    }).setView([46.8, 8.2], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
 
    // Init popup custom après création de la carte
    setTimeout(() => initCustomPopup(), 100);
  } catch {}
}
function initCustomPopup() {
  // Crée un div popup custom au-dessus de la carte
  const el = document.createElement('div');
  el.id = 'map-custom-popup';
  el.style.cssText = `
    position: absolute;
    z-index: 9999;
    display: none;
    width: 280px;
    background: #fff;
    border-radius: 6px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    pointer-events: auto;
    font-family: -apple-system,'Segoe UI',Arial,sans-serif;
  `;
 
  // Bouton fermer
  el.addEventListener('click', e => e.stopPropagation());
 
  const mapContainer = document.getElementById('map');
  mapContainer.style.position = 'relative';
  mapContainer.appendChild(el);
 
  // Ferme au clic sur la carte (pas sur le popup)
  map.on('click', () => closeCustomPopup());
 
  return el;
}

function closeCustomPopup() {
  const el = document.getElementById('map-custom-popup');
  if (el) el.style.display = 'none';
}

function showCustomPopup(c, latlng, color, statusLabel, visibleEq) {
  const el = document.getElementById('map-custom-popup');
  if (!el) return;
 
  const eqRows = visibleEq.map(e => {
    const next   = e.next_maintenance_date ? new Date(e.next_maintenance_date) : null;
    const diff   = next ? Math.ceil((next - new Date()) / 86400000) : null;
    const bColor = diff === null ? '#94a3b8' : diff < 0 ? '#ef4444' : diff <= 30 ? '#f59e0b' : '#10b981';
    const bText  = diff === null ? '?' : diff < 0 ? 'Expiré' : diff === 0 ? 'Auj.' : `J+${diff}`;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:5px 10px;border-bottom:1px solid #f1f5f9;gap:8px;">
        <span style="font-size:12px;color:#334155;flex:1;min-width:0;
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${escHtml(e.name || '')} <span style="color:#94a3b8;font-size:11px;">${escHtml(e.brand || '')}</span>
        </span>
        <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:2px;
          white-space:nowrap;flex-shrink:0;
          background:${bColor}18;color:${bColor};border:1px solid ${bColor}30;">
          ${bText}
        </span>
      </div>`;
  }).join('');
 
  // Largeur responsive
  const mapEl  = document.getElementById('map');
  const mapW   = mapEl.offsetWidth;
  const popW   = Math.min(280, mapW - 20);
 
  el.style.width = popW + 'px';
 
  el.innerHTML = `
    <div style="background:${color};color:#fff;padding:12px 14px;border-radius:6px 6px 0 0;
      display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
      <div style="min-width:0;">
        <div style="font-size:14px;font-weight:700;line-height:1.3;margin-bottom:2px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escHtml(c.cabinet_name)}
        </div>
        <div style="font-size:11px;opacity:0.88;">● ${statusLabel}</div>
      </div>
      <button onclick="closeCustomPopup()"
        style="background:rgba(255,255,255,0.25);border:none;color:#fff;
          width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:15px;
          line-height:1;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        ×
      </button>
    </div>
 
    <div style="padding:10px 14px 6px;">
      ${c.contact_name ? `<div style="font-size:12px;color:#475569;margin-bottom:4px;display:flex;gap:6px;align-items:flex-start;"><span style="flex-shrink:0;">👤</span><span>${escHtml(c.contact_name)}</span></div>` : ''}
      ${c.address      ? `<div style="font-size:12px;color:#475569;margin-bottom:4px;display:flex;gap:6px;align-items:flex-start;"><span style="flex-shrink:0;">📍</span><span>${escHtml(c.address)}${c.city ? ', ' + escHtml(c.city) : ''}</span></div>` : ''}
      ${c.phone        ? `<div style="font-size:12px;margin-bottom:2px;display:flex;gap:6px;align-items:center;"><span style="flex-shrink:0;">📞</span><a href="tel:${escHtml(c.phone)}" style="color:${color};font-weight:600;text-decoration:none;">${escHtml(c.phone)}</a></div>` : ''}
    </div>
 
    ${visibleEq.length ? `
      <div style="padding:0 14px 8px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;
          color:#94a3b8;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
          🔧 ÉQUIPEMENTS
          <span style="background:#f1f5f9;color:#64748b;padding:1px 6px;border-radius:2px;">${visibleEq.length}</span>
        </div>
        <div style="border:1px solid #f1f5f9;border-radius:4px;overflow:hidden;
          max-height:160px;overflow-y:auto;">
          ${eqRows}
        </div>
      </div>` : `
      <div style="padding:0 14px 10px;">
        <div style="padding:8px;background:#f8fafc;border-radius:4px;
          font-size:12px;color:#94a3b8;text-align:center;">
          📭 Aucun équipement
        </div>
      </div>`}
 
    <div style="padding:10px 14px;border-top:1px solid #f1f5f9;background:#f8fafc;border-radius:0 0 6px 6px;">
      <button onclick="window.location.href='/clients.html?open=${c.id}'"
        style="width:100%;padding:8px;background:${color};color:#fff;border:none;
          border-radius:4px;font-size:12px;font-weight:700;cursor:pointer;">
        → Voir la fiche complète
      </button>
    </div>
  `;
 
  // Affiche d'abord pour mesurer la hauteur réelle
  el.style.left    = '-9999px';
  el.style.top     = '-9999px';
  el.style.display = 'block';
 
  const popH  = el.offsetHeight;
  const point = map.latLngToContainerPoint(latlng);
 
  // Position idéale : centré au-dessus du marqueur
  let left = point.x - popW / 2;
  let top  = point.y - popH - 16;
 
  // Si trop haut → affiche en dessous
  if (top < 10) top = point.y + 16;
 
  // Contraintes horizontales
  const margin = 8;
  if (left < margin) left = margin;
  if (left + popW > mapW - margin) left = mapW - popW - margin;
 
  // Contraintes verticales
  const mapH = mapEl.offsetHeight;
  if (top + popH > mapH - margin) top = mapH - popH - margin;
  if (top < margin) top = margin;
 
  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
}

async function loadMapData() {
  try {
    const clients = await fetch('/api/dashboard/clients-map').then(r => r.json());
    // Charge les équipements en parallèle pour le filtre fantôme
    allMapData = await Promise.all(clients.map(async c => {
      try {
        const eq = await fetch(`/api/clients/${c.id}/equipment`).then(r => r.json());
        return { ...c, equipment: eq };
      } catch { return { ...c, equipment: [] }; }
    }));
    updateMapMarkers();
  } catch {}
}

function getClientCoords(client) {
  if (client.latitude && client.longitude) return [client.latitude, client.longitude];
  const city = (client.city || '').trim();
  if (cityCoords[city]) return cityCoords[city];
  const base = cantonCoords[client.canton] || [46.8, 8.2];
  return [base[0] + (Math.random() - 0.5) * 0.05, base[1] + (Math.random() - 0.5) * 0.05];
}

function updateMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  const filtered = allMapData.filter(c => {
    if (currentFilters.includes('all')) return c.status !== 'ghost';
    let match = currentFilters.includes(c.status);
    if (!match && currentFilters.includes('ghost')) {
      const hasSecondary = c.equipment?.some(e => e.is_secondary === 1 || e.catalog_is_secondary === 1);
      if (c.status === 'ghost' || hasSecondary) match = true;
    }
    return match;
  });

  const statusColors = {
    ok:      '#16a34a',
    warning: '#f59e0b',
    expired: '#dc2626',
    planned: '#3b82f6',
    ghost:   '#94a3b8',
  };

  const statusLabels = {
    ok:      'À jour',
    warning: 'Bientôt',
    expired: 'Expiré',
    planned: 'RDV planifié',
    ghost:   'Hors contrat',
  };

  filtered.forEach(c => {
    const coords = getClientCoords(c);

    let displayStatus = c.status;
    if (!currentFilters.includes('all') && !currentFilters.includes(c.status) && currentFilters.includes('ghost')) {
      displayStatus = 'ghost';
    }

    const color = statusColors[displayStatus] || '#94a3b8';

    const marker = L.circleMarker(coords, {
      radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.85,
    }).addTo(map);

    // Équipements visibles selon le filtre actif
    let visibleEq = c.equipment || [];
    if (currentFilters.includes('all')) {
      visibleEq = visibleEq.filter(e => e.is_secondary !== 1 && e.catalog_is_secondary !== 1);
    } else if (!currentFilters.includes(c.status) && currentFilters.includes('ghost')) {
      visibleEq = visibleEq.filter(e => e.is_secondary === 1 || e.catalog_is_secondary === 1);
    }

    // Lignes équipements
    const eqRows = visibleEq.map(e => {
      const next   = e.next_maintenance_date ? new Date(e.next_maintenance_date) : null;
      const diff   = next ? Math.ceil((next - new Date()) / 86400000) : null;
      const bColor = diff === null ? '#94a3b8' : diff < 0 ? '#ef4444' : diff <= 30 ? '#f59e0b' : '#10b981';
      const bText  = diff === null ? '?' : diff < 0 ? 'Expiré' : diff === 0 ? 'Auj.' : `J+${diff}`;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:5px 10px;border-bottom:1px solid #f1f5f9;gap:8px;">
          <span style="font-size:12px;color:#334155;flex:1;min-width:0;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escHtml(e.name || '')}
            <span style="color:#94a3b8;"> ${escHtml(e.brand || '')}</span>
          </span>
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:2px;
            white-space:nowrap;flex-shrink:0;
            background:${bColor}18;color:${bColor};border:1px solid ${bColor}30;">
            ${bText}
          </span>
        </div>`;
    }).join('');

    marker.on('click', function(e) {
  L.DomEvent.stopPropagation(e);
  showCustomPopup(c, e.latlng, color, statusLabels[displayStatus] || displayStatus, visibleEq);
});
 
// ET SUPPRIME mapMarkers.push(marker) → non, garde-le :
mapMarkers.push(marker);
  });
}

// ══════════════════════════════════════════════════════════════════
//  FILTRES CARTE (multi-sélection + fantôme)
// ══════════════════════════════════════════════════════════════════

function setupMapFilters() {
  const container = document.querySelector('.map-filters');
  if (!container) return;

  // Ajoute le bouton fantôme s'il n'existe pas
  if (!container.querySelector('[data-filter="ghost"]')) {
    const btn = document.createElement('button');
    btn.className = 'map-filter-btn';
    btn.dataset.filter = 'ghost';
    btn.innerHTML = '<i class="fas fa-ghost"></i> Hors contrat';
    container.appendChild(btn);
  }

  container.querySelectorAll('.map-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.filter;

      if (val === 'all') {
        // Tous → désélectionne tout le reste
        currentFilters = ['all'];
        container.querySelectorAll('.map-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else {
        // Désactive "Tous"
        container.querySelector('[data-filter="all"]')?.classList.remove('active');
        currentFilters = currentFilters.filter(f => f !== 'all');

        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          currentFilters = currentFilters.filter(f => f !== val);
        } else {
          btn.classList.add('active');
          currentFilters.push(val);
        }

        // Si rien de sélectionné → retour à "Tous"
        if (!currentFilters.length) {
          currentFilters = ['all'];
          container.querySelector('[data-filter="all"]')?.classList.add('active');
        }
      }

      updateMapMarkers();
    });
  });
}

// ══════════════════════════════════════════════════════════════════
//  PERSONNALISATION WIDGETS
// ══════════════════════════════════════════════════════════════════

const WIDGET_KEYS = {
  appointments: 'widget-appointments',
  contacts:     'widget-contacts',
  maintenance:  'widget-maintenance',
  warranty:     'widget-warranty',
  tickets:      'widget-tickets',
  activity:     'widget-activity',
  rmas:         'widget-rmas',     // ← ajouter
  loans:        'widget-loans',    // ← ajouter
  map:          'widget-map',
};
function applyWidgetVisibility() {
  try {
    const saved = JSON.parse(localStorage.getItem('kbmed_hidden_widgets') || '[]');
    Object.entries(WIDGET_KEYS).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', saved.includes(key));
    });
  } catch {}
}

window.openCustomize = function() {
  const hidden = JSON.parse(localStorage.getItem('kbmed_hidden_widgets') || '[]');

  const widgets = [
    { key: 'appointments', icon: 'fa-calendar-alt',   label: 'Rendez-vous',        desc: 'Prochains RDV prévus' },
    { key: 'contacts',     icon: 'fa-phone',          label: 'À contacter',         desc: 'Clients avec maintenance expirée' },
    { key: 'maintenance',  icon: 'fa-wrench',         label: 'Maintenances',        desc: 'Prévues dans les 30 jours' },
    { key: 'warranty',     icon: 'fa-shield-alt',     label: 'Garanties',           desc: 'Équipements expirant bientôt' },
    { key: 'tickets',      icon: 'fa-ticket-alt',     label: 'Tickets & Urgences',  desc: 'Suivi des demandes actives' },
    { key: 'rmas',  icon: 'fa-exchange-alt', label: 'RMAs urgents',     desc: 'RMAs dépassant leur échéance' },
    { key: 'loans', icon: 'fa-handshake',    label: 'Prêts en retard',  desc: 'Prêts non retournés à temps' },
    { key: 'activity',     icon: 'fa-rss',            label: 'Flux d\'activité',    desc: 'Dernières actions du système' },
    { key: 'map',          icon: 'fa-map-marked-alt', label: 'Carte clients',       desc: 'Vue géographique interactive' },
  ];

  const grid = document.getElementById('customize-grid');
  if (grid) {
    grid.innerHTML = widgets.map(w => {
      const active = !hidden.includes(w.key);
      return `
        <label class="customize-item ${active ? 'active' : ''}" id="ci-${w.key}"
          style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid ${active ? 'var(--color-primary)' : 'var(--border-primary)'};border-radius:3px;cursor:pointer;background:${active ? 'rgba(44,90,160,0.06)' : 'var(--bg-secondary)'};transition:all 0.15s;">
          <input type="checkbox" value="${w.key}" ${active ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer;"
            onchange="document.getElementById('ci-${w.key}').style.borderColor=this.checked?'var(--color-primary)':'var(--border-primary)';document.getElementById('ci-${w.key}').style.background=this.checked?'rgba(44,90,160,0.06)':'var(--bg-secondary)'">
          <i class="fas ${w.icon}" style="color:var(--color-primary);width:16px;text-align:center;font-size:13px;"></i>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--font-semibold);color:var(--text-primary)">${w.label}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:1px">${w.desc}</div>
          </div>
        </label>`;
    }).join('');
  }

  openModal('customize-modal');
};

window.saveCustomize = function() {
  const hidden = [];
  document.querySelectorAll('#customize-grid input[type="checkbox"]').forEach(cb => {
    if (!cb.checked) hidden.push(cb.value);
  });
  localStorage.setItem('kbmed_hidden_widgets', JSON.stringify(hidden));
  applyWidgetVisibility();
  closeModal('customize-modal');
  if (window.toast) toast.success('Dashboard mis à jour', 'Vos préférences ont été enregistrées.');
};

// ══════════════════════════════════════════════════════════════════
//  MODAL HELPERS
// ══════════════════════════════════════════════════════════════════

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

window.openModal  = openModal;
window.closeModal = closeModal;

// Fermeture au clic sur le backdrop
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('active');
  }
});

// ══════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ══════════════════════════════════════════════════════════════════

function escHtml(t) {
  if (!t) return '';
  const d = document.createElement('div');
  d.textContent = String(t);
  return d.innerHTML;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return new Intl.DateTimeFormat('fr-CH').format(dt);
}

function timeAgo(d) {
  const diff = Math.round((Date.now() - new Date(d)) / 60000);
  if (diff < 1)    return 'À l\'instant';
  if (diff < 60)   return `Il y a ${diff} min`;
  if (diff < 1440) return `Il y a ${Math.round(diff/60)}h`;
  return `Il y a ${Math.round(diff/1440)}j`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function emptyHtml(icon, msg) {
  return `<div class="w-empty"><i class="fas ${icon}"></i><p>${msg}</p></div>`;
}

function errorHtml() {
  return `<div class="w-empty"><i class="fas fa-exclamation-triangle" style="color:var(--color-danger)"></i><p>Erreur de chargement</p></div>`;
}

function spinnerHtml() {
  return `<div style="text-align:center;padding:48px;color:var(--text-tertiary)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>`;
}

// Compatibilité loader.js
window.openClientFromMap = function(id) { window.location.href = `/clients.html?open=${id}`; };