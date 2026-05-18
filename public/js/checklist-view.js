// public/js/checklist-view.js — Version améliorée
// Fixes : API endpoints, design check-cards, progress SVG

let currentChecklist = null;
let checklistId      = null;
const getStorageKey  = () => `checklist_progress_${checklistId}`;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  checklistId = urlParams.get('id');
  if (!checklistId) { window.location.href = '/checklists.html'; return; }

  await checkAuth();
  await loadChecklistData();

  document.getElementById('reset-trigger-btn')?.addEventListener('click', openResetModal);
  document.getElementById('confirm-reset-btn')?.addEventListener('click', confirmReset);
});

// ── AUTH ─────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me'); // ← corrigé
    if (!res.ok) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    const el = document.getElementById('u-avatar');
    const nm = document.getElementById('u-name');
    const ro = document.getElementById('u-role');
    if (el) el.textContent = data.user.name.charAt(0).toUpperCase();
    if (nm) nm.textContent = data.user.name;
    if (ro) ro.textContent = data.user.role;
  } catch { window.location.href = '/login.html'; }
}

// ── CHARGEMENT ───────────────────────────────────────────────────────
async function loadChecklistData() {
  try {
    const res = await fetch(`/api/checklists/${checklistId}`);
    if (!res.ok) throw new Error();
    currentChecklist = await res.json();
    renderPage();
    restoreProgress();
    updateGlobalProgress();
  } catch {
    const el = document.getElementById('checklist-title-text');
    if (el) el.textContent = 'Checklist introuvable';
  }
}

// ── RENDU ────────────────────────────────────────────────────────────
function renderPage() {
  const t = currentChecklist;
  const titleEl = document.getElementById('checklist-title-text');
  const descEl  = document.getElementById('checklist-description');
  const badge   = document.getElementById('checklist-category-badge');

  if (titleEl) titleEl.textContent = t.name;
  if (descEl)  descEl.textContent  = t.description || '';
  if (badge && t.category) badge.textContent = t.category;

  renderItems('equipment-list', t.equipment || [], 'eq', (item) =>
    `<span style="
      background:rgba(59,130,246,0.1);color:#3b82f6;
      font-size:10px;font-weight:700;padding:1px 6px;
      border-radius:2px;margin-right:6px;
    ">${item.quantity}×</span>${escapeHtml(item.equipment_name)}`
  );

  renderItems('tasks-list', t.tasks || [], 'task', (item) =>
    escapeHtml(item.task_name)
  );
}

