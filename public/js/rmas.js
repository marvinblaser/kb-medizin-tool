// public/js/rmas.js
// KB Med — Suivi RMA v3.0
// Améliorations : filtres, boutons nav, vue liste, templates, auto-archivage, mobile


// ══════════════════════════════════════════════════════════════════════════════
//  CONSTANTES
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

// ── Colonnes dynamiques (chargées depuis /api/rmas/columns) ─────────────────
let allColumns   = [];  // { id, name, color, position, is_protected }

// Helpers pour compatibilité
const getRmaStages = () => allColumns.map(c => c.name);
const getStageColor = (name) => allColumns.find(c => c.name === name)?.color || '#94a3b8';

const COMMENT_TEMPLATES = [
  { icon: '📦', label: 'Appareil reçu',       text: 'Appareil reçu en bon état.' },
  { icon: '🚚', label: 'Expédié au SAV',       text: 'Appareil expédié au service après-vente.' },
  { icon: '✅', label: 'Réparation OK',         text: 'Réparation effectuée avec succès.' },
  { icon: '💰', label: 'Devis envoyé',          text: 'Devis envoyé au client en attente de validation.' },
  { icon: '❌', label: 'Devis refusé',          text: 'Devis refusé par le client.' },
  { icon: '📞', label: 'Client contacté',       text: 'Client contacté, en attente de retour.' },
  { icon: '🔄', label: 'En attente pièces',     text: 'En attente de pièces détachées du fournisseur.' },
  { icon: '✔️', label: 'Livré + facturé',       text: 'Appareil livré et facture envoyée au client.' },
];

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAT GLOBAL
// ══════════════════════════════════════════════════════════════════════════════

let allRmas       = [];
let currentRmaId  = null;
let currentUser   = null;   // ← utilisateur connecté (id, name, role)
let hoverTimeout  = null;
let tooltipCache  = {};
let tsInstances   = {};
let charts        = {};
let currentView   = 'kanban'; // 'kanban' | 'list' | 'dashboard'
let listSort      = { col: 'created_at', order: 'desc' };
let rmaFilters    = { search: '', supplier: '', tag: '' };

// ══════════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════════

function initBoard() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  board.innerHTML = getRmaStages().map((stage, i) => {
    const safeId = stageToId(stage);
    return `
      <div class="kanban-col" data-status="${stage}" data-step="${i}">
        <div class="kanban-col-header">
          <h3>${stage}</h3>
          <span class="col-count" id="count-${safeId}">0</span>
        </div>
        <div class="kanban-card-list" id="col-${safeId}"
          ondragover="evAllowDrop(event)"
          ondragleave="evDragLeave(event)"
          ondrop="evDrop(event)">
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/auth/me').then(r => r.json()).then(d => { currentUser = d.user || null; }).catch(() => {});
  initTooltip();
  fetch('/api/rmas/columns')
    .then(r => r.json())
    .then(cols => {
      allColumns = Array.isArray(cols) ? cols : [];
      initBoard();
    })
    .catch(() => { initBoard(); })
    .finally(() => {
      loadRmas().then(() => {
        const openId = parseInt(new URLSearchParams(window.location.search).get('open'));
        if (openId) openRmaDetails(openId);
      });
    });
});

function initTooltip() {
  const tooltip = document.getElementById('rma-tooltip');
  if (!tooltip) return;
  tooltip.style.display = 'none';
  tooltip.style.opacity = '0';
}

// ══════════════════════════════════════════════════════════════════════════════
//  KANBAN BOARD
// ══════════════════════════════════════════════════════════════════════════════

function stageToId(stage) {
  return stage.replace(/[^a-zA-Z0-9]/g, '');
}

// ══════════════════════════════════════════════════════════════════════════════
//  CHARGEMENT
// ══════════════════════════════════════════════════════════════════════════════

async function loadRmas() {
  try {
    const res = await fetch('/api/rmas');
    if (!res.ok) throw new Error('Erreur serveur');
    allRmas = await res.json();

    // ── Auto-archivage (30 jours dans "Livraison + Facturation") ────────────
    const SEUIL_JOURS = 30;
    const toArchive = allRmas.filter(r => {
      if (r.status !== 'Livraison + Facturation') return false;
      const age = Math.floor((Date.now() - new Date(r.updated_at)) / 86400000);
      return age >= SEUIL_JOURS;
    });

    if (toArchive.length > 0) {
      const ok = await showConfirm({
        title: `${toArchive.length} RMA à archiver`,
        message: `${toArchive.length} dossier(s) sont en "Livraison + Facturation" depuis +${SEUIL_JOURS} jours. Les archiver automatiquement ?`,
        confirmText: 'Archiver',
        cancelText:  'Ignorer',
        type:        'primary'
      });
      if (ok) {
        await Promise.all(toArchive.map(r =>
          fetch(`/api/rmas/${r.id}/status`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ status: 'Archives' })
          })
        ));
        allRmas = allRmas.map(r =>
          toArchive.find(a => a.id === r.id) ? { ...r, status: 'Archives' } : r
        );
        if (window.toast) toast.success('Archivage automatique', `${toArchive.length} dossier(s) archivé(s).`);
      }
    }

    // Peuple le select des tags dans la barre de filtres
    populateTagFilter();

    // Initialise la vue selon mobile / préférence
    initViewPreference();

  } catch (e) {
    console.error('Erreur chargement RMA:', e);
    if (window.toast) toast.error('Erreur', 'Impossible de charger les RMA.');
  }
}

function initViewPreference() {
  const saved    = localStorage.getItem('rma_view');
  const isMobile = window.innerWidth <= 768;
  const view     = isMobile ? 'list' : (saved || 'kanban');
  toggleView(view);
}

function populateTagFilter() {
  const seen    = new Map();
  allRmas.flatMap(r => r.tags || []).forEach(t => {
    if (!seen.has(t.id)) seen.set(t.id, t.name);
  });
  const tagSelect = document.getElementById('rma-filter-tag');
  if (!tagSelect) return;
  tagSelect.innerHTML = '<option value="">Tous les tags</option>' +
    [...seen.entries()].map(([id, name]) =>
      `<option value="${id}">${escapeHtml(name)}</option>`
    ).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  FILTRES
// ══════════════════════════════════════════════════════════════════════════════

function getFilteredRmas() {
  const { search, supplier, tag } = rmaFilters;
  return allRmas.filter(r => {
    if (search) {
      const q   = search.toLowerCase();
      const hay = [
        r.cabinet_name, r.equipment_name, r.brand, r.serial_number,
        r.description, r.rma_number, r.supplier_name, r.contact_person
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (supplier && r.supplier_name !== supplier) return false;
    if (tag) {
      const hasTag = (r.tags || []).some(t => String(t.id) === String(tag));
      if (!hasTag) return false;
    }
    return true;
  });
}

window.applyFilters = function() {
  rmaFilters.search   = document.getElementById('rma-filter-search')?.value  || '';
  rmaFilters.supplier = document.getElementById('rma-filter-supplier')?.value || '';
  rmaFilters.tag      = document.getElementById('rma-filter-tag')?.value      || '';
  renderCurrent();
  updateFilterBadge();
};

window.clearFilters = function() {
  rmaFilters = { search: '', supplier: '', tag: '' };
  ['rma-filter-search', 'rma-filter-supplier', 'rma-filter-tag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderCurrent();
  updateFilterBadge();
};

function updateFilterBadge() {
  const filtered = getFilteredRmas().filter(r => r.status !== 'Archives').length;
  const total    = allRmas.filter(r => r.status !== 'Archives').length;
  const badge    = document.getElementById('filter-active-badge');
  if (!badge) return;
  const isFiltered = filtered !== total;
  badge.style.display = isFiltered ? 'inline-flex' : 'none';
  badge.textContent   = isFiltered ? `${filtered} / ${total}` : '';
}

// ══════════════════════════════════════════════════════════════════════════════
//  RENDU
// ══════════════════════════════════════════════════════════════════════════════

function renderCurrent() {
  if (currentView === 'kanban')    renderRmas();
  if (currentView === 'list')      renderListView();
  if (currentView === 'dashboard') loadDashboardStats?.();
}

function renderRmas() {
  const duplicates = detectDuplicates();

  getRmaStages().forEach(s => {
    const id  = stageToId(s);
    const col = document.getElementById(`col-${id}`);
    if (col) col.innerHTML = '';
    const count = document.getElementById(`count-${id}`);
    if (count) count.textContent = '0';
  });

  getFilteredRmas().forEach(rma => {
    const stageId = stageToId(rma.status);
    const col     = document.getElementById(`col-${stageId}`);
    if (!col) return;
    const isDuplicate = duplicates.has(rma.id);
    const card        = buildCard(rma, isDuplicate);
    col.appendChild(card);
    const count = document.getElementById(`count-${stageId}`);
    if (count) count.textContent = parseInt(count.textContent || 0) + 1;
  });

  updateFilterBadge();
}

// ══════════════════════════════════════════════════════════════════════════════
//  BUILD CARD (avec boutons ← →)
// ══════════════════════════════════════════════════════════════════════════════

function buildCard(rma, isDuplicate = false) {
  const card = document.createElement('div');
  card.className  = 'rma-card';
  card.draggable  = true;
  card.dataset.id = rma.id;
 
  const stageIndex = getRmaStages().indexOf(rma.status);
  if (stageIndex >= 0) card.style.borderLeftColor = getStageColor(rma.status);
 
  card.onclick      = () => openRmaDetails(rma.id);
  card.ondragstart  = evDrag;
  card.onmouseenter = (e) => handleCardHover(e, rma.id);
  card.onmouseleave = handleCardLeave;
 
  const tagsHtml = (rma.tags && rma.tags.length > 0)
    ? rma.tags.map(t => `
        <span class="card-tag" style="background:${t.color}18;color:${t.color};border:1px solid ${t.color}30;">
          ${escapeHtml(t.name)}
        </span>`).join('')
    : '';
 
  const dueBadge   = buildDueBadge(rma.due_date);
  const displayNum = rma.rma_number || `#${rma.id}`;
  const canPrev    = stageIndex > 0;
  const canNext    = stageIndex < getRmaStages().length - 1;
 
  card.innerHTML = `
    ${isDuplicate ? `
      <div class="card-duplicate-badge" title="Doublon détecté : même cabinet et appareil dans une autre colonne !">
        <i class="fas fa-exclamation"></i>
      </div>` : ''}
 
    <div class="card-body">
      <!-- ID + méta -->
      <div class="card-id">
        <span class="card-id-num">${escapeHtml(displayNum)}</span>
        <div class="card-id-meta">
          ${rma.attachment_count > 0 ? `<span class="card-attachment-count"><i class="fas fa-paperclip"></i>${rma.attachment_count}</span>` : ''}
          <span class="card-supplier-pill">${escapeHtml(rma.supplier_name || 'Xion')}</span>
        </div>
      </div>
 
      <!-- Appareil -->
      <div class="card-equipment" title="${escapeHtml(rma.equipment_name || '')}">
        ${escapeHtml(rma.equipment_name || 'Appareil non spécifié')}
        ${rma.serial_number ? `<span style="color:var(--text-tertiary);font-weight:400;font-size:10px;"> · SN ${escapeHtml(rma.serial_number)}</span>` : ''}
      </div>
 
      <!-- Client -->
      <div class="card-client">
        <i class="fas fa-hospital" style="opacity:0.35;font-size:10px;flex-shrink:0"></i>
        ${escapeHtml(rma.cabinet_name || 'Client inconnu')}
      </div>

      <!-- Personne de contact -->
      ${rma.contact_person ? `
      <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:6px;display:flex;align-items:center;gap:4px;">
        <i class="fas fa-user" style="opacity:0.35;font-size:9px;flex-shrink:0"></i>
        ${escapeHtml(rma.contact_person)}
      </div>` : ''}
 
      <!-- Description -->
      <div class="card-desc">${sanitizeHtml(rma.description) || '<em style="color:var(--text-tertiary);font-size:10px;">Aucune description</em>'}</div>
 
      <!-- Tags -->
      ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
    </div>
 
    <!-- Footer -->
    <div class="card-footer-row">
      <div class="card-meta">
        ${dueBadge}
      </div>
      <div class="card-nav-btns">
        <button class="card-nav-btn" title="Étape précédente (${stageIndex > 0 ? getRmaStages()[stageIndex - 1] : '—'})"
          onclick="event.stopPropagation(); moveRmaStage(${rma.id}, -1)"
          ${canPrev ? '' : 'disabled'}>‹</button>
        <button class="card-nav-btn forward" title="Étape suivante (${stageIndex < getRmaStages().length - 1 ? getRmaStages()[stageIndex + 1] : '—'})"
          onclick="event.stopPropagation(); moveRmaStage(${rma.id}, 1)"
          ${canNext ? '' : 'disabled'}>›</button>
      </div>
    </div>
  `;
 
  return card;
}

// ── Déplacement rapide ← → ───────────────────────────────────────────────────
window.moveRmaStage = async function(rmaId, direction) {
  const rma = allRmas.find(r => r.id === rmaId);
  if (!rma) return;
  const idx    = getRmaStages().indexOf(rma.status);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= getRmaStages().length) return;
  const newStatus = getRmaStages()[newIdx];

  try {
    const res = await fetch(`/api/rmas/${rmaId}/status`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      rma.status = newStatus;
      tooltipCache  = {};
      renderCurrent();
      if (window.toast) toast.success('RMA déplacé', `→ ${newStatus}`);
    }
  } catch (e) { console.error(e); }
};

// ══════════════════════════════════════════════════════════════════════════════
//  VUE LISTE (groupée par client, triable)
// ══════════════════════════════════════════════════════════════════════════════

function renderListView() {
  const container = document.getElementById('list-view-body');
  if (!container) return;

  const rmas = getFilteredRmas();

  // Tri
  const sorted = [...rmas].sort((a, b) => {
    let va = a[listSort.col] || '';
    let vb = b[listSort.col] || '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return listSort.order === 'asc' ? cmp : -cmp;
  });

  // Groupement par client
  const groups = {};
  sorted.forEach(r => {
    const key = r.client_id || 0;
    if (!groups[key]) groups[key] = { name: r.cabinet_name || 'Client inconnu', rmas: [] };
    groups[key].rmas.push(r);
  });

  if (!Object.keys(groups).length) {
    container.innerHTML = `
      <tr><td colspan="7" style="text-align:center;padding:60px;color:var(--text-tertiary);">
        <i class="fas fa-inbox fa-3x" style="opacity:0.15;display:block;margin-bottom:14px;"></i>
        Aucun RMA trouvé.
      </td></tr>`;
    return;
  }

  let html = '';

  Object.values(groups).forEach(group => {
    const urgentCount = group.rmas.filter(r => {
      if (!r.due_date) return false;
      return Math.ceil((new Date(r.due_date) - new Date()) / 86400000) <= 3;
    }).length;

    html += `
      <tr class="list-group-header">
        <td colspan="7" style="padding:8px 14px;background:var(--bg-secondary);
          border-bottom:1px solid var(--border-primary);border-top:2px solid var(--color-primary);
          font-weight:700;font-size:var(--text-sm);">
          <i class="fas fa-hospital" style="color:var(--color-primary);margin-right:6px;"></i>
          ${escapeHtml(group.name)}
          <span style="color:var(--text-tertiary);font-weight:400;margin-left:8px;font-size:var(--text-xs);">
            ${group.rmas.length} dossier(s)
          </span>
          ${urgentCount > 0 ? `<span style="background:var(--color-danger);color:#fff;font-size:10px;
            padding:1px 7px;border-radius:2px;margin-left:8px;font-weight:700;">
            ⚠ ${urgentCount} urgent(s)</span>` : ''}
        </td>
      </tr>`;

    group.rmas.forEach(r => {
      const stageIdx   = getRmaStages().indexOf(r.status);
      const color      = getStageColor(r.status) || '#94a3b8';
      const dueBadge   = buildDueBadge(r.due_date);
      const canPrev    = stageIdx > 0;
      const canNext    = stageIdx < getRmaStages().length - 1;
      const displayNum = r.rma_number || `#${r.id}`;

      const tagsHtml = (r.tags || []).map(t =>
        `<span style="background:${t.color}18;color:${t.color};border:1px solid ${t.color}30;
          font-size:10px;padding:1px 6px;border-radius:2px;">${escapeHtml(t.name)}</span>`
      ).join(' ');

      html += `
        <tr onclick="openRmaDetails(${r.id})" style="cursor:pointer;border-bottom:1px solid var(--border-primary);"
          onmouseenter="this.style.background='var(--bg-secondary)'"
          onmouseout="this.style.background=''">
          <td style="padding:10px 14px;border-left:3px solid ${color};">
            <span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-primary);">
              ${escapeHtml(displayNum)}
            </span>
          </td>
          <td style="padding:10px 14px;">
            <div style="font-weight:600;font-size:var(--text-sm);color:var(--text-primary);">${escapeHtml(r.equipment_name || '—')}</div>
            <div style="font-size:11px;color:var(--text-tertiary);">${escapeHtml(r.brand || '')}${r.serial_number ? ` · ${r.serial_number}` : ''}</div>
          </td>
          <td style="padding:10px 14px;">
            <span style="background:${color}18;color:${color};border:1px solid ${color}30;
              font-size:11px;font-weight:600;padding:2px 8px;border-radius:2px;white-space:nowrap;">
              ${escapeHtml(r.status)}
            </span>
          </td>
          <td style="padding:10px 14px;font-size:var(--text-xs);color:var(--text-secondary);">${escapeHtml(r.supplier_name || 'Xion')}</td>
          <td style="padding:10px 14px;">${dueBadge || '<span style="color:var(--text-tertiary);font-size:var(--text-xs)">—</span>'}</td>
          <td style="padding:10px 14px;">${tagsHtml || '<span style="color:var(--text-tertiary);font-size:var(--text-xs)">—</span>'}</td>
          <td style="padding:10px 14px;" onclick="event.stopPropagation()">
            <div style="display:flex;gap:4px;justify-content:flex-end;">
              <button class="card-nav-btn" title="Étape précédente"
                onclick="moveRmaStage(${r.id}, -1)" ${canPrev ? '' : 'disabled'}>‹</button>
              <button class="card-nav-btn forward" title="Étape suivante"
                onclick="moveRmaStage(${r.id}, 1)" ${canNext ? '' : 'disabled'}>›</button>
            </div>
          </td>
        </tr>`;
    });
  });

  container.innerHTML = html;

  // Icônes de tri
  document.querySelectorAll('.list-sort-btn').forEach(btn => {
    const col = btn.dataset.col;
    btn.querySelector('i').className = col === listSort.col
      ? `fas fa-sort-${listSort.order === 'asc' ? 'up' : 'down'}`
      : 'fas fa-sort';
    btn.style.color = col === listSort.col ? 'var(--color-primary)' : 'var(--text-tertiary)';
  });

  updateFilterBadge();
}

window.listHandleSort = function(col) {
  if (listSort.col === col) {
    listSort.order = listSort.order === 'asc' ? 'desc' : 'asc';
  } else {
    listSort.col   = col;
    listSort.order = 'asc';
  }
  renderListView();
};

// ══════════════════════════════════════════════════════════════════════════════
//  TOGGLE VUE (kanban / liste / dashboard)
// ══════════════════════════════════════════════════════════════════════════════

function toggleView(view) {
  currentView = view;
  const kanban    = document.getElementById('kanban-board');
  const dashboard = document.getElementById('dashboard-view');
  const listView  = document.getElementById('list-view');
  const filterBar = document.getElementById('rma-filter-bar');

  if (kanban)    kanban.style.display    = 'none';
  if (dashboard) dashboard.style.display = 'none';
  if (listView)  listView.style.display  = 'none';

  document.querySelectorAll('.kb-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`btn-${view}`)?.classList.add('active');

  if (filterBar) filterBar.style.display = view !== 'dashboard' ? 'flex' : 'none';

  if (view === 'kanban') {
    if (kanban) kanban.style.display = '';
    renderRmas();
  } else if (view === 'list') {
    if (listView) listView.style.display = '';
    renderListView();
  } else if (view === 'dashboard') {
    if (dashboard) dashboard.style.display = '';
    loadDashboardStats?.();
  }

  localStorage.setItem('rma_view', view);
}

// ══════════════════════════════════════════════════════════════════════════════
//  DUE DATE BADGE
// ══════════════════════════════════════════════════════════════════════════════

function buildDueBadge(dueDate) {
  if (!dueDate) return '';
  const due  = new Date(dueDate);
  const now  = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((due - now) / 86400000);
  let cls = 'ok', label = '';

  if (diff < 0) {
    cls   = 'overdue';
    label = `En retard (${Math.abs(diff)}j)`;
  } else if (diff <= 3) {
    cls   = 'soon';
    label = diff === 0 ? "Aujourd'hui" : `J+${diff}`;
  } else {
    label = fmt(dueDate);
  }

  return `<span class="card-due ${cls}" title="Échéance : ${fmt(dueDate)}">
    <i class="fas fa-calendar-alt" style="font-size:9px"></i> ${label}
  </span>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  DÉTECTION DOUBLONS
// ══════════════════════════════════════════════════════════════════════════════

function detectDuplicates() {
  const duplicateIds = new Set();
  const active       = allRmas.filter(r => r.status !== 'Archives');
  const seen         = new Map();

  active.forEach(rma => {
    if (!rma.client_id || !rma.equipment_id) return;
    const key = `${rma.client_id}-${rma.equipment_id}`;
    if (seen.has(key)) {
      duplicateIds.add(rma.id);
      duplicateIds.add(seen.get(key));
    } else {
      seen.set(key, rma.id);
    }
  });

  return duplicateIds;
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAG & DROP
// ══════════════════════════════════════════════════════════════════════════════

function evAllowDrop(ev) {
  ev.preventDefault();
  ev.currentTarget.closest('.kanban-col')?.classList.add('drag-over');
}

function evDragLeave(ev) {
  ev.currentTarget.closest('.kanban-col')?.classList.remove('drag-over');
}

function evDrag(ev) {
  ev.dataTransfer.setData('rmaId', ev.currentTarget.dataset.id);
}

async function evDrop(ev) {
  ev.preventDefault();
  const col = ev.target.closest('.kanban-col');
  if (col) col.classList.remove('drag-over');
  const id = ev.dataTransfer.getData('rmaId');
  if (!col || !id) return;
  const newStatus = col.dataset.status;
  try {
    const res = await fetch(`/api/rmas/${id}/status`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus })
    });
    if (res.ok) { tooltipCache = {}; loadRmas(); }
  } catch (e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CRÉATION RMA
// ══════════════════════════════════════════════════════════════════════════════

async function openNewRmaModal() {
  currentRmaId  = null;
  const modal   = document.getElementById('rma-modal');
  const body    = document.getElementById('rma-modal-body');
  const footer  = modal.querySelector('.modal-footer');

  document.getElementById('rma-modal-title').innerHTML =
    `<i class="fas fa-plus-circle" style="color:var(--color-primary)"></i> Nouvelle déclaration RMA`;

  footer.innerHTML = `
    <button class="btn btn-secondary" onclick="closeRmaModal()" style="min-width:120px">Annuler</button>
    <button class="btn btn-primary" id="submit-new-rma" style="min-width:180px">
      <i class="fas fa-plus"></i> Créer le RMA
    </button>
  `;

  modal.classList.add('active');
  body.innerHTML = loadingHtml();

  try {
    const res     = await fetch('/api/clients');
    const data    = await res.json();
    const clients = Array.isArray(data) ? data : (data.clients || data.data || []);

    body.innerHTML = `
      <form id="new-rma-form" autocomplete="off">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">
                Client <span style="color:var(--color-danger)">*</span>
              </label>
              <select id="form-client" required onchange="loadClientEquipment(this.value)"
                style="width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;">
                <option value="">-- Rechercher un client --</option>
                ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.cabinet_name || c.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">Matériel concerné</label>
              <select id="form-equipment" disabled
                style="width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;opacity:0.6;">
                <option value="">-- Sélectionnez d'abord un client --</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">Fournisseur (SAV)</label>
              <select id="form-supplier"
                style="width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;">
                <option value="Xion">Xion</option>
                <option value="Heinemann">Heinemann</option>
                <option value="Autre">Autre...</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">Personne de contact</label>
              <input type="text" id="form-contact-person" placeholder="Nom du contact chez le client"
                style="width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;">
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">N° RMA Fournisseur</label>
              <input type="text" id="form-rma-number" placeholder="Optionnel — si déjà connu"
                style="width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;">
            </div>
            <div>
              <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">Date d'échéance</label>
              <input type="date" id="form-due-date"
                style="width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">Tracking envoi</label>
                <input type="text" id="form-tracking-to" placeholder="Optionnel"
                  style="width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;">
              </div>
              <div>
                <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">Tracking retour</label>
                <input type="text" id="form-tracking-from" placeholder="Optionnel"
                  style="width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;">
              </div>
            </div>
          </div>
        </div>
        <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--border-primary);">
          <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">
            Description détaillée <span style="color:var(--color-danger)">*</span>
          </label>
          <div>
            <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;">Description du problème *</label>
            ${buildFormatBar('form-desc')}
          </div>
        </div>
      </form>
    `;

    document.getElementById('form-client').focus();
    document.getElementById('submit-new-rma').onclick = (e) => { e.preventDefault(); saveRma(new Event('submit')); };
    setTimeout(() => applySearchableSelects(), 50);

  } catch (e) {
    console.error(e);
    body.innerHTML = `<div style="color:var(--color-danger);text-align:center;padding:40px;"><i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:12px;display:block"></i>Erreur lors du chargement.</div>`;
  }
}

