// public/js/checklist-view.js

// --- STYLE INJECTÉ ---
const viewStyles = `
/* Conteneur Large */
.checklist-view-container { max-width: 1600px; margin: 0 auto; padding: 2rem 3rem; }

/* Header Card */
.checklist-header-card { 
    background: white; border-radius: var(--radius-xl); border: 1px solid var(--border-color);
    box-shadow: var(--shadow-md); padding: 2rem; margin-bottom: 2rem; display: flex; flex-direction: column; gap: 1.5rem;
}
.header-main-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; }
.header-info { flex: 1; }
.header-breadcrumbs { display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; color: var(--neutral-500); margin-bottom: 0.75rem; }
.header-breadcrumbs a { color: var(--neutral-600); text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; transition: color 0.2s; }
.header-breadcrumbs a:hover { color: var(--color-primary); }
.separator { color: var(--neutral-300); }
.category-pill { background: var(--neutral-100); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--neutral-600); }

.checklist-header-card h1 { font-size: 1.75rem; font-weight: 800; color: var(--neutral-900); margin: 0 0 0.5rem 0; letter-spacing: -0.02em; }
.checklist-header-card p { font-size: 1rem; color: var(--neutral-500); margin: 0; line-height: 1.5; max-width: 700px; }

/* Actions Header */
.header-actions { display: flex; align-items: center; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--neutral-100); }
.spacer { flex: 1; }
.btn-ghost { background: transparent; color: var(--neutral-500); border: 1px solid transparent; }
.btn-ghost:hover { background: var(--neutral-50); color: var(--color-danger); }

/* Cercle Progression */
.progress-circle-container { display: flex; align-items: center; gap: 1rem; background: var(--neutral-50); padding: 0.75rem 1.25rem; border-radius: 100px; border: 1px solid var(--border-color); }
.progress-text { text-align: right; line-height: 1; }
.progress-text .label { display: block; font-size: 0.65rem; text-transform: uppercase; font-weight: 700; color: var(--neutral-400); margin-bottom: 2px; }
.progress-text .value { font-size: 1.25rem; font-weight: 800; color: var(--color-primary); font-variant-numeric: tabular-nums; }
.progress-ring__circle { transition: stroke-dashoffset 0.35s; transform: rotate(-90deg); transform-origin: 50% 50%; }

/* Grille 2 Colonnes */
.checklist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: start; }
@media (max-width: 900px) { .checklist-grid { grid-template-columns: 1fr; } }

/* Colonnes */
.checklist-column { background: white; border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; display: flex; flex-direction: column; }
.column-header { padding: 1.25rem; background: var(--neutral-50); border-bottom: 1px solid var(--border-color); }
.column-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.column-title-row h3 { font-size: 1rem; font-weight: 700; color: var(--neutral-800); margin: 0; display: flex; align-items: center; gap: 0.5rem; }
.count-badge { background: white; border: 1px solid var(--neutral-200); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; color: var(--neutral-500); }

/* Barres de progression internes */
.progress-bar-track { height: 4px; background: var(--neutral-200); border-radius: 2px; overflow: hidden; }
.progress-bar-fill { height: 100%; width: 0%; transition: width 0.3s ease-out; border-radius: 2px; }

.column-content { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; min-height: 200px; }

/* Items (Check Cards) */
.check-card { 
    display: flex; align-items: flex-start; padding: 1rem; 
    background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md);
    cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative; overflow: hidden;
}
.check-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border-color: var(--color-primary-light); }
.check-card:active { transform: translateY(0); }

/* État Coché */
.check-card.is-checked { background: #f0fdf4; border-color: #bbf7d0; }
.check-card.is-checked .check-circle { background: #22c55e; border-color: #22c55e; color: white; transform: scale(1.1); }
.check-card.is-checked .check-content { opacity: 0.5; text-decoration: line-through; color: #15803d; }

/* Composants Item */
.check-circle { 
    width: 24px; height: 24px; border: 2px solid var(--neutral-300); border-radius: 50%; margin-right: 1rem; 
    display: flex; align-items: center; justify-content: center; color: transparent; background: white;
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); flex-shrink: 0; font-size: 0.8rem;
}
.check-content { flex: 1; font-size: 0.95rem; color: var(--neutral-700); font-weight: 500; line-height: 1.4; transition: opacity 0.2s; }
.qty-badge { font-weight: 700; color: var(--color-primary); background: var(--color-primary-light); padding: 1px 6px; border-radius: 4px; font-size: 0.8rem; margin-right: 0.25rem; }
`;