function renderItems(containerId, items, type, labelFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div style="
        padding:32px;text-align:center;
        color:var(--text-tertiary);font-size:var(--text-sm);font-style:italic;
        background:var(--bg-secondary);border:1px dashed var(--border-primary);
      ">
        ${type === 'eq' ? 'Aucun matériel requis' : 'Aucune tâche définie'}
      </div>`;
    return;
  }

  container.innerHTML = items.map((item, idx) => `
    <div id="${type}-item-${idx}"
      onclick="toggleItem('${type}', ${idx})"
      style="
        display:flex;align-items:center;gap:12px;
        padding:12px 14px;
        background:var(--bg-primary);
        border:1px solid var(--border-primary);
        cursor:pointer;
        transition:all 0.15s;
        user-select:none;
        margin-bottom:6px;
      "
      onmouseenter="if(!this.classList.contains('is-checked'))this.style.borderColor='var(--color-primary)';this.style.background='var(--bg-secondary)'"
      onmouseleave="if(!this.classList.contains('is-checked'))this.style.borderColor='var(--border-primary)';this.style.background='var(--bg-primary)'">

      <!-- Cercle de check -->
      <div class="check-circle-new" style="
        width:22px;height:22px;border-radius:50%;flex-shrink:0;
        border:2px solid var(--border-secondary);
        display:flex;align-items:center;justify-content:center;
        transition:all 0.2s;background:var(--bg-elevated);
      ">
        <i class="fas fa-check" style="font-size:10px;color:transparent;transition:color 0.15s;"></i>
      </div>

      <!-- Texte -->
      <div style="
        flex:1;font-size:var(--text-sm);
        color:var(--text-primary);font-weight:var(--font-medium);
        line-height:1.4;transition:all 0.15s;
      ">${labelFn(item)}</div>
    </div>
  `).join('');
}

// ── TOGGLE ────────────────────────────────────────────────────────────
window.toggleItem = function(type, idx) {
  const card = document.getElementById(`${type}-item-${idx}`);
  if (!card) return;

  const checked  = card.classList.toggle('is-checked');
  const circle   = card.querySelector('.check-circle-new');
  const icon     = card.querySelector('.fa-check');
  const text     = card.querySelector('div[style*="flex:1"]');

  if (checked) {
    // État coché
    circle.style.background   = 'var(--color-success)';
    circle.style.borderColor  = 'var(--color-success)';
    icon.style.color          = '#fff';
    card.style.background     = 'rgba(16,185,129,0.06)';
    card.style.borderColor    = 'rgba(16,185,129,0.3)';
    if (text) { text.style.opacity = '0.5'; text.style.textDecoration = 'line-through'; }
  } else {
    // État décoché
    circle.style.background   = 'var(--bg-elevated)';
    circle.style.borderColor  = 'var(--border-secondary)';
    icon.style.color          = 'transparent';
    card.style.background     = 'var(--bg-primary)';
    card.style.borderColor    = 'var(--border-primary)';
    if (text) { text.style.opacity = '1'; text.style.textDecoration = 'none'; }
  }

  saveProgress();
  updateGlobalProgress();
};

// ── PROGRESSION ───────────────────────────────────────────────────────
function updateGlobalProgress() {
  const t = currentChecklist;
  const eqTotal    = (t.equipment || []).length;
  const eqChecked  = document.querySelectorAll('#equipment-list .is-checked').length;
  const eqPct      = eqTotal === 0 ? 100 : Math.round((eqChecked / eqTotal) * 100);

  const taskTotal   = (t.tasks || []).length;
  const taskChecked = document.querySelectorAll('#tasks-list .is-checked').length;
  const taskPct     = taskTotal === 0 ? 100 : Math.round((taskChecked / taskTotal) * 100);

  const eqCount   = document.getElementById('eq-count');
  const taskCount = document.getElementById('task-count');
  const eqFill    = document.getElementById('eq-progress-fill');
  const taskFill  = document.getElementById('task-progress-fill');

  if (eqCount)   eqCount.textContent   = `${eqChecked}/${eqTotal}`;
  if (taskCount) taskCount.textContent  = `${taskChecked}/${taskTotal}`;
  if (eqFill)    eqFill.style.width    = `${eqPct}%`;
  if (taskFill)  taskFill.style.width  = `${taskPct}%`;

  const totalItems   = eqTotal + taskTotal;
  const totalChecked = eqChecked + taskChecked;
  const globalPct    = totalItems === 0 ? 0 : Math.round((totalChecked / totalItems) * 100);

  const globalEl = document.getElementById('global-progress');
  if (globalEl) globalEl.textContent = `${globalPct}%`;

  // Cercle SVG
  const circle = document.getElementById('progress-ring-circle');
  if (circle) {
    const r            = circle.r.baseVal.value;
    const circumference = r * 2 * Math.PI;
    circle.style.strokeDasharray  = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference - (globalPct / 100) * circumference;
    const successColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-success').trim() || '#10b981';
    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-primary').trim() || '#2c5aa0';
    circle.style.stroke = globalPct === 100 ? successColor : primaryColor;
    if (globalEl) globalEl.style.color = globalPct === 100 ? successColor : primaryColor;
  }
}

// ── SAUVEGARDE localStorage ───────────────────────────────────────────
function saveProgress() {
  const state = { eq: [], tasks: [] };
  document.querySelectorAll('#equipment-list .is-checked').forEach(el => {
    const m = el.id.match(/eq-item-(\d+)/);
    if (m) state.eq.push(parseInt(m[1]));
  });
  document.querySelectorAll('#tasks-list .is-checked').forEach(el => {
    const m = el.id.match(/task-item-(\d+)/);
    if (m) state.tasks.push(parseInt(m[1]));
  });
  localStorage.setItem(getStorageKey(), JSON.stringify(state));
}

function restoreProgress() {
  const saved = localStorage.getItem(getStorageKey());
  if (!saved) return;
  try {
    const state = JSON.parse(saved);
    (state.eq    || []).forEach(idx => { const el = document.getElementById(`eq-item-${idx}`);   if (el) toggleItem('eq',   idx); });
    (state.tasks || []).forEach(idx => { const el = document.getElementById(`task-item-${idx}`); if (el) toggleItem('task', idx); });
  } catch {}
}

// ── RESET MODAL ──────────────────────────────────────────────────────
function openResetModal()  { document.getElementById('reset-confirm-modal')?.classList.add('active'); }
window.closeResetModal = function() { document.getElementById('reset-confirm-modal')?.classList.remove('active'); }

function confirmReset() {
  // Décoche visuellement chaque item
  ['equipment-list', 'tasks-list'].forEach(containerId => {
    const type = containerId === 'equipment-list' ? 'eq' : 'task';
    document.querySelectorAll(`#${containerId} .is-checked`).forEach(el => {
      const m = el.id.match(/(\d+)$/);
      if (m) toggleItem(type, parseInt(m[1]));
    });
  });
  localStorage.removeItem(getStorageKey());
  updateGlobalProgress();
  closeResetModal();
  if (window.toast) toast.success('Réinitialisé', 'Toutes les cases ont été décochées.');
}

// ── UTILS ─────────────────────────────────────────────────────────────
function escapeHtml(t) {
  if (!t) return '';
  const d = document.createElement('div');
  d.textContent = String(t);
  return d.innerHTML;
}