async function loadClientEquipment(clientId) {
  const eqSelect = document.getElementById('form-equipment');
  if (!eqSelect) return;
  if (tsInstances.formEquipment) { tsInstances.formEquipment.destroy(); delete tsInstances.formEquipment; }
  if (!clientId) {
    eqSelect.innerHTML = "<option value=''>-- Sélectionnez d'abord un client --</option>";
    eqSelect.disabled = true; eqSelect.style.opacity = '0.6'; return;
  }
  eqSelect.innerHTML = '<option value="">Chargement...</option>';
  eqSelect.disabled = true; eqSelect.style.opacity = '0.6';
  try {
    const res       = await fetch(`/api/rmas/equipment/${clientId}`);
    const equipment = await res.json();
    eqSelect.innerHTML = '<option value="">-- Aucun équipement spécifié --</option>' +
      equipment.map(e => `<option value="${e.id}">${escapeHtml(e.brand)} — ${escapeHtml(e.name)} (SN: ${e.serial_number || 'N/A'})</option>`).join('');
    eqSelect.disabled = false; eqSelect.style.opacity = '1';
  } catch (err) {
    console.error(err);
    eqSelect.innerHTML = '<option value="">Erreur de chargement</option>';
  }
}

async function saveRma(e) {
  e.preventDefault();
  const clientId    = document.getElementById('form-client').value;
  const equipmentId = document.getElementById('form-equipment').value;

  if (clientId && equipmentId) {
    const active = allRmas.filter(r => r.status !== 'Archives');
    const dup    = active.find(r => String(r.client_id) === String(clientId) && String(r.equipment_id) === String(equipmentId));
    if (dup) {
      const proceed = await showConfirm({
        title: 'Doublon détecté !',
        message: `Un RMA actif existe déjà pour "${dup.cabinet_name || 'ce client'}" — "${dup.equipment_name || 'cet appareil'}" (colonne "${dup.status}"). Créer quand même ?`,
        confirmText: 'Créer quand même', cancelText: 'Annuler', type: 'warning'
      });
      if (!proceed) return;
    }
  }

  const data = {
    client_id: clientId, equipment_id: equipmentId || null,
    supplier_name: document.getElementById('form-supplier').value,
    rma_number: document.getElementById('form-rma-number').value,
    due_date: document.getElementById('form-due-date')?.value || null,
    tracking_to_supplier: document.getElementById('form-tracking-to').value,
    tracking_from_supplier: document.getElementById('form-tracking-from').value,
    description: document.getElementById('form-desc').innerHTML || '',
    contact_person: document.getElementById('form-contact-person')?.value || null
  };

  try {
    const res = await fetch('/api/rmas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) {
      closeRmaModal(); await loadRmas();
      if (window.toast) toast.success('RMA créé', 'La déclaration a été enregistrée.');
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error || 'Impossible de créer le RMA.');
    }
  } catch (err) {
    console.error(err);
    if (window.toast) toast.error('Erreur réseau', 'Connexion au serveur échouée.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Remplace openRmaDetails() dans public/js/rmas.js
// Changements :
//   1. Historique à gauche (colonne principale)
//   2. Tags + Documents à droite (colonne latérale)
//   3. Commentaires système affichés différemment
// ═══════════════════════════════════════════════════════════════════════════════

async function openRmaDetails(id) {
  currentRmaId = id;
  const modal  = document.getElementById('rma-modal');
  const body   = document.getElementById('rma-modal-body');
  const footer = modal.querySelector('.modal-footer');

  footer.innerHTML = `
    <button class="btn btn-danger btn-sm" id="delete-rma-btn" onclick="deleteRma()" style="display:none">
      <i class="fas fa-trash"></i> Supprimer
    </button>
    <button class="btn btn-secondary" onclick="closeRmaModal()">Fermer</button>
  `;

  modal.classList.add('active');
  body.innerHTML = loadingHtml();

  try {
    const [rmaRes, tagsRes, loansRes] = await Promise.all([
      fetch(`/api/rmas/${id}`),
      fetch('/api/rmas/tags/all'),
      fetch('/api/loans')
    ]);
    const rma     = await rmaRes.json();
    const allTags = await tagsRes.json();
    const loansData = await loansRes.json();
    // Prêts actifs non liés à un autre RMA (ou déjà liés à ce RMA)
    window.allLoansForRma = (Array.isArray(loansData) ? loansData : [])
      .filter(l => l.status === 'En cours' && (!l.rma_id || l.rma_id === id));

    const stageIndex = getRmaStages().indexOf(rma.status);
    const stageColor = getStageColor(rma.status) || '#94a3b8';
    const displayNum = rma.rma_number || `#${id}`;
    const canPrev    = stageIndex > 0;
    const canNext    = stageIndex < getRmaStages().length - 1;

    // ── Titre modal ──────────────────────────────────────────────────────────
    document.getElementById('rma-modal-title').innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-family:var(--font-mono);color:var(--color-primary);font-size:0.95rem;">${escapeHtml(displayNum)}</span>
        <span style="background:${stageColor}18;color:${stageColor};font-size:11px;font-weight:700;
          padding:3px 10px;border-radius:2px;border:1px solid ${stageColor}30;">
          ${escapeHtml(rma.status)}
        </span>
        <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="editRmaDetails(${id})">
            <i class="fas fa-pen"></i> Modifier
          </button>
          <button class="btn btn-sm" style="background:var(--color-danger-bg);color:var(--color-danger);border:1px solid rgba(239,68,68,0.25);" onclick="refuseDevis(${id})">
            <i class="fas fa-ban"></i> Devis Refusé
          </button>
        </div>
      </div>
    `;

    // ── Commentaires : rendu différencié système/utilisateur ─────────────────
    const allComments = [...(rma.comments || [])].reverse();

    // Cache global pour l'édition inline (évite les escapes complexes dans onclick)
    window._rmaCommentCache = {};
    allComments.forEach(c => { window._rmaCommentCache[c.id] = c.comment; });

    const commentsHtml = allComments.length
      ? allComments.map(c => {
          const dt = new Date(c.created_at).toLocaleString('fr-CH', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });

          if (c.is_system === 1) {
            // ── Commentaire système (changelog) ──────────────────────────────
            const lines = c.comment.split('\n').filter(Boolean);
            return `
              <div style="
                margin-bottom:8px;
                padding:10px 12px;
                background:var(--bg-secondary);
                border:1px solid var(--border-primary);
                border-left:3px solid var(--color-primary);
                border-radius:0 3px 3px 0;
              ">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-primary);">
                    <i class="fas fa-history" style="margin-right:4px;"></i>
                    Modification — ${escapeHtml(c.user_name)}
                  </span>
                  <span style="font-size:10px;color:var(--text-tertiary);">${dt}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:3px;">
                  ${lines.map(line => `
                    <div style="font-size:var(--text-xs);color:var(--text-secondary);
                      display:flex;align-items:baseline;gap:6px;">
                      ${escapeHtml(line)}
                    </div>`).join('')}
                </div>
              </div>`;
          } else {
            // ── Commentaire utilisateur normal ────────────────────────────────
            const canEdit = currentUser && (currentUser.id === c.user_id || currentUser.role === 'admin');
            const editedHint = c.updated_at && c.updated_at !== c.created_at
              ? `<span style="font-size:10px;color:var(--text-tertiary);font-style:italic;margin-left:6px;">(modifié)</span>`
              : '';
            return `
              <div class="comment-item" id="comment-wrap-${c.id}">
                <div class="comment-meta">
                  <span class="comment-author">${escapeHtml(c.user_name)}</span>
                  <span class="comment-date">${dt}${editedHint}</span>
                  ${canEdit ? `
                  <div style="margin-left:auto;display:flex;gap:3px;">
                    <button title="Modifier" onclick="startEditComment(${id}, ${c.id})"
                      style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;padding:2px 5px;font-size:11px;border-radius:2px;transition:all 0.1s;"
                      onmouseover="this.style.color='var(--color-primary)';this.style.background='var(--bg-secondary)'"
                      onmouseout="this.style.color='var(--text-tertiary)';this.style.background='none'">
                      <i class="fas fa-pen"></i>
                    </button>
                    <button title="Supprimer" onclick="deleteComment(${id}, ${c.id})"
                      style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;padding:2px 5px;font-size:11px;border-radius:2px;transition:all 0.1s;"
                      onmouseover="this.style.color='var(--color-danger)';this.style.background='var(--color-danger-bg)'"
                      onmouseout="this.style.color='var(--text-tertiary)';this.style.background='none'">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>` : ''}
                </div>
                <div class="comment-text" id="comment-text-${c.id}">${escapeHtml(c.comment)}</div>
              </div>`;
          }
        }).join('')
      : `<div style="text-align:center;padding:24px;color:var(--text-tertiary);font-size:var(--text-sm);font-style:italic;">
           Aucune activité enregistrée.
         </div>`;

    // ── Corps du modal ────────────────────────────────────────────────────────
    body.innerHTML = `

      <!-- Navigation rapide entre étapes -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 14px;
        background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:3px;">
        <button onclick="moveRmaStage(${id}, -1); closeRmaModal();"
          style="background:none;border:1px solid var(--border-primary);border-radius:3px;
            padding:4px 10px;font-size:var(--text-xs);color:var(--text-secondary);cursor:pointer;
            transition:all 0.12s;white-space:nowrap;"
          ${canPrev ? '' : 'disabled style="opacity:0.3;cursor:not-allowed;"'}
          onmouseover="if(!this.disabled)this.style.borderColor='var(--color-primary)'"
          onmouseout="this.style.borderColor='var(--border-primary)'">
          <i class="fas fa-chevron-left" style="font-size:10px;margin-right:3px;"></i>
          ${canPrev ? escapeHtml(getRmaStages()[stageIndex - 1]) : '—'}
        </button>
        <div style="flex:1;text-align:center;">
          <span style="font-weight:700;color:${stageColor};font-size:var(--text-sm);">${escapeHtml(rma.status)}</span>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:1px;">Étape ${stageIndex + 1} / ${getRmaStages().length}</div>
        </div>
        <button onclick="moveRmaStage(${id}, 1); closeRmaModal();"
          style="background:none;border:1px solid var(--border-primary);border-radius:3px;
            padding:4px 10px;font-size:var(--text-xs);color:var(--text-secondary);cursor:pointer;
            transition:all 0.12s;white-space:nowrap;"
          ${canNext ? '' : 'disabled style="opacity:0.3;cursor:not-allowed;"'}
          onmouseover="if(!this.disabled)this.style.borderColor='var(--color-success)'"
          onmouseout="this.style.borderColor='var(--border-primary)'">
          ${canNext ? escapeHtml(getRmaStages()[stageIndex + 1]) : '—'}
          <i class="fas fa-chevron-right" style="font-size:10px;margin-left:3px;"></i>
        </button>
      </div>

      <!-- Grille principale — HISTORIQUE à gauche, TAGS+DOCS à droite -->
      <div class="rma-detail-grid">

        <!-- ── COLONNE GAUCHE : Infos + Historique ───────────────────────── -->
        <div style="display:flex;flex-direction:column;gap:12px;min-height:0;">

          <!-- Infos principales -->
          <div class="rma-info-card">
            <div class="rma-info-card-header">
              <i class="fas fa-info-circle" style="color:var(--color-primary)"></i>
              Informations
            </div>
            <div class="rma-info-card-body">
              <div class="rma-info-row">
                <span class="rma-info-label">Client</span>
                <span class="rma-info-value" style="color:var(--color-primary);font-weight:700;">
                  <i class="fas fa-hospital" style="opacity:0.4;margin-right:4px;font-size:11px;"></i>
                  ${escapeHtml(rma.cabinet_name || 'Non spécifié')}
                </span>
              </div>
              <div class="rma-info-row">
                <span class="rma-info-label">Appareil</span>
                <span class="rma-info-value">
                  ${rma.equipment_name
                    ? `<strong>${escapeHtml((rma.brand || '') + ' ' + rma.equipment_name)}</strong>`
                    : '<span style="color:var(--text-tertiary)">Non listé</span>'}
                  ${rma.serial_number ? `<code style="background:var(--bg-secondary);padding:1px 6px;border-radius:2px;font-size:11px;margin-left:6px;border:1px solid var(--border-primary);">SN: ${escapeHtml(rma.serial_number)}</code>` : ''}
                </span>
              </div>
              ${rma.contact_person ? `<div class="rma-info-row"><span class="rma-info-label">Contact</span><span class="rma-info-value"><i class="fas fa-user" style="opacity:0.4;margin-right:4px;font-size:11px;"></i>${escapeHtml(rma.contact_person)}</span></div>` : ''}
              ${rma.due_date ? `<div class="rma-info-row"><span class="rma-info-label">Échéance</span><span class="rma-info-value">${buildDueBadge(rma.due_date)}</span></div>` : ''}
              <div class="rma-description-block">${sanitizeHtml(rma.description) || '<em style="color:var(--text-tertiary)">Aucune description.</em>'}</div>
            </div>
          </div>

          <!-- Historique complet -->
          <div class="rma-info-card" style="flex:1;display:flex;flex-direction:column;min-height:300px;">
            <div class="rma-info-card-header">
              <i class="fas fa-history" style="color:var(--color-primary)"></i>
              Historique
              <span style="margin-left:auto;background:var(--bg-tertiary);color:var(--text-tertiary);
                font-size:10px;padding:1px 7px;border-radius:2px;font-weight:700;">
                ${allComments.length}
              </span>
            </div>

            <!-- Formulaire commentaire -->
            <form onsubmit="addComment(event, ${id})" class="comment-form-wrapper" style="flex-shrink:0;">
              <div class="comment-input-row">
                <input type="text" id="new-comment" class="comment-input"
                  placeholder="Ajouter une note ou mise à jour..." required>
                <button type="submit" class="btn btn-primary btn-sm" style="flex-shrink:0;">
                  <i class="fas fa-paper-plane"></i>
                </button>
              </div>
              <div id="comment-template-zone"></div>
            </form>

            <!-- Liste commentaires -->
            <div style="flex:1;overflow-y:auto;min-height:0;padding:8px;">
              ${commentsHtml}
            </div>
          </div>
        </div>

        <!-- ── COLONNE DROITE : Logistique + Tags + Documents ────────────── -->
        <div style="display:flex;flex-direction:column;gap:12px;">

          <!-- Logistique -->
          <div class="rma-info-card">
            <div class="rma-info-card-header">
              <i class="fas fa-truck" style="color:var(--color-primary)"></i>
              Suivi logistique
            </div>
            <div class="rma-info-card-body">
              <div class="rma-info-row">
                <span class="rma-info-label">Fournisseur</span>
                <span class="rma-info-value"><strong>${escapeHtml(rma.supplier_name || 'Xion')}</strong></span>
              </div>
              <div class="rma-info-row">
                <span class="rma-info-label">N° RMA</span>
                <span class="rma-info-value" style="font-family:var(--font-mono);font-size:var(--text-xs);">
                  ${rma.rma_number ? escapeHtml(rma.rma_number) : '<span style="color:var(--text-tertiary)">—</span>'}
                </span>
              </div>
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-primary);">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:8px;">Tracking</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);line-height:2;">
                  <div><i class="fas fa-arrow-right" style="width:16px;color:var(--text-tertiary);"></i> ${escapeHtml(rma.tracking_to_supplier || '—')}</div>
                  <div><i class="fas fa-arrow-left" style="width:16px;color:var(--text-tertiary);"></i> ${escapeHtml(rma.tracking_from_supplier || '—')}</div>
                </div>
              </div>
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-primary);font-size:11px;color:var(--text-tertiary);">
                <i class="fas fa-clock" style="margin-right:4px;"></i>
                Créé le ${new Date(rma.created_at).toLocaleString('fr-CH')}
              </div>
            </div>
          </div>

          <!-- Tags -->
          ${renderTagsSection(rma, allTags, id)}

          <!-- Appareil de remplacement (prêt lié) -->
          ${buildLinkedLoanBlock(rma, id)}

          <!-- Pièces jointes -->
          ${getAttachmentsHtml(rma, id)}
        </div>

      </div><!-- /rma-detail-grid -->
    `;

    // Bouton supprimer
    const deleteBtn = document.getElementById('delete-rma-btn');
    if (deleteBtn) deleteBtn.style.display = '';

    // Templates de commentaires
    const tz = document.getElementById('comment-template-zone');
    if (tz) tz.innerHTML = buildCommentTemplatesHtml();

    setTimeout(() => applySearchableSelects(), 50);

  } catch (e) {
    console.error(e);
    body.innerHTML = '<div style="color:var(--color-danger);text-align:center;padding:40px;">Erreur de chargement.</div>';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TEMPLATES DE COMMENTAIRES
// ══════════════════════════════════════════════════════════════════════════════

function buildCommentTemplatesHtml() {
  return `
    <div style="position:relative;display:inline-block;">
      <button type="button" onclick="toggleCommentTemplates()"
        style="background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:3px;
          padding:5px 10px;font-size:var(--text-xs);color:var(--text-secondary);cursor:pointer;
          display:flex;align-items:center;gap:5px;font-family:inherit;">
        <i class="fas fa-bolt" style="color:var(--color-primary)"></i> Réponses rapides
        <i class="fas fa-chevron-up" style="font-size:9px"></i>
      </button>
      <div id="comment-templates-dropdown"
        style="display:none;position:absolute;bottom:calc(100% + 6px);left:0;
          background:var(--bg-elevated);border:1px solid var(--border-primary);
          border-radius:4px;box-shadow:var(--shadow-lg);z-index:200;
          min-width:230px;overflow:hidden;">
        ${COMMENT_TEMPLATES.map(t => `
          <button type="button" onclick="insertTemplate('${t.text.replace(/'/g, "\\'")}')"
            style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 14px;
              background:none;border:none;border-bottom:1px solid var(--border-primary);
              font-size:var(--text-xs);color:var(--text-primary);text-align:left;cursor:pointer;
              font-family:inherit;transition:background 0.1s;"
            onmouseover="this.style.background='var(--bg-secondary)'"
            onmouseout="this.style.background='none'">
            <span style="font-size:14px;">${t.icon}</span>
            ${escapeHtml(t.label)}
          </button>`).join('')}
      </div>
    </div>`;
}

window.toggleCommentTemplates = function() {
  const d = document.getElementById('comment-templates-dropdown');
  if (!d) return;
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
};

window.insertTemplate = function(text) {
  const input = document.getElementById('new-comment');
  if (input) { input.value = text; input.focus(); }
  const d = document.getElementById('comment-templates-dropdown');
  if (d) d.style.display = 'none';
};

document.addEventListener('click', e => {
  if (!e.target.closest('[onclick="toggleCommentTemplates()"]') &&
      !e.target.closest('#comment-templates-dropdown')) {
    const d = document.getElementById('comment-templates-dropdown');
    if (d) d.style.display = 'none';
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  MODIFICATION RMA
// ══════════════════════════════════════════════════════════════════════════════

async function editRmaDetails(id) {
  const modal  = document.getElementById('rma-modal');
  const body   = document.getElementById('rma-modal-body');
  const footer = modal.querySelector('.modal-footer');

  footer.innerHTML = `
    <button class="btn btn-danger" id="delete-rma-btn" onclick="deleteRma()"><i class="fas fa-trash"></i> Supprimer</button>
    <div style="display:flex;gap:8px;margin-left:auto;">
      <button class="btn btn-secondary" onclick="openRmaDetails(${id})" style="min-width:110px;">Annuler</button>
      <button class="btn btn-primary" id="edit-save-btn" style="min-width:160px;"><i class="fas fa-save"></i> Enregistrer</button>
    </div>
  `;

  document.getElementById('rma-modal-title').innerHTML =
    `<i class="fas fa-pen" style="color:var(--color-primary)"></i> Modifier le RMA #${id}`;

  modal.classList.add('active');
  body.innerHTML = loadingHtml();

  try {
    const [rmaRes, clientsRes, tagsRes] = await Promise.all([
      fetch(`/api/rmas/${id}`), fetch('/api/clients'), fetch('/api/rmas/tags/all')
    ]);
    const rma         = await rmaRes.json();
    const clientsData = await clientsRes.json();
    const allTags     = await tagsRes.json();
    const clients     = Array.isArray(clientsData) ? clientsData : (clientsData.clients || []);

    let equipments = [];
    if (rma.client_id) {
      const eqRes = await fetch(`/api/rmas/equipment/${rma.client_id}`);
      if (eqRes.ok) equipments = await eqRes.json();
    }

    const iS = `width:100%;height:38px;padding:0 10px;border:1px solid var(--border-primary);border-radius:3px;font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);font-family:inherit;outline:none;`;
    const lS = `display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);margin-bottom:5px;`;
    const sec = (icon, text) => `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg-secondary);border-bottom:1px solid var(--border-primary);border-top:1px solid var(--border-primary);margin-top:20px;margin-bottom:14px;"><i class="${icon}" style="color:var(--color-primary);font-size:12px;width:14px;text-align:center;"></i><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-secondary);">${text}</span></div>`;

    body.innerHTML = `
      <form id="edit-rma-form" autocomplete="off">
        <div style="margin-bottom:18px;">
          <label style="${lS}">Étape / Statut actuel</label>
          <select id="edit-status" style="${iS}height:42px;font-weight:700;color:var(--color-primary);border-left:3px solid var(--color-primary);">
            ${getRmaStages().map(s => `<option value="${s}" ${rma.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        ${sec('fas fa-info-circle', 'Informations')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div><label style="${lS}">Personne de contact</label><input type="text" id="edit-contact-person" placeholder="Nom du contact chez le client" value="${escapeHtml(rma.contact_person || '')}" style="${iS}"></div>
          <div><label style="${lS}">Fournisseur</label>
            <select id="edit-supplier" style="${iS}">
              <option value="Xion" ${rma.supplier_name === 'Xion' ? 'selected' : ''}>Xion</option>
              <option value="Heinemann" ${rma.supplier_name === 'Heinemann' ? 'selected' : ''}>Heinemann</option>
              <option value="Autre" ${rma.supplier_name === 'Autre' ? 'selected' : ''}>Autre...</option>
            </select>
          </div>
          <div><label style="${lS}">Client <span style="color:var(--color-danger)">*</span></label>
            <select id="edit-client" onchange="loadClientEquipmentForEdit(this.value)" style="${iS}">
              ${clients.map(c => `<option value="${c.id}" ${rma.client_id === c.id ? 'selected' : ''}>${escapeHtml(c.cabinet_name || c.name)}</option>`).join('')}
            </select>
          </div>
          <div><label style="${lS}">Matériel</label>
            <select id="edit-equipment" style="${iS}">
              <option value="">-- Aucun --</option>
              ${equipments.map(e => `<option value="${e.id}" ${rma.equipment_id === e.id ? 'selected' : ''}>${escapeHtml(e.brand)} — ${escapeHtml(e.name)} (SN: ${e.serial_number || 'N/A'})</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-top:16px;"><label style="${lS}">Description <span style="color:var(--color-danger)">*</span></label>
          <div style="grid-column:1/-1;">
            <label style="${lS}">Description</label>
            ${buildFormatBar('edit-desc')}
          </div>
        </div>
        ${sec('fas fa-truck', 'Suivi logistique')}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
          <div><label style="${lS}">N° RMA Fournisseur</label><input type="text" id="edit-rma-number" value="${escapeHtml(rma.rma_number || '')}" placeholder="Optionnel" style="${iS}"></div>
          <div><label style="${lS}">Date d'échéance</label><input type="date" id="edit-due-date" value="${rma.due_date ? rma.due_date.split('T')[0] : ''}" style="${iS}"></div>
          <div></div>
          <div><label style="${lS}">Tracking envoi</label><input type="text" id="edit-tracking-to" value="${escapeHtml(rma.tracking_to_supplier || '')}" placeholder="N° de suivi" style="${iS}"></div>
          <div><label style="${lS}">Tracking retour</label><input type="text" id="edit-tracking-from" value="${escapeHtml(rma.tracking_from_supplier || '')}" placeholder="N° de suivi" style="${iS}"></div>
        </div>
        ${sec('fas fa-tags', 'Étiquettes')}
        ${renderTagsSection(rma, allTags, id)}
        ${sec('fas fa-paperclip', 'Documents & Photos')}
        ${getAttachmentsHtml(rma, id)}
        <div style="height:20px;"></div>
      </form>
    `;

    document.getElementById('edit-save-btn').onclick = (e) => { e.preventDefault(); updateRma(new Event('submit'), id); };

    // Inject le contenu formaté dans le contenteditable APRÈS insertion dans le DOM
    const descEl = document.getElementById('edit-desc');
    if (descEl) descEl.innerHTML = sanitizeHtml(rma.description || '');

    setTimeout(() => {
      if (document.getElementById('edit-client')) {
        if (tsInstances.editClient) { try { tsInstances.editClient.destroy(); } catch {} }
        tsInstances.editClient = new TomSelect('#edit-client', { create: false, maxOptions: null, sortField: { field: 'text', direction: 'asc' } });
      }
    }, 50);

  } catch (e) {
    console.error(e);
    body.innerHTML = `<div style="color:var(--color-danger);text-align:center;padding:40px;"><i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:12px;display:block"></i>Erreur lors du chargement.</div>`;
  }
}

async function updateRma(e, id) {
  e.preventDefault();
  const data = {
    contact_person: document.getElementById('edit-contact-person').value || null,
    status: document.getElementById('edit-status').value,
    client_id: document.getElementById('edit-client').value,
    equipment_id: document.getElementById('edit-equipment').value || null,
    supplier_name: document.getElementById('edit-supplier').value,
    rma_number: document.getElementById('edit-rma-number').value,
    due_date: document.getElementById('edit-due-date')?.value || null,
    tracking_to_supplier: document.getElementById('edit-tracking-to').value,
    tracking_from_supplier: document.getElementById('edit-tracking-from').value,
    description: document.getElementById('edit-desc').innerHTML || ''
  };
  try {
    const res = await fetch(`/api/rmas/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) {
      tooltipCache = {}; loadRmas(); openRmaDetails(id);
      if (window.toast) toast.success('RMA mis à jour', 'Les modifications ont été enregistrées.');
    } else { if (window.toast) toast.error('Erreur', 'Impossible de sauvegarder.'); }
  } catch (err) { console.error(err); if (window.toast) toast.error('Erreur réseau', ''); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMMENTAIRES
// ══════════════════════════════════════════════════════════════════════════════

async function addComment(e, id) {
  e.preventDefault();
  const comment = document.getElementById('new-comment').value.trim();
  if (!comment) return;
  await fetch(`/api/rmas/${id}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment })
  });
  tooltipCache[id] = null;
  openRmaDetails(id);
}

// ── Édition inline d'un commentaire ─────────────────────────────────────────

window.startEditComment = function(rmaId, commentId) {
  const textEl = document.getElementById(`comment-text-${commentId}`);
  if (!textEl) return;
  const original = window._rmaCommentCache?.[commentId] || textEl.textContent || '';
  textEl.innerHTML = `
    <textarea id="edit-comment-input-${commentId}"
      style="width:100%;padding:7px 9px;border:1px solid var(--color-primary);border-radius:3px;
        font-size:var(--text-sm);color:var(--text-primary);background:var(--bg-elevated);
        font-family:inherit;outline:none;resize:vertical;min-height:60px;"
    >${escapeHtml(original)}</textarea>
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button onclick="saveCommentEdit(${rmaId}, ${commentId})" class="btn btn-primary btn-sm">
        <i class="fas fa-check"></i> Sauvegarder
      </button>
      <button onclick="cancelCommentEdit(${commentId})" class="btn btn-secondary btn-sm">Annuler</button>
    </div>
  `;
  document.getElementById(`edit-comment-input-${commentId}`)?.focus();
};

window.saveCommentEdit = async function(rmaId, commentId) {
  const input = document.getElementById(`edit-comment-input-${commentId}`);
  if (!input) return;
  const newText = input.value.trim();
  if (!newText) return;
  try {
    const res = await fetch(`/api/rmas/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: newText })
    });
    if (res.ok) {
      tooltipCache[rmaId] = null;
      openRmaDetails(rmaId);
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error || 'Modification impossible.');
    }
  } catch (e) { console.error(e); if (window.toast) toast.error('Erreur réseau', ''); }
};

window.cancelCommentEdit = function(commentId) {
  const textEl = document.getElementById(`comment-text-${commentId}`);
  if (!textEl) return;
  const original = window._rmaCommentCache?.[commentId] || '';
  textEl.textContent = original;
};

window.deleteComment = async function(rmaId, commentId) {
  const ok = await showConfirm({
    title: 'Supprimer ce commentaire ?',
    message: 'Cette action est irréversible.',
    confirmText: 'Supprimer', cancelText: 'Annuler', type: 'danger'
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/rmas/comments/${commentId}`, { method: 'DELETE' });
    if (res.ok) {
      tooltipCache[rmaId] = null;
      openRmaDetails(rmaId);
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error || 'Suppression impossible.');
    }
  } catch (e) { console.error(e); if (window.toast) toast.error('Erreur réseau', ''); }
};

// ══════════════════════════════════════════════════════════════════════════════
//  SUPPRESSION
// ══════════════════════════════════════════════════════════════════════════════

async function deleteRma() {
  if (!currentRmaId) return;
  const ok = await confirmDelete('ce RMA et toutes ses données');
  if (!ok) return;
  try {
    const res = await fetch(`/api/rmas/${currentRmaId}`, { method: 'DELETE' });
    if (res.ok) {
      closeRmaModal(); await loadRmas();
      if (window.toast) toast.success('RMA supprimé', '');
    } else { if (window.toast) toast.error('Erreur', 'Suppression non autorisée.'); }
  } catch (e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TAGS
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
//  GESTION DES COLONNES KANBAN
// ══════════════════════════════════════════════════════════════════════════════

async function reloadColumns() {
  const r = await fetch('/api/rmas/columns');
  allColumns = await r.json();
}

window.openColumnsModal = async function() {
  await reloadColumns();
  renderColumnsModal();
  document.getElementById('columns-modal').classList.add('active');
};

window.closeColumnsModal = function() {
  document.getElementById('columns-modal').classList.remove('active');
};

function renderColumnsModal() {
  const list = document.getElementById('columns-list');
  if (!list) return;

  list.innerHTML = allColumns.map(col => `
    <div class="col-manage-item" data-id="${col.id}" draggable="${col.is_protected ? 'false' : 'true'}"
      style="display:flex;align-items:center;gap:10px;padding:10px 12px;
        background:var(--bg-elevated);border:1px solid var(--border-primary);
        border-left:4px solid ${col.color};margin-bottom:6px;
        cursor:${col.is_protected ? 'default' : 'grab'};user-select:none;
        transition:opacity .15s;">
      <i class="fas fa-grip-vertical" style="color:var(--text-tertiary);font-size:12px;
        opacity:${col.is_protected ? '0.2' : '1'};flex-shrink:0;"></i>
      <span style="flex:1;font-size:var(--text-sm);font-weight:${col.is_protected ? '700' : '500'};
        color:var(--text-primary);">
        ${escapeHtml(col.name)}
        ${col.is_protected ? '<span style="font-size:10px;color:var(--text-tertiary);margin-left:4px;"><i class="fas fa-lock"></i></span>' : ''}
      </span>
      <input type="color" value="${col.color}" ${col.is_protected ? 'disabled' : ''}
        onchange="updateColumnColor(${col.id}, this.value)"
        style="width:28px;height:28px;border:none;cursor:pointer;border-radius:3px;padding:0;
          opacity:${col.is_protected ? '0.4' : '1'}">
      ${!col.is_protected ? `
        <button onclick="startRenameColumn(${col.id})"
          style="background:none;border:1px solid var(--border-primary);border-radius:3px;
            padding:4px 8px;cursor:pointer;font-size:11px;color:var(--text-secondary);font-family:inherit;">
          <i class="fas fa-pen"></i>
        </button>
        <button onclick="deleteColumn(${col.id}, '${escapeHtml(col.name).replace(/'/g, "\\'")}')"
          style="background:none;border:1px solid rgba(239,68,68,0.3);border-radius:3px;
            padding:4px 8px;cursor:pointer;font-size:11px;color:var(--color-danger);font-family:inherit;">
          <i class="fas fa-trash"></i>
        </button>` : ''}
    </div>`).join('');

  // Drag-and-drop pour réordonner
  let dragSrc = null;

  list.querySelectorAll('.col-manage-item[draggable="true"]').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => item.style.opacity = '0.4', 0);
    });
    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      list.querySelectorAll('.col-manage-item').forEach(i => i.style.borderTop = '');
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (item !== dragSrc) item.style.borderTop = '2px solid var(--color-primary)';
    });
    item.addEventListener('dragleave', () => item.style.borderTop = '');
    item.addEventListener('drop', async e => {
      e.preventDefault();
      item.style.borderTop = '';
      if (!dragSrc || dragSrc === item) return;

      // Réinsère dans le DOM
      const items   = [...list.querySelectorAll('.col-manage-item')];
      const fromIdx = items.indexOf(dragSrc);
      const toIdx   = items.indexOf(item);
      if (fromIdx < toIdx) item.after(dragSrc);
      else item.before(dragSrc);

      // Calcule le nouvel ordre et envoie au serveur
      const newOrder = [...list.querySelectorAll('.col-manage-item')].map((el, i) => ({
        id:       parseInt(el.dataset.id),
        position: i,
      }));

      await fetch('/api/rmas/columns/reorder', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ order: newOrder }),
      });

      await reloadColumns();
      renderColumnsModal();
      initBoard();
      loadRmas();
    });
  });
}

