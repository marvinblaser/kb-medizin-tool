/**
 * KB Medizin Technik - Checklist View Logic
 * Version: Admin Link Fixed & Layout
 */

let checklistId = null;
let checklistData = null;
let localState = {
  equipment: {}, 
  tasks: {}
};

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  
  const urlParams = new URLSearchParams(window.location.search);
  checklistId = urlParams.get('id');
  
  if (!checklistId) {
    alert('Erreur : Aucune checklist spécifiée');
    window.location.href = '/checklists.html';
    return;
  }

  loadLocalState();
  await loadChecklistData();

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('reset-btn').addEventListener('click', resetChecklist);
});

async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) throw new Error('Auth failed');
    const data = await response.json();
    
    // FIX: Affichage du lien admin
    if (data.user.role === 'admin') {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.classList.remove('hidden');
    }

    document.getElementById('user-info').innerHTML = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details"><strong>${escapeHtml(data.user.name)}</strong><span>${data.user.role === 'admin' ? 'Administrateur' : 'Technicien'}</span></div>
    `;
  } catch { window.location.href = '/login.html'; }
}

async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login.html'; }

function getStorageKey() { return `kb_checklist_state_${checklistId}`; }

function loadLocalState() {
  const saved = localStorage.getItem(getStorageKey());
  if (saved) {
    try {
      localState = JSON.parse(saved);
      if(!localState.equipment) localState.equipment = {};
      if(!localState.tasks) localState.tasks = {};
    } catch (e) { localState = { equipment: {}, tasks: {} }; }
  }
}

function saveLocalState() {
  localStorage.setItem(getStorageKey(), JSON.stringify(localState));
  updateProgress();
}

function resetChecklist() {
  if(!confirm('Voulez-vous vraiment tout décocher ?')) return;
  localState = { equipment: {}, tasks: {} };
  saveLocalState();
  renderLists();
}

async function loadChecklistData() {
  try {
    const res = await fetch(`/api/checklists/${checklistId}`);
    if (!res.ok) throw new Error('Not found');
    checklistData = await res.json();

    document.getElementById('checklist-title-text').textContent = checklistData.name;
    document.getElementById('checklist-description').textContent = checklistData.description || 'Aucune description';

    renderLists();
  } catch (error) { console.error(error); alert('Impossible de charger la checklist.'); }
}

function renderLists() {
  const eqContainer = document.getElementById('equipment-list');
  if (!checklistData.equipment || checklistData.equipment.length === 0) {
    eqContainer.innerHTML = '<div class="empty-state">Aucun matériel requis</div>';
  } else {
    eqContainer.innerHTML = checklistData.equipment.map((item, index) => {
      const isChecked = localState.equipment[index] === true;
      return createItemHTML('equipment', index, item.equipment_name, item.quantity, isChecked);
    }).join('');
  }

  const taskContainer = document.getElementById('tasks-list');
  if (!checklistData.tasks || checklistData.tasks.length === 0) {
    taskContainer.innerHTML = '<div class="empty-state">Aucune tâche définie</div>';
  } else {
    taskContainer.innerHTML = checklistData.tasks.map((item, index) => {
      const isChecked = localState.tasks[index] === true;
      return createItemHTML('task', index, item.task_name, null, isChecked);
    }).join('');
  }
  updateProgress();
}

function createItemHTML(type, index, text, quantity, isChecked) {
  const uniqueId = `${type}-${index}`;
  const quantityBadge = quantity > 1 ? `<span class="check-badge">Qté: ${quantity}</span>` : '';
  const checkedClass = isChecked ? 'is-checked' : '';

  return `
    <div class="check-item ${checkedClass}" id="item-${uniqueId}" onclick="toggleItem('${type}', ${index})">
      <div class="check-circle"><i class="fas fa-check"></i></div>
      <div class="check-content"><span class="check-text">${escapeHtml(text)}</span>${quantityBadge}</div>
    </div>
  `;
}

window.toggleItem = function(type, index) {
  if (type === 'equipment') localState.equipment[index] = !localState.equipment[index];
  else localState.tasks[index] = !localState.tasks[index];

  saveLocalState();

  const uniqueId = `${type}-${index}`;
  const el = document.getElementById(`item-${uniqueId}`);
  if (el) {
    if ((type === 'equipment' && localState.equipment[index]) || (type === 'task' && localState.tasks[index])) {
      el.classList.add('is-checked');
    } else {
      el.classList.remove('is-checked');
    }
  }
};

function updateProgress() {
  const eqTotal = checklistData.equipment ? checklistData.equipment.length : 0;
  const eqChecked = Object.values(localState.equipment).filter(v => v).length;
  const eqPct = eqTotal > 0 ? Math.round((eqChecked / eqTotal) * 100) : 0;

  document.getElementById('eq-progress-fill').style.width = `${eqPct}%`;
  document.getElementById('eq-count').textContent = `${eqChecked} / ${eqTotal}`;
  document.getElementById('eq-pct').textContent = `${eqPct}%`;

  const taskTotal = checklistData.tasks ? checklistData.tasks.length : 0;
  const taskChecked = Object.values(localState.tasks).filter(v => v).length;
  const taskPct = taskTotal > 0 ? Math.round((taskChecked / taskTotal) * 100) : 0;

  document.getElementById('task-progress-fill').style.width = `${taskPct}%`;
  document.getElementById('task-count').textContent = `${taskChecked} / ${taskTotal}`;
  document.getElementById('task-pct').textContent = `${taskPct}%`;
}

function escapeHtml(text) { if (!text) return ''; return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }