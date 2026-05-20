// public/js/loans.js
'use strict';

// ── État global ───────────────────────────────────────────────────────────────
let allLoans   = [];
let allDevices = [];
let allClients = [];
let currentTab = 'loans';
let sortConfig = { col: 'created_at', order: 'desc' };

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadLoans(), loadDevices(), loadClients()]);
  loadStats();

  // Date de départ par défaut = aujourd'hui
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('loan-start').value = today;
  document.getElementById('return-date').value = today;
});

// ══════════════════════════════════════════════════════════════════════════════
//  CHARGEMENT DES DONNÉES
// ══════════════════════════════════════════════════════════════════════════════

async function loadLoans() {
  try {
    const res  = await fetch('/api/loans');
    const data = await res.json();
    allLoans   = Array.isArray(data) ? data : [];  // ← sécurisé
    renderLoans();
    updateKpis();
    updateTabCounts();
  } catch (e) { console.error('Loans:', e); }
}

async function loadDevices() {
  try {
    const res  = await fetch('/api/loans/devices');
    const data = await res.json();
    allDevices = Array.isArray(data) ? data : [];  // ← sécurisé
    renderDevices();
    populateDeviceSelect();
    updateTabCounts();
  } catch (e) { console.error('Devices:', e); }
}

async function loadClients() {
  try {
    const res  = await fetch('/api/clients?limit=1000');
    const data = await res.json();
    allClients = data.clients || data;
    populateClientSelects();
  } catch (e) { console.error('Clients:', e); }
}

async function loadStats() {
  try {
    const res  = await fetch('/api/loans/stats');
    const data = await res.json();
    renderStats(data);
  } catch (e) { console.error('Stats:', e); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  RENDU PRÊTS
// ══════════════════════════════════════════════════════════════════════════════

function renderLoans() {
  const tbody    = document.getElementById('loans-tbody');
  const search   = document.getElementById('loans-search').value.toLowerCase();
  const filter   = document.getElementById('filter-status').value;
  const today    = new Date().toISOString().split('T')[0];

  let filtered = allLoans.filter(l => {
    const text = `${l.device_name} ${l.device_brand} ${l.cabinet_name} ${l.reason}`.toLowerCase();
    if (search && !text.includes(search)) return false;

    if (filter === 'En cours')  return l.status === 'En cours' && (!l.expected_return_date || l.expected_return_date >= today);
    if (filter === 'En retard') return l.status === 'En cours' && l.expected_return_date && l.expected_return_date < today;
    if (filter === 'Retourné')  return l.status === 'Retourné';
    return l.status === 'En cours'; // ← par défaut : seulement les prêts actifs
  });

  // Tri
  filtered.sort((a, b) => {
    const va = (a[sortConfig.col] || '').toLowerCase?.() ?? (a[sortConfig.col] || '');
    const vb = (b[sortConfig.col] || '').toLowerCase?.() ?? (b[sortConfig.col] || '');
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortConfig.order === 'asc' ? cmp : -cmp;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="loans-empty">
      <i class="fas fa-handshake-slash"></i>
      <p>Aucun prêt trouvé.</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const isOverdue = l.status === 'En cours' && l.expected_return_date && l.expected_return_date < today;
    const badge = l.status === 'Retourné'
      ? `<span class="loan-badge badge-returned"><i class="fas fa-check"></i> Retourné</span>`
      : isOverdue
        ? `<span class="loan-badge badge-overdue"><i class="fas fa-exclamation-triangle"></i> En retard</span>`
        : `<span class="loan-badge badge-active"><i class="fas fa-clock"></i> En cours</span>`;

    const daysInfo = l.status === 'En cours' && l.expected_return_date
      ? (() => {
          const diff = Math.ceil((new Date(l.expected_return_date) - new Date()) / 86400000);
          const color = diff < 0 ? 'var(--color-danger)' : diff <= 3 ? 'var(--color-warning)' : 'var(--text-tertiary)';
          const label = diff < 0 ? `${Math.abs(diff)}j de retard` : diff === 0 ? "Aujourd'hui" : `J+${diff}`;
          return `<div style="font-size:10px;color:${color};font-weight:700;margin-top:2px;">${label}</div>`;
        })()
      : '';

    return `
      <tr onclick="openLoanDetail(${l.id})">
        <td>${badge}</td>
        <td>
          <div style="font-weight:600;">${escHtml(l.device_name)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">${escHtml(l.device_brand || '')}</div>
          ${l.serial_number ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary);margin-top:2px;">SN ${escHtml(l.serial_number)}</div>` : ''}
        </td>
        <td>${l.cabinet_name ? `<i class="fas fa-hospital" style="opacity:0.35;font-size:10px;margin-right:4px;"></i>${escHtml(l.cabinet_name)}` : '<span style="color:var(--text-tertiary);">—</span>'}</td>
        <td style="font-size:var(--text-xs);color:var(--text-secondary);">${fmtDate(l.start_date)}</td>
        <td>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${l.expected_return_date ? fmtDate(l.expected_return_date) : '—'}</div>
          ${daysInfo}
        </td>
        <td style="font-size:var(--text-xs);color:var(--text-secondary);">${escHtml(l.reason || '—')}</td>
        <td style="text-align:right;" onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px;justify-content:flex-end;">
            ${l.status === 'En cours' ? `
              <button class="btn-icon-sm btn-icon-success" onclick="openReturnModal(${l.id})" title="Marquer comme retourné">
                <i class="fas fa-undo"></i>
              </button>
              <button class="btn-icon-sm btn-icon-primary" onclick="openLoanModal(${l.id})" title="Modifier">
                <i class="fas fa-pen"></i>
              </button>` : ''}
            <button class="btn-icon-sm btn-icon-danger" onclick="deleteLoan(${l.id})" title="Supprimer">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function updateKpis() {
  const today   = new Date().toISOString().split('T')[0];
  const active  = allLoans.filter(l => l.status === 'En cours').length;
  const overdue = allLoans.filter(l => l.status === 'En cours' && l.expected_return_date && l.expected_return_date < today).length;
  const returned = allLoans.filter(l => l.status === 'Retourné').length;
  const available = allDevices.filter(d => d.status === 'Disponible').length;

  document.getElementById('kpi-active').textContent    = active;
  document.getElementById('kpi-overdue').textContent   = overdue;
  document.getElementById('kpi-returned').textContent  = returned;
  document.getElementById('kpi-available').textContent = available;

  // Badge sidebar
  if (overdue > 0) {
    document.getElementById('count-loans').textContent = overdue;
    document.getElementById('count-loans').classList.add('danger');
  } else {
    document.getElementById('count-loans').textContent = active;
    document.getElementById('count-loans').classList.remove('danger');
  }
}

function updateTabCounts() {
  document.getElementById('count-devices').textContent = allDevices.length;
}

// ══════════════════════════════════════════════════════════════════════════════
//  RENDU CATALOGUE
// ══════════════════════════════════════════════════════════════════════════════

function renderDevices() {
  const container = document.getElementById('devices-grid');
  const search    = document.getElementById('loans-search').value.toLowerCase();
 
  let devices = allDevices.filter(d => {
    const text = `${d.name} ${d.brand} ${d.serial_number}`.toLowerCase();
    return !search || text.includes(search);
  });
 
  if (!devices.length) {
    container.innerHTML = `<div class="loans-empty" style="grid-column:1/-1;">
      <i class="fas fa-boxes"></i>
      <p>Aucun appareil dans le catalogue.</p>
    </div>`;
    return;
  }
 
  const statusBadge = {
    'Disponible':     `<span class="loan-badge badge-available">● Disponible</span>`,
    'En prêt':        `<span class="loan-badge badge-loaned">● En prêt</span>`,
    'En maintenance': `<span class="loan-badge badge-maintenance">● Maintenance</span>`,
  };
 
  container.innerHTML = `
    <div style="background:var(--bg-elevated);border:1px solid var(--border-primary);overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:var(--bg-secondary);">
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Appareil</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Marque</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">N° Série</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Statut</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Prêts</th>
            <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);"></th>
          </tr>
        </thead>
        <tbody>
          ${devices.map(d => `
            <tr onclick="openDeviceDetail(${d.id})"
              style="cursor:pointer;border-bottom:1px solid var(--border-primary);transition:background 0.1s;"
              onmouseover="this.style.background='var(--bg-secondary)'"
              onmouseout="this.style.background=''">
              <td style="padding:12px 14px;">
                <div style="font-weight:600;color:var(--text-primary);">${escHtml(d.name)}</div>
                ${d.notes ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;">${escHtml(d.notes)}</div>` : ''}
              </td>
              <td style="padding:12px 14px;font-size:var(--text-sm);color:var(--text-secondary);">${escHtml(d.brand || '—')}</td>
              <td style="padding:12px 14px;font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);">${escHtml(d.serial_number || '—')}</td>
              <td style="padding:12px 14px;">${statusBadge[d.status] || ''}</td>
              <td style="padding:12px 14px;font-size:var(--text-xs);color:var(--text-tertiary);">
                ${d.active_loans > 0 ? `<span style="color:#3b82f6;font-weight:700;">${d.active_loans} actif(s)</span>` : ''}
                ${d.total_loans > 0 ? `<span style="margin-left:6px;">${d.total_loans} total</span>` : 'Aucun prêt'}
              </td>
              <td style="padding:12px 14px;text-align:right;" onclick="event.stopPropagation()">
                <button class="btn-icon-sm btn-icon-primary" onclick="openDeviceModal(${d.id})" title="Modifier">
                  <i class="fas fa-pen"></i>
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

window.openDeviceDetail = function(id) {
  const device = allDevices.find(d => d.id === id);
  if (!device) return;
 
  const statusBadge = {
    'Disponible':     `<span class="loan-badge badge-available">● Disponible</span>`,
    'En prêt':        `<span class="loan-badge badge-loaned">● En prêt</span>`,
    'En maintenance': `<span class="loan-badge badge-maintenance">● Maintenance</span>`,
  };
 
  const history = device.history || [];
 
  document.getElementById('detail-title').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <i class="fas fa-boxes" style="color:var(--color-primary);"></i>
      <span>${escHtml(device.name)}</span>
      ${statusBadge[device.status] || ''}
    </div>`;
 
  document.getElementById('detail-body').innerHTML = `
    <!-- Infos appareil -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
      <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);padding:10px 12px;">
        <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;text-transform:uppercase;margin-bottom:3px;">Marque</div>
        <div style="font-weight:600;">${escHtml(device.brand || '—')}</div>
      </div>
      <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);padding:10px 12px;">
        <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;text-transform:uppercase;margin-bottom:3px;">N° Série</div>
        <div style="font-family:var(--font-mono);font-size:11px;">${escHtml(device.serial_number || '—')}</div>
      </div>
      <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);padding:10px 12px;">
        <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;text-transform:uppercase;margin-bottom:3px;">Total prêts</div>
        <div style="font-weight:600;">${device.total_loans || 0}</div>
      </div>
    </div>
 
    ${device.notes ? `
      <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);padding:10px 12px;margin-bottom:16px;font-size:var(--text-sm);color:var(--text-secondary);">
        <strong>Notes :</strong> ${escHtml(device.notes)}
      </div>` : ''}
 
    <!-- Historique des prêts -->
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-tertiary);margin-bottom:10px;">
      <i class="fas fa-history" style="margin-right:5px;"></i> Historique des prêts
    </div>
 
    ${history.length === 0
      ? `<div style="text-align:center;padding:30px;color:var(--text-tertiary);font-style:italic;background:var(--bg-secondary);border:1px solid var(--border-primary);">
           Aucun prêt enregistré pour cet appareil.
         </div>`
      : `<div style="border:1px solid var(--border-primary);overflow:hidden;">
           <table style="width:100%;border-collapse:collapse;">
             <thead>
               <tr style="background:var(--bg-secondary);">
                 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Client</th>
                 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Départ</th>
                 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Retour</th>
                 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Durée</th>
                 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">État retour</th>
                 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);border-bottom:1px solid var(--border-primary);">Motif</th>
               </tr>
             </thead>
             <tbody>
               ${history.map(h => {
                 const start  = new Date(h.start_date);
                 const end    = h.actual_return_date ? new Date(h.actual_return_date) : null;
                 const days   = end ? Math.ceil((end - start) / 86400000) : Math.ceil((new Date() - start) / 86400000);
                 const isOpen = h.status === 'En cours';
                 return `
                   <tr style="border-bottom:1px solid var(--border-primary);">
                     <td style="padding:10px 12px;font-size:var(--text-sm);font-weight:600;">
                       ${escHtml(h.cabinet_name || '—')}
                     </td>
                     <td style="padding:10px 12px;font-size:var(--text-xs);color:var(--text-secondary);">${fmtDate(h.start_date)}</td>
                     <td style="padding:10px 12px;font-size:var(--text-xs);color:var(--text-secondary);">
                       ${h.actual_return_date
                         ? fmtDate(h.actual_return_date)
                         : `<span style="color:${h.expected_return_date && h.expected_return_date < new Date().toISOString().split('T')[0] ? 'var(--color-danger)' : '#3b82f6'};font-weight:700;">En cours</span>`}
                     </td>
                     <td style="padding:10px 12px;font-size:var(--text-xs);color:var(--text-tertiary);">
                       ${days}j${isOpen ? ' (en cours)' : ''}
                     </td>
                     <td style="padding:10px 12px;">
                       ${h.return_condition
                         ? `<span style="font-size:10px;font-weight:600;color:${h.return_condition === 'Bon état' ? '#10b981' : h.return_condition === 'Endommagé' ? 'var(--color-danger)' : 'var(--color-warning)'};">
                             ${escHtml(h.return_condition)}
                           </span>`
                         : '<span style="color:var(--text-tertiary);font-size:10px;">—</span>'}
                     </td>
                     <td style="padding:10px 12px;font-size:var(--text-xs);color:var(--text-secondary);">${escHtml(h.reason || '—')}</td>
                   </tr>`;
               }).join('')}
             </tbody>
           </table>
         </div>`}
  `;
 
  document.getElementById('detail-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('loan-detail-modal')">Fermer</button>
    <button class="btn btn-primary" onclick="closeModal('loan-detail-modal'); openDeviceModal(${device.id})">
      <i class="fas fa-pen"></i> Modifier l'appareil
    </button>
  `;
 
  document.getElementById('loan-detail-modal').classList.add('active');
};

// ══════════════════════════════════════════════════════════════════════════════
//  RENDU STATISTIQUES
// ══════════════════════════════════════════════════════════════════════════════

function renderStats(data) {
  const grid = document.getElementById('stats-grid');

  const maxLoans   = Math.max(...(data.topDevices || []).map(d => d.loan_count), 1);
  const maxClients = Math.max(...(data.topClients || []).map(c => c.loan_count), 1);

  const deviceStatus = (data.devices || []);
  const totalDevices = deviceStatus.reduce((s, d) => s + d.count, 0) || 1;

  grid.innerHTML = `
    <!-- Top Appareils -->
    <div class="stats-card">
      <div class="stats-card-header">
        <i class="fas fa-star" style="color:var(--color-primary);"></i>
        Appareils les plus demandés
      </div>
      <div class="stats-card-body">
        ${data.topDevices?.length ? data.topDevices.map(d => `
          <div class="stats-bar-item">
            <div class="stats-bar-label" title="${escHtml(d.name)}">${escHtml(d.name)}</div>
            <div class="stats-bar-track">
              <div class="stats-bar-fill" style="width:${Math.round((d.loan_count/maxLoans)*100)}%"></div>
            </div>
            <div class="stats-bar-val">${d.loan_count}</div>
          </div>
          <div style="font-size:10px;color:var(--text-tertiary);margin:-6px 0 8px 0;padding-left:152px;">
            Durée moy. : ${d.avg_days || '—'} jour(s)
          </div>`).join('')
        : '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">Aucune donnée.</p>'}
      </div>
    </div>

    <!-- Top Clients -->
    <div class="stats-card">
      <div class="stats-card-header">
        <i class="fas fa-hospital" style="color:var(--color-primary);"></i>
        Clients les plus actifs
      </div>
      <div class="stats-card-body">
        ${data.topClients?.length ? data.topClients.map(c => `
          <div class="stats-bar-item">
            <div class="stats-bar-label" title="${escHtml(c.cabinet_name)}">${escHtml(c.cabinet_name)}</div>
            <div class="stats-bar-track">
              <div class="stats-bar-fill" style="width:${Math.round((c.loan_count/maxClients)*100)}%"></div>
            </div>
            <div class="stats-bar-val">${c.loan_count}</div>
          </div>`).join('')
        : '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">Aucune donnée.</p>'}
      </div>
    </div>

    <!-- Disponibilité parc -->
    <div class="stats-card">
      <div class="stats-card-header">
        <i class="fas fa-boxes" style="color:var(--color-primary);"></i>
        Disponibilité du parc
      </div>
      <div class="stats-card-body">
        ${deviceStatus.map(s => {
          const colors = { 'Disponible': '#10b981', 'En prêt': '#3b82f6', 'En maintenance': '#f59e0b' };
          return `<div class="stats-bar-item">
            <div class="stats-bar-label">${escHtml(s.status)}</div>
            <div class="stats-bar-track">
              <div class="stats-bar-fill" style="width:${Math.round((s.count/totalDevices)*100)}%;background:${colors[s.status]||'var(--color-primary)'}"></div>
            </div>
            <div class="stats-bar-val">${s.count}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Résumé global -->
    <div class="stats-card">
      <div class="stats-card-header">
        <i class="fas fa-chart-line" style="color:var(--color-primary);"></i>
        Résumé global
      </div>
      <div class="stats-card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${[
            { label: 'Prêts actifs',    val: data.active,    color: '#3b82f6' },
            { label: 'En retard',       val: data.overdue,   color: 'var(--color-danger)' },
            { label: 'Total retournés', val: data.returned,  color: '#10b981' },
            { label: 'Total appareils', val: totalDevices,   color: 'var(--color-primary)' },
          ].map(item => `
            <div style="text-align:center;padding:16px;background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:3px;">
              <div style="font-size:2rem;font-weight:800;color:${item.color};">${item.val}</div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-top:4px;">${item.label}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
//  TABS ET FILTRES
// ══════════════════════════════════════════════════════════════════════════════

function switchTab(tab) {
  currentTab = tab;
  ['loans', 'catalogue', 'stats'].forEach(t => {
    document.getElementById(`view-${t === 'catalogue' ? 'catalogue' : t === 'stats' ? 'stats' : 'loans'}`).style.display = 'none';
    document.getElementById(`tab-${t}`).classList.remove('active');
  });

  document.getElementById(`view-${tab === 'catalogue' ? 'catalogue' : tab === 'stats' ? 'stats' : 'loans'}`).style.display = '';
  document.getElementById(`tab-${tab}`).classList.add('active');

  const newLoanBtn   = document.getElementById('btn-new-loan');
  const newDeviceBtn = document.getElementById('btn-new-device');
  newLoanBtn.style.display   = tab === 'loans'     ? '' : 'none';
  newDeviceBtn.style.display = tab === 'catalogue' ? '' : 'none';

  if (tab === 'stats') loadStats();
}

window.filterLoans = function() {
  if (currentTab === 'loans')     renderLoans();
  if (currentTab === 'catalogue') renderDevices();
};

window.sortLoans = function(col) {
  if (sortConfig.col === col) sortConfig.order = sortConfig.order === 'asc' ? 'desc' : 'asc';
  else { sortConfig.col = col; sortConfig.order = 'asc'; }
  renderLoans();
};

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL PRÊT
// ══════════════════════════════════════════════════════════════════════════════

window.openLoanModal = function(id = null) {
  const form = document.getElementById('loan-form');
  form.reset();
  document.getElementById('loan-id').value = '';
  document.getElementById('loan-start').value = new Date().toISOString().split('T')[0];

  if (id) {
    const loan = allLoans.find(l => l.id === id);
    if (!loan) return;

    // ✅ Repeuple le select en incluant l'appareil actuel du prêt
    const currentDevice = allDevices.find(d => d.id === loan.device_id);
    const available     = allDevices.filter(d => d.status === 'Disponible');
    const options       = currentDevice && !available.find(d => d.id === currentDevice.id)
        ? [currentDevice, ...available]
        : available;

    document.getElementById('loan-device').innerHTML =
        '<option value="">-- Sélectionner un appareil --</option>' +
        options.map(d =>
            `<option value="${d.id}">${escHtml(d.name)}${d.brand ? ` — ${escHtml(d.brand)}` : ''}${d.serial_number ? ` (${escHtml(d.serial_number)})` : ''}</option>`
        ).join('');

    // Reste inchangé
    document.getElementById('loan-modal-title').innerHTML = `...`;
    document.getElementById('loan-id').value           = loan.id;
    document.getElementById('loan-device').value       = loan.device_id;
    document.getElementById('loan-client').value       = loan.client_id || '';
    document.getElementById('loan-start').value        = loan.start_date;
    document.getElementById('loan-expected-return').value = loan.expected_return_date || '';
    document.getElementById('loan-reason').value       = loan.reason || '';
    document.getElementById('loan-notes').value        = loan.notes || '';
    // En mode édition, l'appareil ne peut pas changer
    document.getElementById('loan-device').disabled = true;
  } else {
    document.getElementById('loan-modal-title').innerHTML =
      `<i class="fas fa-plus-circle" style="color:var(--color-primary)"></i> Nouveau prêt`;
    document.getElementById('loan-device').disabled = false;
  }

  document.getElementById('loan-modal').classList.add('active');
};

window.saveLoan = async function() {
  const id      = document.getElementById('loan-id').value;
  const device  = document.getElementById('loan-device').value;
  const start   = document.getElementById('loan-start').value;

  if (!device || !start) {
    if (window.toast) toast.error('Champs requis', 'Appareil et date de départ obligatoires.');
    return;
  }

  const data = {
    device_id:            parseInt(device),
    client_id:            document.getElementById('loan-client').value || null,
    start_date:           start,
    expected_return_date: document.getElementById('loan-expected-return').value || null,
    reason:               document.getElementById('loan-reason').value || null,
    notes:                document.getElementById('loan-notes').value || null,
  };

  try {
    const res = await fetch(id ? `/api/loans/${id}` : '/api/loans', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });

    if (res.ok) {
      closeModal('loan-modal');
      await loadLoans();
      await loadDevices();
      if (window.toast) toast.success(id ? 'Prêt modifié' : 'Prêt créé', '');
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error);
    }
  } catch (e) { console.error(e); }
};

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL RETOUR
// ══════════════════════════════════════════════════════════════════════════════

window.openReturnModal = function(id) {
  document.getElementById('return-loan-id').value = id;
  document.getElementById('return-date').value    = new Date().toISOString().split('T')[0];
  document.getElementById('return-condition').value = '';
  document.getElementById('return-notes').value   = '';
  document.getElementById('return-modal').classList.add('active');
};

window.confirmReturn = async function() {
  const id        = document.getElementById('return-loan-id').value;
  const condition = document.getElementById('return-condition').value;

  if (!condition) {
    if (window.toast) toast.error('Champ requis', "L'état à la réception est obligatoire.");
    return;
  }

  try {
    const res = await fetch(`/api/loans/${id}/return`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        actual_return_date: document.getElementById('return-date').value,
        return_condition:   condition,
        return_notes:       document.getElementById('return-notes').value || null,
      }),
    });

    if (res.ok) {
      closeModal('return-modal');
      await loadLoans();
      await loadDevices();
      if (window.toast) toast.success('Retour enregistré', 'L\'appareil est de nouveau disponible.');
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error);
    }
  } catch (e) { console.error(e); }
};

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL APPAREIL (CATALOGUE)
// ══════════════════════════════════════════════════════════════════════════════

window.openDeviceModal = function(id = null) {
  document.getElementById('device-id').value    = '';
  document.getElementById('device-name').value  = '';
  document.getElementById('device-brand').value = '';
  document.getElementById('device-serial').value = '';
  document.getElementById('device-status').value = 'Disponible';
  document.getElementById('device-notes').value  = '';
  document.getElementById('btn-delete-device').style.display = 'none';

  if (id) {
    const device = allDevices.find(d => d.id === id);
    if (!device) return;
    document.getElementById('device-modal-title').innerHTML =
      `<i class="fas fa-pen" style="color:var(--color-primary)"></i> Modifier l'appareil`;
    document.getElementById('device-id').value     = device.id;
    document.getElementById('device-name').value   = device.name;
    document.getElementById('device-brand').value  = device.brand || '';
    document.getElementById('device-serial').value = device.serial_number || '';
    document.getElementById('device-status').value = device.status;
    document.getElementById('device-notes').value  = device.notes || '';
    if (device.active_loans === 0) {
      document.getElementById('btn-delete-device').style.display = '';
    }
  } else {
    document.getElementById('device-modal-title').innerHTML =
      `<i class="fas fa-plus-circle" style="color:var(--color-primary)"></i> Ajouter un appareil`;
  }

  document.getElementById('device-modal').classList.add('active');
};

window.saveDevice = async function() {
  const id   = document.getElementById('device-id').value;
  const name = document.getElementById('device-name').value.trim();

  if (!name) {
    if (window.toast) toast.error('Champ requis', 'Le nom est obligatoire.');
    return;
  }

  const data = {
    name,
    brand:         document.getElementById('device-brand').value || null,
    serial_number: document.getElementById('device-serial').value || null,
    status:        document.getElementById('device-status').value,
    notes:         document.getElementById('device-notes').value || null,
  };

  try {
    const res = await fetch(id ? `/api/loans/devices/${id}` : '/api/loans/devices', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });

    if (res.ok) {
      closeModal('device-modal');
      await loadDevices();
      if (window.toast) toast.success(id ? 'Appareil modifié' : 'Appareil ajouté', name);
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error);
    }
  } catch (e) { console.error(e); }
};