window.startRenameColumn = function(id) {
  const col = allColumns.find(c => c.id === id);
  if (!col) return;
  const newName = prompt('Nouveau nom de la colonne :', col.name);
  if (!newName || newName.trim() === col.name) return;
  fetch(`/api/rmas/columns/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName.trim() })
  }).then(async r => {
    if (r.ok) {
      await reloadColumns();
      renderColumnsModal();
      tooltipCache = {};
      loadRmas();
      if (window.toast) toast.success('Colonne renommée', newName.trim());
    } else {
      const e = await r.json();
      if (window.toast) toast.error('Erreur', e.error);
    }
  });
};

window.updateColumnColor = function(id, color) {
  fetch(`/api/rmas/columns/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color })
  }).then(async r => {
    if (r.ok) {
      await reloadColumns();
      renderColumnsModal();
      loadRmas();
    }
  });
};

window.deleteColumn = async function(id, name) {
  const ok = await showConfirm({
    title: `Supprimer "${name}" ?`,
    message: 'Impossible si des RMAs sont dans cette colonne.',
    confirmText: 'Supprimer', cancelText: 'Annuler', type: 'danger'
  });
  if (!ok) return;
  const r = await fetch(`/api/rmas/columns/${id}`, { method: 'DELETE' });
  if (r.ok) {
    await reloadColumns();
    renderColumnsModal();
    tooltipCache = {};
    loadRmas();
    if (window.toast) toast.success('Colonne supprimée', '');
  } else {
    const e = await r.json();
    if (window.toast) toast.error('Erreur', e.error);
  }
};

window.addColumn = async function() {
  const name = document.getElementById('new-col-name').value.trim();
  const color = document.getElementById('new-col-color').value || '#6366f1';
  if (!name) return;
  const r = await fetch('/api/rmas/columns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  });
  if (r.ok) {
    document.getElementById('new-col-name').value = '';
    await reloadColumns();
    renderColumnsModal();
    tooltipCache = {};
    loadRmas();
    if (window.toast) toast.success('Colonne ajoutée', name);
  } else {
    const e = await r.json();
    if (window.toast) toast.error('Erreur', e.error);
  }
};


// ══════════════════════════════════════════════════════════════════════════════

function buildLinkedLoanBlock(rma, rmaId) {
  const loan = rma.linked_loan;

  const ownerBadge = (owner) => {
    const isSupplier = owner === 'Fournisseur';
    const color = isSupplier ? '#f59e0b' : 'var(--color-primary)';
    return `<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;
      padding:1px 6px;border-radius:2px;background:${color}15;color:${color};border:1px solid ${color}30;">
      ${isSupplier ? 'Fournisseur' : 'KB Med'}
    </span>`;
  };

  const statusBadge = (status) => {
    const color = status === 'Retourné' ? 'var(--color-success)' : status === 'En retard' ? 'var(--color-danger)' : 'var(--color-info)';
    return `<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:2px;background:${color}15;color:${color};border:1px solid ${color}30;">${escapeHtml(status || '')}</span>`;
  };

  if (loan) {
    // ── Prêt existant ────────────────────────────────────────────────────────
    const fmtD = d => d ? new Intl.DateTimeFormat('fr-CH').format(new Date(d)) : '—';
    return `
      <div class="rma-info-card" style="margin-top:0;">
        <div class="rma-info-card-header">
          <i class="fas fa-exchange-alt" style="color:var(--color-primary)"></i>
          Appareil de remplacement
          <span style="margin-left:auto;">${ownerBadge(loan.device_owner)}</span>
        </div>
        <div class="rma-info-card-body" style="padding:12px 14px;">
          <div style="font-weight:700;font-size:var(--text-sm);margin-bottom:2px;">${escapeHtml(loan.device_name || '—')}</div>
          ${loan.device_brand ? `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">${escapeHtml(loan.device_brand)}</div>` : ''}
          ${loan.device_serial ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary);margin-bottom:8px;">SN ${escapeHtml(loan.device_serial)}</div>` : ''}
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
            ${statusBadge(loan.status)}
            <span style="font-size:10px;color:var(--text-tertiary);">
              ${fmtD(loan.start_date)} ${loan.expected_return_date ? `→ ${fmtD(loan.expected_return_date)}` : ''}
            </span>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border-primary);">
            <a href="/loans.html" style="flex:1;text-align:center;font-size:var(--text-xs);color:var(--color-primary);
              text-decoration:none;padding:5px;border:1px solid var(--border-primary);border-radius:3px;
              display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="fas fa-external-link-alt" style="font-size:10px;"></i> Voir le prêt
            </a>
            <button onclick="unlinkLoanFromRma(${rmaId}, ${loan.id})"
              style="flex:1;background:none;border:1px solid rgba(239,68,68,0.3);color:var(--color-danger);
                font-size:var(--text-xs);padding:5px;border-radius:3px;cursor:pointer;font-family:inherit;
                display:flex;align-items:center;justify-content:center;gap:4px;"
              onmouseover="this.style.background='var(--color-danger-bg)'"
              onmouseout="this.style.background='none'">
              <i class="fas fa-unlink" style="font-size:10px;"></i> Dissocier
            </button>
          </div>
        </div>
      </div>`;
  }

  // ── Aucun prêt lié — formulaire d'association ────────────────────────────
  // On filtre les prêts actifs disponibles (non liés ou liés à ce RMA)
  const availableLoans = (window.allLoansForRma || []);
  const optionsHtml = availableLoans.length
    ? availableLoans.map(l =>
        `<option value="${l.id}">${escapeHtml(l.device_name || '—')}${l.device_brand ? ` — ${escapeHtml(l.device_brand)}` : ''} · ${escapeHtml(l.cabinet_name || 'Sans client')}</option>`
      ).join('')
    : '<option value="">Aucun prêt actif disponible</option>';

  return `
    <div class="rma-info-card" style="margin-top:0;">
      <div class="rma-info-card-header">
        <i class="fas fa-exchange-alt" style="color:var(--color-primary)"></i>
        Appareil de remplacement
      </div>
      <div class="rma-info-card-body" style="padding:12px 14px;">
        <div style="font-size:var(--text-xs);color:var(--text-tertiary);font-style:italic;margin-bottom:10px;">
          Aucun prêt associé à ce RMA.
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <select id="rma-loan-select-${rmaId}"
            style="width:100%;height:32px;padding:0 8px;border:1px solid var(--border-primary);
              border-radius:3px;font-size:var(--text-xs);background:var(--bg-primary);
              color:var(--text-primary);font-family:inherit;outline:none;">
            <option value="">-- Sélectionner un prêt existant --</option>
            ${optionsHtml}
          </select>
          <button onclick="linkLoanToRma(${rmaId})"
            style="width:100%;padding:5px;background:var(--color-primary);color:#fff;
              border:none;border-radius:3px;font-size:var(--text-xs);cursor:pointer;
              font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;">
            <i class="fas fa-link"></i> Associer ce prêt
          </button>
          <a href="/loans.html" style="width:100%;text-align:center;padding:5px;
            background:var(--bg-secondary);border:1px solid var(--border-primary);
            border-radius:3px;font-size:var(--text-xs);color:var(--text-secondary);
            text-decoration:none;display:flex;align-items:center;justify-content:center;gap:5px;">
            <i class="fas fa-plus" style="font-size:10px;"></i> Créer un nouveau prêt
          </a>
        </div>
      </div>
    </div>`;
}

window.linkLoanToRma = async function(rmaId) {
  const select = document.getElementById(`rma-loan-select-${rmaId}`);
  const loanId = select?.value;
  if (!loanId) {
    if (window.toast) toast.error('Sélection requise', 'Choisissez un prêt dans la liste.');
    return;
  }
  try {
    const res = await fetch(`/api/loans/${loanId}/link-rma`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rma_id: rmaId })
    });
    if (res.ok) {
      tooltipCache[rmaId] = null;
      await loadRmas();
      openRmaDetails(rmaId);
      if (window.toast) toast.success('Prêt associé', 'Le lien RMA ↔ Prêt a été créé.');
    } else {
      const err = await res.json();
      if (window.toast) toast.error('Erreur', err.error || 'Impossible d\'associer.');
    }
  } catch (e) { console.error(e); if (window.toast) toast.error('Erreur réseau', ''); }
};

window.unlinkLoanFromRma = async function(rmaId, loanId) {
  const ok = await showConfirm({
    title: 'Dissocier le prêt ?',
    message: 'Le prêt restera dans le système mais ne sera plus lié à ce RMA.',
    confirmText: 'Dissocier', cancelText: 'Annuler', type: 'warning'
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/loans/${loanId}/link-rma`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rma_id: null })
    });
    if (res.ok) {
      tooltipCache[rmaId] = null;
      await loadRmas();
      openRmaDetails(rmaId);
      if (window.toast) toast.success('Prêt dissocié', '');
    }
  } catch (e) { console.error(e); }
};