// --- LOGIQUE ---
let currentChecklist = null;
let checklistId = null;
const getStorageKey = () => `checklist_progress_${checklistId}`;

document.addEventListener('DOMContentLoaded', async () => {
  const styleEl = document.createElement('style');
  styleEl.innerHTML = viewStyles;
  document.head.appendChild(styleEl);

  const urlParams = new URLSearchParams(window.location.search);
  checklistId = urlParams.get('id');

  if (!checklistId) { window.location.href = '/checklists.html'; return; }
  
  await checkAuth();
  await loadChecklistData();
  
  document.getElementById('reset-trigger-btn').addEventListener('click', openResetModal);
  document.getElementById('confirm-reset-btn').addEventListener('click', confirmReset);
  document.getElementById('logout-btn')?.addEventListener('click', logout);
});

async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if(res.ok) {
            const data = await res.json();
            document.getElementById('user-info').innerHTML = `<div class="user-avatar">${data.user.name[0]}</div><div class="user-details"><strong>${escapeHtml(data.user.name)}</strong><span>${data.user.role === 'admin' ? 'Admin' : 'Tech'}</span></div>`;
            if (data.user.role === 'admin') document.getElementById('admin-link')?.classList.remove('hidden');
        }
    } catch(e){}
}
function logout() { fetch('/api/logout', { method: 'POST' }).then(() => window.location = '/login.html'); }

async function loadChecklistData() {
  try {
    const response = await fetch(`/api/checklists/${checklistId}`);
    if (!response.ok) throw new Error('Erreur chargement');
    
    currentChecklist = await response.json();
    renderPage();
    restoreProgress();
    updateGlobalProgress();
  } catch (error) {
    console.error(error);
    document.getElementById('checklist-title-text').textContent = "Introuvable";
  }
}

function renderPage() {
  document.getElementById('checklist-title-text').textContent = currentChecklist.name;
  document.getElementById('checklist-description').textContent = currentChecklist.description || '';
  
  const badge = document.getElementById('checklist-category-badge');
  if (currentChecklist.category) badge.textContent = currentChecklist.category;

  const eqContainer = document.getElementById('equipment-list');
  if (!currentChecklist.equipment || currentChecklist.equipment.length === 0) {
    eqContainer.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--neutral-400);font-style:italic;background:white;border-radius:8px;">Aucun matériel requis</div>';
  } else {
    eqContainer.innerHTML = currentChecklist.equipment.map((item, index) => `
      <div class="check-card" id="eq-item-${index}" onclick="toggleItem('eq', ${index})">
        <div class="check-circle"><i class="fas fa-check"></i></div>
        <div class="check-content">
            <span class="qty-badge">${item.quantity}x</span> ${escapeHtml(item.equipment_name)}
        </div>
      </div>
    `).join('');
  }

  const taskContainer = document.getElementById('tasks-list');
  if (!currentChecklist.tasks || currentChecklist.tasks.length === 0) {
    taskContainer.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--neutral-400);font-style:italic;background:white;border-radius:8px;">Aucune tâche définie</div>';
  } else {
    taskContainer.innerHTML = currentChecklist.tasks.map((item, index) => `
      <div class="check-card" id="task-item-${index}" onclick="toggleItem('task', ${index})">
        <div class="check-circle"><i class="fas fa-check"></i></div>
        <div class="check-content">${escapeHtml(item.task_name)}</div>
      </div>
    `).join('');
  }
}

