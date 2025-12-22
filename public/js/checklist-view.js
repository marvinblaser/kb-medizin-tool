// public/js/checklist-view.js

let currentChecklist = null;
let checklistId = null;

// Clé de stockage local : "checklist_progress_ID"
const getStorageKey = () => `checklist_progress_${checklistId}`;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  checklistId = urlParams.get('id');

  if (!checklistId) {
    window.location.href = '/checklists.html';
    return;
  }

  await loadChecklistData();
  
  document.getElementById('reset-btn').addEventListener('click', resetProgress);
});

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
    document.getElementById('checklist-title-text').textContent = "Erreur de chargement";
  }
}

function renderPage() {
  document.getElementById('checklist-title-text').textContent = currentChecklist.name;
  document.getElementById('checklist-description').textContent = currentChecklist.description || '';
  
  if (currentChecklist.category) {
    const badge = document.getElementById('checklist-category-badge');
    badge.textContent = currentChecklist.category;
    badge.style.display = 'inline-block';
  }

  // Rendu Matériel
  const eqContainer = document.getElementById('equipment-list');
  if (!currentChecklist.equipment || currentChecklist.equipment.length === 0) {
    eqContainer.innerHTML = '<div style="padding:20px; color:#888;">Aucun matériel requis</div>';
  } else {
    eqContainer.innerHTML = currentChecklist.equipment.map((item, index) => `
      <div class="checklist-row" id="eq-row-${index}">
        <input type="checkbox" id="eq-${index}" onchange="toggleItem('eq', ${index})">
        <label for="eq-${index}" class="checkbox-label">
          <div class="checkbox-custom"></div>
          <div class="item-text">
            <strong>${item.quantity}x</strong> ${escapeHtml(item.equipment_name)}
          </div>
        </label>
      </div>
    `).join('');
  }

  // Rendu Tâches
  const taskContainer = document.getElementById('tasks-list');
  if (!currentChecklist.tasks || currentChecklist.tasks.length === 0) {
    taskContainer.innerHTML = '<div style="padding:20px; color:#888;">Aucune tâche définie</div>';
  } else {
    taskContainer.innerHTML = currentChecklist.tasks.map((item, index) => `
      <div class="checklist-row" id="task-row-${index}">
        <input type="checkbox" id="task-${index}" onchange="toggleItem('task', ${index})">
        <label for="task-${index}" class="checkbox-label">
          <div class="checkbox-custom"></div>
          <div class="item-text">${escapeHtml(item.task_name)}</div>
        </label>
      </div>
    `).join('');
  }
}

function toggleItem(type, index) {
  const row = document.getElementById(`${type}-row-${index}`);
  const checkbox = document.getElementById(`${type}-${index}`);
  
  if (checkbox.checked) row.classList.add('checked');
  else row.classList.remove('checked');

  saveProgress();
  updateGlobalProgress();
}

function saveProgress() {
  const state = {
    eq: [],
    tasks: []
  };
  
  // Sauvegarde des index cochés
  document.querySelectorAll('#equipment-list input[type="checkbox"]').forEach((cb, idx) => {
    if (cb.checked) state.eq.push(idx);
  });
  
  document.querySelectorAll('#tasks-list input[type="checkbox"]').forEach((cb, idx) => {
    if (cb.checked) state.tasks.push(idx);
  });

  localStorage.setItem(getStorageKey(), JSON.stringify(state));
}

function restoreProgress() {
  const saved = localStorage.getItem(getStorageKey());
  if (!saved) return;
  
  const state = JSON.parse(saved);
  
  if (state.eq) {
    state.eq.forEach(idx => {
      const cb = document.getElementById(`eq-${idx}`);
      if (cb) { cb.checked = true; toggleItem('eq', idx); }
    });
  }
  
  if (state.tasks) {
    state.tasks.forEach(idx => {
      const cb = document.getElementById(`task-${idx}`);
      if (cb) { cb.checked = true; toggleItem('task', idx); }
    });
  }
}

function updateGlobalProgress() {
  // Calcul EQ
  const eqTotal = currentChecklist.equipment ? currentChecklist.equipment.length : 0;
  const eqChecked = document.querySelectorAll('#equipment-list input:checked').length;
  const eqPct = eqTotal === 0 ? 100 : Math.round((eqChecked / eqTotal) * 100);
  
  document.getElementById('eq-count').textContent = `${eqChecked} / ${eqTotal}`;
  document.getElementById('eq-progress-fill').style.width = `${eqPct}%`;
  
  // Calcul Tasks
  const taskTotal = currentChecklist.tasks ? currentChecklist.tasks.length : 0;
  const taskChecked = document.querySelectorAll('#tasks-list input:checked').length;
  const taskPct = taskTotal === 0 ? 100 : Math.round((taskChecked / taskTotal) * 100);
  
  document.getElementById('task-count').textContent = `${taskChecked} / ${taskTotal}`;
  document.getElementById('task-progress-fill').style.width = `${taskPct}%`;

  // Global
  const totalItems = eqTotal + taskTotal;
  const totalChecked = eqChecked + taskChecked;
  const globalPct = totalItems === 0 ? 100 : Math.round((totalChecked / totalItems) * 100);
  
  document.getElementById('global-progress').textContent = `${globalPct}%`;
  document.getElementById('global-progress').style.color = globalPct === 100 ? 'var(--success-600)' : 'var(--neutral-600)';
}

function resetProgress() {
  if (!confirm('Voulez-vous vraiment décocher toutes les cases ?')) return;
  
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.dispatchEvent(new Event('change')); // Déclenche toggleItem
  });
  
  localStorage.removeItem(getStorageKey());
  updateGlobalProgress();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Exposer pour usage inline
window.toggleItem = toggleItem;