window.renderTagsSection = function(rma, allTags, rmaId) {
  const assignedIds = rma.tags ? rma.tags.map(t => t.id) : [];
  const available   = allTags.filter(t => !assignedIds.includes(t.id));

  const assignedHtml = rma.tags && rma.tags.length > 0
    ? rma.tags.map(t => `
        <span style="background:${t.color}18;color:${t.color};font-size:var(--text-xs);padding:3px 10px;border-radius:2px;font-weight:700;border:1px solid ${t.color}35;display:inline-flex;align-items:center;gap:5px;">
          ${escapeHtml(t.name)}
          <i class="fas fa-times" style="cursor:pointer;opacity:0.5;font-size:10px;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'" onclick="removeTagFromRma(${rmaId}, ${t.id})"></i>
        </span>`).join('')
    : '<span style="color:var(--text-tertiary);font-size:var(--text-xs);font-style:italic;">Aucune étiquette.</span>';

  const availableHtml = available.length > 0
    ? available.map(t => `
        <button type="button" onclick="addTagToRma(${rmaId}, ${t.id})" style="background:var(--bg-secondary);color:${t.color};font-size:var(--text-xs);padding:3px 10px;border-radius:2px;font-weight:600;border:1px dashed ${t.color}60;display:inline-flex;align-items:center;gap:4px;cursor:pointer;" onmouseover="this.style.background='${t.color}10'" onmouseout="this.style.background='var(--bg-secondary)'">
          <i class="fas fa-plus" style="font-size:9px"></i> ${escapeHtml(t.name)}
        </button>`).join('')
    : '<span style="color:var(--text-tertiary);font-size:var(--text-xs);font-style:italic;">Toutes les étiquettes sont utilisées.</span>';

  return `
    <div style="margin:16px 0;background:var(--bg-secondary);padding:14px;border:1px solid var(--border-primary);">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:10px;letter-spacing:0.06em;">Étiquettes actives</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${assignedHtml}</div>
      <div style="border-top:1px solid var(--border-primary);padding-top:10px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:8px;">Ajouter une étiquette</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">${availableHtml}</div>
      </div>
    </div>`;
};