window.toggleItem = function(type, index) {
  const item = document.getElementById(`${type}-item-${index}`);
  if(item) {
      item.classList.toggle('is-checked');
      saveProgress();
      updateGlobalProgress();
  }
};

function saveProgress() {
  const state = { eq: [], tasks: [] };
  document.querySelectorAll('#equipment-list .check-card').forEach((el, idx) => {
    if (el.classList.contains('is-checked')) state.eq.push(idx);
  });
  document.querySelectorAll('#tasks-list .check-card').forEach((el, idx) => {
    if (el.classList.contains('is-checked')) state.tasks.push(idx);
  });
  localStorage.setItem(getStorageKey(), JSON.stringify(state));
}

function restoreProgress() {
  const saved = localStorage.getItem(getStorageKey());
  if (!saved) return;
  try {
    const state = JSON.parse(saved);
    if (state.eq) state.eq.forEach(idx => document.getElementById(`eq-item-${idx}`)?.classList.add('is-checked'));
    if (state.tasks) state.tasks.forEach(idx => document.getElementById(`task-item-${idx}`)?.classList.add('is-checked'));
  } catch(e) {}
}

function updateGlobalProgress() {
  const eqTotal = currentChecklist.equipment ? currentChecklist.equipment.length : 0;
  const eqChecked = document.querySelectorAll('#equipment-list .is-checked').length;
  const eqPct = eqTotal === 0 ? 100 : Math.round((eqChecked / eqTotal) * 100);
  
  document.getElementById('eq-count').textContent = `${eqChecked}/${eqTotal}`;
  document.getElementById('eq-progress-fill').style.width = `${eqPct}%`;
  
  const taskTotal = currentChecklist.tasks ? currentChecklist.tasks.length : 0;
  const taskChecked = document.querySelectorAll('#tasks-list .is-checked').length;
  const taskPct = taskTotal === 0 ? 100 : Math.round((taskChecked / taskTotal) * 100);
  
  document.getElementById('task-count').textContent = `${taskChecked}/${taskTotal}`;
  document.getElementById('task-progress-fill').style.width = `${taskPct}%`;

  const totalItems = eqTotal + taskTotal;
  const totalChecked = eqChecked + taskChecked;
  const globalPct = totalItems === 0 ? 0 : Math.round((totalChecked / totalItems) * 100);
  
  const globalEl = document.getElementById('global-progress');
  globalEl.textContent = `${globalPct}%`;
  
  const circle = document.getElementById('progress-ring-circle');
  const radius = circle.r.baseVal.value;
  const circumference = radius * 2 * Math.PI;
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  const offset = circumference - (globalPct / 100) * circumference;
  circle.style.strokeDashoffset = offset;
  
  if(globalPct === 100) {
      globalEl.style.color = 'var(--color-success)';
      circle.style.stroke = 'var(--color-success)';
  } else {
      globalEl.style.color = 'var(--color-primary)';
      circle.style.stroke = 'var(--color-primary)';
  }
}

function openResetModal() { document.getElementById('reset-confirm-modal').classList.add('active'); }
window.closeResetModal = function() { document.getElementById('reset-confirm-modal').classList.remove('active'); }

function confirmReset() {
    document.querySelectorAll('.check-card').forEach(el => el.classList.remove('is-checked'));
    localStorage.removeItem(getStorageKey());
    updateGlobalProgress();
    closeResetModal();
    showNotification('Checklist réinitialisée', 'success');
}

function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) return;
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.innerHTML = `<i class="fas fa-info-circle"></i> <span>${message}</span>`;
  container.appendChild(notif);
  requestAnimationFrame(() => notif.classList.add('show'));
  setTimeout(() => { notif.classList.remove('show'); setTimeout(() => notif.remove(), 300); }, 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}