window.deleteDevice = async function() {
  const id = document.getElementById('device-id').value;
  const ok = await confirmDelete('cet appareil');
  if (!ok) return;

  try {
    const res = await fetch(`/api/loans/devices/${id}`, { method: 'DELETE' });
    if (res.ok) {
      closeModal('device-modal');
      await loadDevices();
      if (window.toast) toast.success('Appareil supprimé', '');
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error);
    }
  } catch (e) { console.error(e); }
};

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL DÉTAIL PRÊT
// ══════════════════════════════════════════════════════════════════════════════

window.openLoanDetail = function(id) {
  const loan = allLoans.find(l => l.id === id);
  if (!loan) return;

  const today     = new Date().toISOString().split('T')[0];
  const isOverdue = loan.status === 'En cours' && loan.expected_return_date && loan.expected_return_date < today;

  document.getElementById('detail-title').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span>Prêt #${loan.id}</span>
      ${isOverdue
        ? `<span class="loan-badge badge-overdue"><i class="fas fa-exclamation-triangle"></i> En retard</span>`
        : loan.status === 'Retourné'
          ? `<span class="loan-badge badge-returned"><i class="fas fa-check"></i> Retourné</span>`
          : `<span class="loan-badge badge-active"><i class="fas fa-clock"></i> En cours</span>`}
    </div>`;

  document.getElementById('detail-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:10px;letter-spacing:0.06em;">
          Appareil
        </div>
        <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);padding:12px;">
          <div style="font-weight:700;font-size:var(--text-base);">${escHtml(loan.device_name)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${escHtml(loan.device_brand || '')}</div>
          ${loan.serial_number ? `<div style="font-family:var(--font-mono);font-size:11px;margin-top:4px;">SN: ${escHtml(loan.serial_number)}</div>` : ''}
        </div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:10px;letter-spacing:0.06em;">
          Client
        </div>
        <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);padding:12px;">
          ${loan.cabinet_name
            ? `<div style="font-weight:700;">${escHtml(loan.cabinet_name)}</div>`
            : `<div style="color:var(--text-tertiary);font-style:italic;">Aucun client associé</div>`}
        </div>
      </div>
    </div>

    <div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${[
        { label: 'Date de départ',    val: fmtDate(loan.start_date) },
        { label: 'Retour prévu',      val: loan.expected_return_date ? fmtDate(loan.expected_return_date) : '—' },
        { label: 'Retour effectif',   val: loan.actual_return_date  ? fmtDate(loan.actual_return_date)  : '—' },
      ].map(f => `
        <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);padding:10px 12px;">
          <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${f.label}</div>
          <div style="font-weight:600;font-size:var(--text-sm);">${f.val}</div>
        </div>`).join('')}
    </div>

    ${loan.reason || loan.notes ? `
    <div style="margin-top:14px;background:var(--bg-secondary);border:1px solid var(--border-primary);padding:12px;">
      ${loan.reason ? `<div style="margin-bottom:8px;"><span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);">Motif</span><div style="font-size:var(--text-sm);margin-top:3px;">${escHtml(loan.reason)}</div></div>` : ''}
      ${loan.notes  ? `<div><span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);">Notes</span><div style="font-size:var(--text-sm);margin-top:3px;">${escHtml(loan.notes)}</div></div>` : ''}
    </div>` : ''}

    ${loan.return_condition ? `
    <div style="margin-top:14px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);padding:12px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-success);margin-bottom:6px;">Retour</div>
      <div style="font-size:var(--text-sm);">État : <strong>${escHtml(loan.return_condition)}</strong></div>
      ${loan.return_notes ? `<div style="font-size:var(--text-sm);margin-top:4px;color:var(--text-secondary);">${escHtml(loan.return_notes)}</div>` : ''}
    </div>` : ''}
    ${buildDeviceHistoryForLoan(loan)}
  `;

  document.getElementById('detail-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('loan-detail-modal')">Fermer</button>
    ${loan.status === 'En cours' ? `
      <button class="btn btn-primary" onclick="closeModal('loan-detail-modal'); openLoanModal(${loan.id})">
        <i class="fas fa-pen"></i> Modifier
      </button>
      <button class="btn" style="background:var(--color-success);color:#fff;" onclick="closeModal('loan-detail-modal'); openReturnModal(${loan.id})">
        <i class="fas fa-undo"></i> Enregistrer le retour
      </button>` : ''}
  `;

  document.getElementById('loan-detail-modal').classList.add('active');
};

function buildDeviceHistoryForLoan(loan) {
  const device = allDevices.find(d => d.id === loan.device_id);
  if (!device || !device.history?.length) return '';
 
  const otherLoans = (device.history || []).filter(h => h.id !== loan.id).slice(0, 5);
  if (!otherLoans.length) return '';
 
  return `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-tertiary);margin-bottom:8px;">
        <i class="fas fa-history" style="margin-right:5px;"></i> Autres prêts de cet appareil
      </div>
      <div style="border:1px solid var(--border-primary);overflow:hidden;">
        ${otherLoans.map(h => `
          <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid var(--border-primary);font-size:var(--text-xs);">
            <span style="font-weight:600;flex:1;">${escHtml(h.cabinet_name || 'Client inconnu')}</span>
            <span style="color:var(--text-tertiary);">${fmtDate(h.start_date)} → ${h.actual_return_date ? fmtDate(h.actual_return_date) : 'En cours'}</span>
            ${h.return_condition ? `<span style="color:${h.return_condition === 'Bon état' ? '#10b981' : h.return_condition === 'Endommagé' ? 'var(--color-danger)' : 'var(--color-warning)'};font-weight:600;">${escHtml(h.return_condition)}</span>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUPPRESSION
// ══════════════════════════════════════════════════════════════════════════════

window.deleteLoan = async function(id) {
  const ok = await confirmDelete('ce prêt');
  if (!ok) return;
  try {
    const res = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadLoans();
      await loadDevices();
      if (window.toast) toast.success('Prêt supprimé', '');
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error);
    }
  } catch (e) { console.error(e); }
};

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function populateDeviceSelect() {
  const sel      = document.getElementById('loan-device');
  const available = allDevices.filter(d => d.status === 'Disponible');
  sel.innerHTML  = '<option value="">-- Sélectionner un appareil --</option>' +
    available.map(d =>
      `<option value="${d.id}">${escHtml(d.name)}${d.brand ? ` — ${escHtml(d.brand)}` : ''}${d.serial_number ? ` (${escHtml(d.serial_number)})` : ''}</option>`
    ).join('');
}

function populateClientSelects() {
  const opts = '<option value="">-- Aucun client --</option>' +
    allClients.map(c => `<option value="${c.id}">${escHtml(c.cabinet_name)}</option>`).join('');
  document.getElementById('loan-client').innerHTML = opts;
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-CH').format(new Date(d));
}

function escHtml(t) {
  if (!t) return '';
  const el = document.createElement('div');
  el.textContent = String(t);
  return el.innerHTML;
}