window.addTagToRma = async function(rmaId, tagId) {
  await fetch(`/api/rmas/${rmaId}/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_id: tagId }) });
  tooltipCache[rmaId] = null; openRmaDetails(rmaId); loadRmas();
};

window.removeTagFromRma = async function(rmaId, tagId) {
  await fetch(`/api/rmas/${rmaId}/tags/${tagId}`, { method: 'DELETE' });
  tooltipCache[rmaId] = null; openRmaDetails(rmaId); loadRmas();
};

// ══════════════════════════════════════════════════════════════════════════════
//  TAG MANAGER GLOBAL
// ══════════════════════════════════════════════════════════════════════════════

window.openTagManager = async function() {
  document.getElementById('tag-manager-modal').classList.add('active');
  await loadTagManagerList();
};

window.closeTagManager = function() { document.getElementById('tag-manager-modal').classList.remove('active'); };

window.loadTagManagerList = async function() {
  const container = document.getElementById('tag-manager-list');
  container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-tertiary)"><i class="fas fa-spinner fa-spin"></i></div>`;
  try {
    const res  = await fetch('/api/rmas/tags/all');
    const tags = await res.json();
    if (!tags.length) { container.innerHTML = `<p style="text-align:center;color:var(--text-tertiary);font-size:var(--text-sm);padding:20px;">Aucune étiquette.</p>`; return; }
    container.innerHTML = tags.map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg-elevated);border:1px solid var(--border-primary);">
        <span style="background:${t.color}18;color:${t.color};font-size:var(--text-xs);padding:3px 10px;border-radius:2px;font-weight:700;border:1px solid ${t.color}35;">${escapeHtml(t.name)}</span>
        <button onclick="deleteGlobalTag(${t.id})" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;padding:4px 8px;" onmouseover="this.style.color='var(--color-danger)'" onmouseout="this.style.color='var(--text-tertiary)'"><i class="fas fa-trash-alt" style="font-size:0.8rem"></i></button>
      </div>`).join('');
  } catch (e) { container.innerHTML = `<p style="color:var(--color-danger);">Erreur.</p>`; }
};

window.createNewGlobalTag = async function(e) {
  e.preventDefault();
  const name  = document.getElementById('new-tag-name').value.trim();
  const color = document.getElementById('new-tag-color').value;
  if (!name) return;
  const res = await fetch('/api/rmas/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color }) });
  if (res.ok) { document.getElementById('new-tag-name').value = ''; await loadTagManagerList(); if (window.toast) toast.success('Étiquette créée', name); }
};

window.deleteGlobalTag = async function(tagId) {
  const ok = await showConfirm({ title: "Supprimer l'étiquette ?", message: 'Elle sera retirée de tous les RMA.', confirmText: 'Supprimer', cancelText: 'Annuler', type: 'danger' });
  if (!ok) return;
  await fetch(`/api/rmas/tags/${tagId}/global`, { method: 'DELETE' });
  await loadTagManagerList(); loadRmas();
};

// ══════════════════════════════════════════════════════════════════════════════
//  PIÈCES JOINTES
// ══════════════════════════════════════════════════════════════════════════════

function getAttachmentsHtml(rma, rmaId) {
  const listHtml = rma.attachments && rma.attachments.length > 0
    ? rma.attachments.map(att => {
        const isPdf  = att.file_type && att.file_type.includes('pdf');
        const icon   = isPdf ? 'fa-file-pdf' : 'fa-image';
        const color  = isPdf ? 'var(--color-danger)' : 'var(--color-info)';
        return `
          <div style="display:flex;align-items:center;gap:10px;background:var(--bg-secondary);padding:8px 12px;border:1px solid var(--border-primary);">
            <i class="fas ${icon}" style="color:${color};font-size:18px;flex-shrink:0"></i>
            <a href="${att.file_path}" target="_blank" style="color:var(--text-primary);text-decoration:none;font-weight:600;font-size:var(--text-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${escapeHtml(att.file_name)}</a>
            <button onclick="deleteAttachment(${rmaId}, ${att.id})" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;padding:4px;" onmouseover="this.style.color='var(--color-danger)'" onmouseout="this.style.color='var(--text-tertiary)'"><i class="fas fa-trash" style="font-size:12px"></i></button>
          </div>`;
      }).join('')
    : `<span style="color:var(--text-tertiary);font-size:var(--text-sm);font-style:italic;">Aucun document joint.</span>`;

  return `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-primary);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);letter-spacing:0.06em;">Documents & Photos</div>
        <div>
          <input type="file" id="file-upload-input" style="display:none;" onchange="uploadAttachment(${rmaId}, this)">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('file-upload-input').click()"><i class="fas fa-upload"></i> Ajouter</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">${listHtml}</div>
    </div>`;
}

async function uploadAttachment(rmaId, input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch(`/api/rmas/${rmaId}/attachments`, { method: 'POST', body: formData });
    if (res.ok) { openRmaDetails(rmaId); if (window.toast) toast.success('Fichier ajouté', file.name); }
    else { if (window.toast) toast.error('Erreur', 'Envoi échoué.'); }
  } catch { if (window.toast) toast.error('Erreur réseau', ''); }
  finally { input.value = ''; }
}

async function deleteAttachment(rmaId, attachmentId) {
  const ok = await confirmDelete('ce fichier');
  if (!ok) return;
  const res = await fetch(`/api/rmas/attachments/${attachmentId}`, { method: 'DELETE' });
  if (res.ok) openRmaDetails(rmaId);
}

// ══════════════════════════════════════════════════════════════════════════════
//  TOOLTIP SURVOL
// ══════════════════════════════════════════════════════════════════════════════

function handleCardHover(ev, rmaId) {
  const card = ev.currentTarget;
  clearTimeout(hoverTimeout);
 
  hoverTimeout = setTimeout(async () => {
    if (!card) return;
    const tooltip = document.getElementById('rma-tooltip');
    if (!tooltip) return;
 
    // Positionnement fixe (plus fiable que absolute + scroll)
    const rect  = card.getBoundingClientRect();
    const TW    = 320; // tooltip width
    const pad   = 12;
 
    let top  = rect.top;
    let left = rect.right + pad;
    if (left + TW > window.innerWidth - 10) left = rect.left - TW - pad;
    if (top + 400 > window.innerHeight)     top  = Math.max(8, window.innerHeight - 420);
 
    tooltip.style.cssText = `
      position:fixed;
      top:${top}px;
      left:${left}px;
      display:block;
      opacity:0;
      transition:opacity 0.15s ease;
      z-index:9999;
      width:${TW}px;
    `;
    tooltip.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--text-tertiary);">
        <i class="fas fa-circle-notch fa-spin"></i>
      </div>`;
    requestAnimationFrame(() => { tooltip.style.opacity = '1'; });
 
    try {
      if (!tooltipCache[rmaId]) {
        const res = await fetch(`/api/rmas/${rmaId}`);
        tooltipCache[rmaId] = await res.json();
      }
      const d = tooltipCache[rmaId];
 
      const stageIndex = getRmaStages().indexOf(d.status);
      const stageColor = getStageColor(d.status) || '#94a3b8';
      const displayNum = d.rma_number || `#${d.id}`;
 
      // Tags
      const tagsHtml = (d.tags && d.tags.length > 0)
        ? d.tags.map(t => `<span class="tooltip-tag" style="background:${t.color}18;color:${t.color};border:1px solid ${t.color}30;">${escapeHtml(t.name)}</span>`).join('')
        : '';
 
      // Due badge
      const dueLine = d.due_date
        ? `<div class="tooltip-row">${buildDueBadge(d.due_date)}</div>`
        : '';
 
      // Commentaires (3 derniers)
      const comments = [...(d.comments || [])].reverse().slice(0, 3);
      const commentsHtml = comments.length
        ? comments.map(c => `
            <div class="tooltip-comment">
              <div class="tooltip-comment-header">
                <span class="tooltip-comment-author">${escapeHtml(c.user_name)}</span>
                <span class="tooltip-comment-date">${new Date(c.created_at).toLocaleDateString('fr-CH')}</span>
              </div>
              <div class="tooltip-comment-text">${escapeHtml(c.comment)}</div>
            </div>`).join('')
        : `<div class="tooltip-empty-comments">Aucune mise à jour.</div>`;
 
      tooltip.innerHTML = `
        <!-- En-tête -->
        <div class="tooltip-header">
          <div class="tooltip-stage-dot" style="background:${stageColor}"></div>
          <div class="tooltip-title">
            <div class="tooltip-rma-num">${escapeHtml(displayNum)}</div>
            <div class="tooltip-equipment">${escapeHtml(d.equipment_name || 'Appareil non spécifié')}</div>
            <div class="tooltip-client">
              <i class="fas fa-hospital" style="opacity:0.4;font-size:9px;margin-right:3px;"></i>
              ${escapeHtml(d.cabinet_name || 'Client inconnu')}
            </div>
          </div>
          <span class="tooltip-supplier">${escapeHtml(d.supplier_name || 'Xion')}</span>
        </div>
 
        <!-- Corps -->
        <div class="tooltip-body">
          <!-- Étape actuelle -->
          <div style="margin-bottom:8px;">
            <span style="background:${stageColor}18;color:${stageColor};font-size:11px;font-weight:700;
              padding:2px 10px;border-radius:2px;border:1px solid ${stageColor}30;">
              ${escapeHtml(d.status)}
            </span>
          </div>
 
          <!-- Échéance -->
          ${dueLine}
 
          <!-- Tags -->
          ${tagsHtml ? `<div class="tooltip-tags">${tagsHtml}</div>` : ''}
 
          <!-- Description -->
          <div class="tooltip-desc">${escapeHtml((d.description || 'Aucune description'))}</div>
 
          <!-- Commentaires -->
          <div class="tooltip-comments">
            <div class="tooltip-comments-title">
              <i class="fas fa-history" style="margin-right:4px;"></i>
              Dernières mises à jour
            </div>
            ${commentsHtml}
          </div>
        </div>
      `;
    } catch (e) {
      tooltip.innerHTML = `<div style="padding:20px;color:var(--color-danger);text-align:center;font-size:var(--text-xs);">
        <i class="fas fa-exclamation-triangle" style="display:block;margin-bottom:6px;font-size:18px;"></i>
        Erreur de chargement
      </div>`;
    }
  }, 400);
}

function handleCardLeave() {
  clearTimeout(hoverTimeout);
  const tooltip = document.getElementById('rma-tooltip');
  if (tooltip) { tooltip.style.opacity = '0'; setTimeout(() => { if (tooltip.style.opacity === '0') tooltip.style.display = 'none'; }, 200); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  REFUS DE DEVIS
// ══════════════════════════════════════════════════════════════════════════════

async function refuseDevis(rmaId) {
  const reason = await askRefusedReason();
  if (!reason) return;
  try {
    await fetch(`/api/rmas/${rmaId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: `❌ DEVIS REFUSÉ par le client. Raison : ${reason}` }) });
    const tagsRes  = await fetch('/api/rmas/tags/all');
    const allTags  = await tagsRes.json();
    let refusedTag = allTags.find(t => ['devis refusé', 'refus de devis'].includes(t.name.toLowerCase()));
    if (!refusedTag) {
      const createRes = await fetch('/api/rmas/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Devis Refusé', color: '#ef4444' }) });
      refusedTag = await createRes.json();
    }
    await fetch(`/api/rmas/${rmaId}/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_id: refusedTag.id }) });
    tooltipCache[rmaId] = null; openRmaDetails(rmaId); loadRmas();
    if (window.toast) toast.warning('Devis refusé', 'Pensez à archiver ce RMA.');
  } catch (err) { console.error(err); }
}

function askRefusedReason() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:var(--bg-elevated);border:1px solid var(--border-primary);padding:24px;max-width:420px;width:100%;box-shadow:var(--shadow-2xl);border-radius:4px;">
        <div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:12px;display:flex;align-items:center;gap:8px;"><i class="fas fa-ban" style="color:var(--color-danger)"></i> Raison du refus</div>
        <textarea id="refuse-reason-input" placeholder="Ex: Réparation trop chère..." rows="4" style="width:100%;padding:8px 10px;border:1px solid var(--border-primary);border-radius:3px;font-family:inherit;font-size:var(--text-sm);color:var(--text-primary);background:var(--bg-primary);resize:vertical;margin-bottom:14px;outline:none;"></textarea>
        <div style="display:flex;gap:8px;">
          <button id="refuse-cancel" class="btn btn-secondary" style="flex:1">Annuler</button>
          <button id="refuse-ok" class="btn btn-danger" style="flex:1">Confirmer le refus</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#refuse-reason-input');
    input.focus();
    overlay.querySelector('#refuse-ok').onclick    = () => { const val = input.value.trim(); document.body.removeChild(overlay); resolve(val || null); };
    overlay.querySelector('#refuse-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  STATISTIQUES
// ══════════════════════════════════════════════════════════════════════════════

async function loadDashboardStats() {
  try {
    const [statsRes, allRmasRes] = await Promise.all([fetch('/api/rmas/stats/dashboard'), fetch('/api/rmas')]);
    const data    = await statsRes.json();
    const allData = await allRmasRes.json();

    const activeRmas   = allData.filter(r => r.status !== 'Archives');
    const archivedRmas = allData.filter(r => r.status === 'Archives');
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const doneThisMonth = allData.filter(r => r.status === 'Livraison + Facturation' && new Date(r.updated_at || r.created_at) >= startOfMonth).length;
    const transitCount  = activeRmas.filter(r => r.status === 'Transit vers Xion' || r.status === 'Transit vers KB').length;

    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setKpi('kpi-total',    activeRmas.length);
    setKpi('kpi-devis',    data.statusDistribution.find(s => s.status === 'Devis au client')?.count || 0);
    setKpi('kpi-repair',   data.statusDistribution.find(s => s.status === 'En réparation')?.count || 0);
    setKpi('kpi-transit',  transitCount);
    setKpi('kpi-done',     doneThisMonth);
    setKpi('kpi-archived', archivedRmas.length);

    renderPipeline(data.statusDistribution, activeRmas.length);
    renderAvgTime(allData);

    Object.values(charts).forEach(c => { if (c && typeof c.destroy === 'function') c.destroy(); });
    charts = {};

    const COLORS = ['rgba(44,90,160,0.8)','rgba(139,92,246,0.8)','rgba(59,130,246,0.8)','rgba(245,158,11,0.8)','rgba(249,115,22,0.8)','rgba(16,185,129,0.8)','rgba(239,68,68,0.8)','rgba(6,182,212,0.8)'];
    const supplierColors = { 'Xion': '#ef4444', 'Heinemann': '#3b82f6', 'Autre': '#94a3b8' };

    const tagCounts = {};
    allData.forEach(r => { if (r.tags) r.tags.forEach(t => { tagCounts[t.name] = (tagCounts[t.name] || 0) + 1; }); });
    const tagEntries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const tryChart = (id, config) => { const ctx = document.getElementById(id)?.getContext('2d'); if (ctx) charts[id] = new Chart(ctx, config); };

    tryChart('statusChart', { type: 'bar', data: { labels: data.statusDistribution.map(d => d.status), datasets: [{ label: 'RMA', data: data.statusDistribution.map(d => d.count), backgroundColor: 'rgba(44,90,160,0.75)', borderRadius: 2 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } } });
    tryChart('supplierChart', { type: 'doughnut', data: { labels: data.supplierDistribution.map(d => d.supplier_name || 'Inconnu'), datasets: [{ data: data.supplierDistribution.map(d => d.count), backgroundColor: data.supplierDistribution.map(d => supplierColors[d.supplier_name] || '#94a3b8'), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } } });
    tryChart('clientsChart', { type: 'bar', data: { labels: data.topClients.map(d => d.cabinet_name), datasets: [{ label: 'RMA', data: data.topClients.map(d => d.count), backgroundColor: COLORS, borderRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    tryChart('equipmentChart', { type: 'pie', data: { labels: data.topEquipment.map(d => `${d.brand} — ${d.name}`), datasets: [{ data: data.topEquipment.map(d => d.count), backgroundColor: COLORS, borderWidth: 1, borderColor: 'var(--bg-elevated)' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } } });
    if (tagEntries.length) tryChart('tagsChart', { type: 'bar', data: { labels: tagEntries.map(([name]) => name), datasets: [{ label: 'Utilisations', data: tagEntries.map(([, count]) => count), backgroundColor: COLORS, borderRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });

  } catch (e) { console.error('Erreur stats:', e); if (window.toast) toast.error('Erreur', 'Impossible de charger les statistiques.'); }
}

function renderPipeline(statusDist, total) {
  const container = document.getElementById('pipeline-stages');
  if (!container) return;
  const stagesData = getRmaStages().filter(s => s !== 'Archives').map(stage => ({ stage, color: getStageColor(stage), count: statusDist.find(d => d.status === stage)?.count || 0 })).filter(d => d.count > 0).sort((a, b) => b.count - a.count);
  if (!stagesData.length) { container.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);font-size:var(--text-sm);padding:20px;">Aucun RMA actif.</div>'; return; }
  const max = Math.max(...stagesData.map(d => d.count));
  container.innerHTML = stagesData.map(d => {
    const pct    = total > 0 ? Math.round((d.count / total) * 100) : 0;
    const barPct = max   > 0 ? Math.round((d.count / max)   * 100) : 0;
    return `<div class="pipeline-stage"><div class="pipeline-stage-name" title="${d.stage}" style="color:${d.color};font-weight:600;">${d.stage}</div><div class="pipeline-bar-track"><div class="pipeline-bar-fill" style="width:${barPct}%;background:${d.color}"></div></div><div class="pipeline-count">${d.count} <span style="color:var(--text-tertiary);font-weight:400">(${pct}%)</span></div></div>`;
  }).join('');
}

function renderAvgTime(rmas) {
  const container = document.getElementById('avg-time-table');
  if (!container) return;
  const stageGroups = {};
  const now = Date.now();
  rmas.filter(r => r.status !== 'Archives').forEach(r => {
    if (!stageGroups[r.status]) stageGroups[r.status] = [];
    stageGroups[r.status].push(Math.round((now - new Date(r.created_at).getTime()) / 86400000));
  });
  const rows = Object.entries(stageGroups).map(([stage, days]) => {
    const avg   = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
    const color = avg > 30 ? 'var(--color-danger)' : avg > 14 ? 'var(--color-warning)' : 'var(--color-success)';
    return { stage, avg, count: days.length, color };
  }).sort((a, b) => b.avg - a.avg);
  if (!rows.length) { container.innerHTML = '<p style="color:var(--text-tertiary);font-size:var(--text-sm)">Aucune donnée.</p>'; return; }
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:6px 16px;align-items:center;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);letter-spacing:0.05em;">Étape</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);letter-spacing:0.05em;text-align:right;">RMAs</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);letter-spacing:0.05em;text-align:right;">Moy. jours</div>
      ${rows.map(r => `<div style="font-size:var(--text-xs);color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.stage}</div><div style="font-size:var(--text-xs);color:var(--text-tertiary);text-align:right;">${r.count}</div><div style="font-size:var(--text-sm);font-weight:700;color:${r.color};text-align:right;">${r.avg}j</div>`).join('')}
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL + TOM SELECT
// ══════════════════════════════════════════════════════════════════════════════

function closeRmaModal() { document.getElementById('rma-modal').classList.remove('active'); currentRmaId = null; }
function loadingHtml()   { return `<div style="text-align:center;padding:60px;color:var(--text-tertiary)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>`; }

function applySearchableSelects() {
  for (const key in tsInstances) { if (tsInstances[key] && typeof tsInstances[key].destroy === 'function') { try { tsInstances[key].destroy(); } catch {} } delete tsInstances[key]; }
  const cfg = { create: false, maxOptions: null, sortField: { field: 'text', direction: 'asc' } };
  if (document.getElementById('form-client'))   tsInstances.formClient   = new TomSelect('#form-client',   cfg);
  if (document.getElementById('edit-client'))   tsInstances.editClient   = new TomSelect('#edit-client',   cfg);
  if (document.getElementById('edit-equipment')) tsInstances.editEquipment = new TomSelect('#edit-equipment', { create: false });
}

async function loadClientEquipmentForEdit(clientId) {
  const tsEq = tsInstances.editEquipment;
  if (!tsEq) return;
  tsEq.clear(); tsEq.clearOptions();
  if (!clientId) { tsEq.addOption({ value: '', text: '-- Aucun --' }); return; }
  try {
    const res       = await fetch(`/api/rmas/equipment/${clientId}`);
    const equipment = await res.json();
    tsEq.addOption({ value: '', text: '-- Aucun équipement spécifié --' });
    equipment.forEach(e => tsEq.addOption({ value: e.id, text: `${e.brand} — ${e.name} (SN: ${e.serial_number || 'N/A'})` }));
  } catch (err) { console.error(err); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ══════════════════════════════════════════════════════════════════════════════

// ── Helpers HTML formaté ──────────────────────────────────────────────────────
function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').trim();
}
function sanitizeHtml(html) {
  return (html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
}

// ── Barre de formatage ────────────────────────────────────────────────────────
function buildFormatBar(targetId) {
  const colors = [
    { label: 'Défaut',  value: '',        bg: 'var(--text-primary)',  },
    { label: 'Rouge',   value: '#ef4444', bg: '#ef4444' },
    { label: 'Orange',  value: '#f97316', bg: '#f97316' },
    { label: 'Bleu',    value: '#3b82f6', bg: '#3b82f6' },
    { label: 'Vert',    value: '#16a34a', bg: '#16a34a' },
  ];
  const btnBase = `background:none;border:1px solid var(--border-primary);border-radius:3px;cursor:pointer;
    padding:2px 7px;font-size:11px;font-family:inherit;color:var(--text-secondary);
    transition:all 0.1s;display:flex;align-items:center;gap:3px;`;
  return `
    <div style="display:flex;align-items:center;gap:5px;padding:5px 8px;
      background:var(--bg-secondary);border:1px solid var(--border-primary);
      border-bottom:none;border-radius:3px 3px 0 0;">
      <button type="button" title="Surligner en jaune"
        onclick="applyRmaFormat('hilite','${targetId}')"
        style="${btnBase}">
        <span style="background:#fef08a;padding:0 4px;border-radius:2px;font-weight:700;color:#92400e;">A</span>&nbsp;Surligner
      </button>
      <div style="width:1px;height:16px;background:var(--border-primary);margin:0 2px;"></div>
      <span style="font-size:10px;color:var(--text-tertiary);">Couleur :</span>
      ${colors.map(c => `
        <button type="button" title="${c.label}"
          onclick="applyRmaFormat('color','${targetId}','${c.value}')"
          style="width:16px;height:16px;border-radius:50%;background:${c.bg};
            border:2px solid ${c.bg};cursor:pointer;flex-shrink:0;padding:0;">
        </button>`).join('')}
      <div style="width:1px;height:16px;background:var(--border-primary);margin:0 2px;"></div>
      <button type="button" title="Effacer le formatage"
        onclick="applyRmaFormat('clear','${targetId}')"
        style="${btnBase}font-size:10px;">
        <i class="fas fa-times" style="font-size:9px;"></i>&nbsp;Effacer
      </button>
    </div>
    <div id="${targetId}" contenteditable="true"
      style="width:100%;min-height:80px;padding:9px 10px;
        border:1px solid var(--border-primary);border-radius:0 0 3px 3px;
        font-size:var(--text-sm);background:var(--bg-primary);color:var(--text-primary);
        font-family:inherit;outline:none;line-height:1.5;word-break:break-word;">
    </div>`;
}

window.applyRmaFormat = function(type, targetId, value) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.focus();
  if (type === 'hilite') {
    document.execCommand('hiliteColor', false, '#fef08a');
  } else if (type === 'color') {
    if (!value) document.execCommand('removeFormat', false, null);
    else document.execCommand('foreColor', false, value);
  } else if (type === 'clear') {
    document.execCommand('removeFormat', false, null);
    document.execCommand('hiliteColor', false, 'transparent');
  }
};

function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = String(t); return d.innerHTML; }
function fmt(d) { if (!d) return '—'; return new Intl.DateTimeFormat('fr-CH').format(new Date(d)); }

// ══════════════════════════════════════════════════════════════════════════════
//  EXPOSITIONS GLOBALES
// ══════════════════════════════════════════════════════════════════════════════

window.loadRmas                  = loadRmas;
window.openRmaDetails            = openRmaDetails;
window.closeRmaModal             = closeRmaModal;
window.deleteRma                 = deleteRma;
window.evAllowDrop               = evAllowDrop;
window.evDragLeave               = evDragLeave;
window.evDrop                    = evDrop;
window.evDrag                    = evDrag;
window.editRmaDetails            = editRmaDetails;
window.updateRma                 = updateRma;
window.addComment                = addComment;
window.startEditComment          = window.startEditComment;
window.saveCommentEdit           = window.saveCommentEdit;
window.cancelCommentEdit         = window.cancelCommentEdit;
window.deleteComment             = window.deleteComment;
window.uploadAttachment          = uploadAttachment;
window.deleteAttachment          = deleteAttachment;
window.refuseDevis               = refuseDevis;
window.saveRma                   = saveRma;
window.openNewRmaModal           = openNewRmaModal;
window.loadClientEquipment       = loadClientEquipment;
window.loadClientEquipmentForEdit = loadClientEquipmentForEdit;
window.toggleView                = toggleView;
window.loadDashboardStats        = loadDashboardStats;