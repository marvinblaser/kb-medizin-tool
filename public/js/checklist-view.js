let checklistId = null;
let checklist = null;
let checklistState = {
  equipment: {},
  tasks: {}
};
let editMode = false;
let draggedElement = null;

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  
  const urlParams = new URLSearchParams(window.location.search);
  checklistId = urlParams.get('id');
  
  if (!checklistId) {
    showNotification('Aucune checklist sélectionnée', 'error');
    setTimeout(() => window.location.href = '/checklists.html', 2000);
    return;
  }
  
  await loadChecklist();
  loadChecklistState();
  
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('reset-btn').addEventListener('click', resetChecklist);
  document.getElementById('edit-toggle-btn').addEventListener('click', toggleEditMode);
});

async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await response.json();
    
    document.getElementById('user-info').innerHTML = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details">
        <strong>${data.user.name}</strong>
        <span>${data.user.role === 'admin' ? 'Administrateur' : 'Technicien'}</span>
      </div>
    `;

    if (data.user.role === 'admin') {
      document.getElementById('admin-link').classList.remove('hidden');
    }
  } catch (error) {
    window.location.href = '/login.html';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

async function loadChecklist() {
  try {
    const response = await fetch(`/api/checklists/${checklistId}`);
    if (!response.ok) {
      throw new Error('Checklist non trouvée');
    }
    
    checklist = await response.json();
    
    document.getElementById('checklist-title').textContent = checklist.name;
    document.getElementById('checklist-description').textContent = checklist.description || 'Aucune description';
    
    if (editMode) {
      renderEditMode();
    } else {
      renderEquipment();
      renderTasks();
      updateProgress();
    }
  } catch (error) {
    console.error('Erreur chargement checklist:', error);
    showNotification('Erreur lors du chargement de la checklist', 'error');
    setTimeout(() => window.location.href = '/checklists.html', 2000);
  }
}

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('edit-toggle-btn');
  const content = document.getElementById('checklist-content');
  
  if (editMode) {
    btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
    btn.classList.remove('btn');
    btn.classList.add('btn-save');
    content.classList.add('edit-mode');
    renderEditMode();
  } else {
    saveChecklist();
  }
}

function renderEditMode() {
  // ========== MATÉRIEL ==========
  renderEditSection('equipment', 'equipment-list', 'Ajouter du matériel', true);
  
  // ========== TÂCHES ==========
  renderEditSection('tasks', 'tasks-list', 'Ajouter une tâche', false);
}

function renderEditSection(type, containerId, addButtonText, withQuantity) {
  const container = document.getElementById(containerId);
  const items = type === 'equipment' ? checklist.equipment : checklist.tasks;
  const nameKey = type === 'equipment' ? 'equipment_name' : 'task_name';
  
  let html = `
    <div class="edit-actions">
      <button class="btn btn-sm btn-primary" data-add-type="${type}">
        <i class="fas fa-plus"></i> ${addButtonText}
      </button>
    </div>
    <div class="edit-list" data-edit-type="${type}">
  `;
  
  if (items && items.length > 0) {
    items.forEach((item, index) => {
      html += createEditItemHTML(type, item[nameKey] || '', item.quantity || 1, index, withQuantity);
    });
  }
  
  html += '</div>';
  container.innerHTML = html;
  
  // Event listener pour ajouter
  container.querySelector(`[data-add-type="${type}"]`).addEventListener('click', function() {
    addEditItem(type, withQuantity);
  });
  
  // Event listeners pour supprimer
  container.querySelectorAll(`[data-remove-type="${type}"]`).forEach(btn => {
    btn.addEventListener('click', function() {
      removeEditItem(type, parseInt(this.dataset.index));
    });
  });
  
  // Activer le drag & drop
  setupDragAndDrop(type);
}

function createEditItemHTML(type, name, quantity, index, withQuantity) {
  return `
    <div class="edit-input-group" data-item-index="${index}" data-item-type="${type}" draggable="true">
      <span class="drag-handle">
        <i class="fas fa-grip-vertical"></i>
      </span>
      <input 
        type="text" 
        class="item-name-input" 
        value="${escapeHtml(name)}" 
        placeholder="${type === 'equipment' ? 'Nom du matériel' : 'Description de la tâche'}" 
      />
      ${withQuantity ? `
        <input 
          type="number" 
          class="item-qty-input" 
          value="${quantity}" 
          min="1" 
          placeholder="Qté" 
          style="width: 80px;" 
        />
      ` : ''}
      <button class="btn-icon-sm btn-icon-danger" data-remove-type="${type}" data-index="${index}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
}

function addEditItem(type, withQuantity) {
  const items = type === 'equipment' ? checklist.equipment : checklist.tasks;
  const nameKey = type === 'equipment' ? 'equipment_name' : 'task_name';
  const container = document.querySelector(`[data-edit-type="${type}"]`);
  
  if (!container) {
    console.error(`❌ Container not found for type: ${type}`);
    return;
  }
  
  const newIndex = items.length;
  
  const newItem = {};
  newItem[nameKey] = '';
  if (withQuantity) newItem.quantity = 1;
  items.push(newItem);
  
  console.log(`➕ Ajout d'un item ${type} à l'index ${newIndex}`);
  
  const itemHTML = createEditItemHTML(type, '', 1, newIndex, withQuantity);
  container.insertAdjacentHTML('beforeend', itemHTML);
  
  const newDiv = container.querySelector(`[data-item-index="${newIndex}"]`);
  if (newDiv) {
    const removeBtn = newDiv.querySelector(`[data-remove-type="${type}"]`);
    if (removeBtn) {
      removeBtn.addEventListener('click', function() {
        removeEditItem(type, newIndex);
      });
    }
  }
  
  // Réactiver le drag & drop
  setupDragAndDrop(type);
  
  console.log(`✅ Item ${type} ajouté avec succès`);
}

function removeEditItem(type, index) {
  const items = type === 'equipment' ? checklist.equipment : checklist.tasks;
  const container = document.querySelector(`[data-edit-type="${type}"]`);
  
  if (!container) {
    console.error(`❌ Container not found for type: ${type}`);
    return;
  }
  
  console.log(`🗑️ Suppression de l'item ${type} à l'index ${index}`);
  
  const divs = container.querySelectorAll(`[data-item-type="${type}"]`);
  if (divs[index]) {
    divs[index].remove();
  }
  
  items.splice(index, 1);
  
  container.querySelectorAll(`[data-item-type="${type}"]`).forEach((div, newIdx) => {
    div.dataset.itemIndex = newIdx;
    const removeBtn = div.querySelector(`[data-remove-type="${type}"]`);
    if (removeBtn) {
      removeBtn.dataset.index = newIdx;
    }
  });
  
  console.log(`✅ Item supprimé, reste ${items.length} items`);
}

// ========== DRAG & DROP ==========
function setupDragAndDrop(type) {
  const container = document.querySelector(`[data-edit-type="${type}"]`);
  if (!container) return;
  
  const items = container.querySelectorAll(`[data-item-type="${type}"]`);
  
  items.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragenter', handleDragEnter);
    item.addEventListener('dragleave', handleDragLeave);
  });
}

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  
  // Enlever tous les drag-over
  document.querySelectorAll('.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
  
  draggedElement = null;
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  if (this !== draggedElement) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  if (draggedElement !== this && draggedElement) {
    const type = this.dataset.itemType;
    const container = this.closest(`[data-edit-type="${type}"]`);
    
    // Réorganiser dans le DOM
    const allItems = Array.from(container.querySelectorAll(`[data-item-type="${type}"]`));
    const draggedIndex = allItems.indexOf(draggedElement);
    const targetIndex = allItems.indexOf(this);
    
    if (draggedIndex < targetIndex) {
      this.parentNode.insertBefore(draggedElement, this.nextSibling);
    } else {
      this.parentNode.insertBefore(draggedElement, this);
    }
    
    // Réorganiser dans le modèle
    const items = type === 'equipment' ? checklist.equipment : checklist.tasks;
    const movedItem = items.splice(draggedIndex, 1)[0];
    const newTargetIndex = draggedIndex < targetIndex ? targetIndex : targetIndex;
    items.splice(newTargetIndex, 0, movedItem);
    
    // Réindexer
    reindexItems(type);
    
    console.log(`🔄 Déplacement de l'index ${draggedIndex} vers ${newTargetIndex}`);
  }
  
  return false;
}

function reindexItems(type) {
  const container = document.querySelector(`[data-edit-type="${type}"]`);
  container.querySelectorAll(`[data-item-type="${type}"]`).forEach((div, newIdx) => {
    div.dataset.itemIndex = newIdx;
    const removeBtn = div.querySelector(`[data-remove-type="${type}"]`);
    if (removeBtn) {
      removeBtn.dataset.index = newIdx;
    }
  });
}

async function saveChecklist() {
  console.log('🔍 Début de la sauvegarde...');
  
  // ========== COLLECTER LES ÉQUIPEMENTS (dans l'ordre du DOM) ==========
  const equipmentContainer = document.querySelector('[data-edit-type="equipment"]');
  const equipmentDivs = equipmentContainer ? equipmentContainer.querySelectorAll('[data-item-type="equipment"]') : [];
  
  console.log(`📦 Équipements trouvés: ${equipmentDivs.length}`);
  
  const newEquipment = Array.from(equipmentDivs).map((div, index) => {
    const nameInput = div.querySelector('.item-name-input');
    const qtyInput = div.querySelector('.item-qty-input');
    
    const eq = {
      equipment_name: nameInput ? nameInput.value.trim() : '',
      quantity: qtyInput ? parseInt(qtyInput.value) || 1 : 1
    };
    
    console.log(`  Équipement ${index}:`, eq);
    return eq;
  }).filter(eq => eq.equipment_name !== '');
  
  console.log(`✅ Équipements valides: ${newEquipment.length}`);
  
  // ========== COLLECTER LES TÂCHES (dans l'ordre du DOM) ==========
  const tasksContainer = document.querySelector('[data-edit-type="tasks"]');
  const tasksDivs = tasksContainer ? tasksContainer.querySelectorAll('[data-item-type="tasks"]') : [];
  
  console.log(`📋 Tâches trouvées: ${tasksDivs.length}`);
  
  const newTasks = Array.from(tasksDivs).map((div, index) => {
    const nameInput = div.querySelector('.item-name-input');
    
    const task = {
      task_name: nameInput ? nameInput.value.trim() : ''
    };
    
    console.log(`  Tâche ${index}:`, task);
    return task;
  }).filter(task => task.task_name !== '');
  
  console.log(`✅ Tâches valides: ${newTasks.length}`);
  
  try {
    const payload = {
      name: checklist.name,
      description: checklist.description,
      equipment: newEquipment,
      tasks: newTasks
    };
    
    console.log('📤 Envoi au serveur:', payload);
    
    const response = await fetch(`/api/checklists/${checklistId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      showNotification('Checklist enregistrée avec succès', 'success');
      
      editMode = false;
      const btn = document.getElementById('edit-toggle-btn');
      btn.innerHTML = '<i class="fas fa-edit"></i> Modifier';
      btn.classList.remove('btn-save');
      btn.classList.add('btn');
      document.getElementById('checklist-content').classList.remove('edit-mode');
      
      await loadChecklist();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur lors de l\'enregistrement', 'error');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
    showNotification('Erreur de connexion', 'error');
  }
}

function renderEquipment() {
  const container = document.getElementById('equipment-list');
  
  if (!checklist.equipment || checklist.equipment.length === 0) {
    container.innerHTML = `
      <div class="checklist-empty">
        <i class="fas fa-box-open"></i>
        <p>Aucun matériel requis</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = checklist.equipment.map((eq, index) => {
    const itemId = `eq-${eq.id || index}`;
    const isChecked = checklistState.equipment[itemId] || false;
    
    return `
      <div class="checklist-item ${isChecked ? 'checked' : ''}" onclick="toggleEquipment('${itemId}')">
        <input 
          type="checkbox" 
          id="${itemId}" 
          ${isChecked ? 'checked' : ''}
          onclick="event.stopPropagation()"
          onchange="toggleEquipment('${itemId}')"
        />
        <div class="checklist-item-content">
          <span class="checklist-item-text">${escapeHtml(eq.equipment_name)}</span>
          <span class="checklist-item-badge">Qté: ${eq.quantity}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderTasks() {
  const container = document.getElementById('tasks-list');
  
  if (!checklist.tasks || checklist.tasks.length === 0) {
    container.innerHTML = `
      <div class="checklist-empty">
        <i class="fas fa-check-circle"></i>
        <p>Aucune tâche définie</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = checklist.tasks.map((task, index) => {
    const itemId = `task-${task.id || index}`;
    const isChecked = checklistState.tasks[itemId] || false;
    
    return `
      <div class="checklist-item ${isChecked ? 'checked' : ''}" onclick="toggleTask('${itemId}')">
        <input 
          type="checkbox" 
          id="${itemId}" 
          ${isChecked ? 'checked' : ''}
          onclick="event.stopPropagation()"
          onchange="toggleTask('${itemId}')"
        />
        <div class="checklist-item-content">
          <span class="checklist-item-text">${escapeHtml(task.task_name)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function toggleEquipment(itemId) {
  checklistState.equipment[itemId] = !checklistState.equipment[itemId];
  saveChecklistState();
  renderEquipment();
  updateProgress();
}

function toggleTask(itemId) {
  checklistState.tasks[itemId] = !checklistState.tasks[itemId];
  saveChecklistState();
  renderTasks();
  updateProgress();
}

function updateProgress() {
  const equipmentTotal = checklist.equipment ? checklist.equipment.length : 0;
  const equipmentChecked = Object.values(checklistState.equipment).filter(v => v).length;
  const equipmentPercent = equipmentTotal > 0 ? Math.round((equipmentChecked / equipmentTotal) * 100) : 0;
  
  document.getElementById('equipment-progress-fill').style.width = `${equipmentPercent}%`;
  document.getElementById('equipment-progress-text').textContent = `${equipmentPercent}%`;
  document.getElementById('equipment-count-text').textContent = `${equipmentChecked} / ${equipmentTotal} complété`;
  
  const tasksTotal = checklist.tasks ? checklist.tasks.length : 0;
  const tasksChecked = Object.values(checklistState.tasks).filter(v => v).length;
  const tasksPercent = tasksTotal > 0 ? Math.round((tasksChecked / tasksTotal) * 100) : 0;
  
  document.getElementById('tasks-progress-fill').style.width = `${tasksPercent}%`;
  document.getElementById('tasks-progress-text').textContent = `${tasksPercent}%`;
  document.getElementById('tasks-count-text').textContent = `${tasksChecked} / ${tasksTotal} complété`;
}

// Charger l'état depuis localStorage
function loadChecklistState() {
  const stateKey = `checklist-state-${checklistId}`;
  const savedState = localStorage.getItem(stateKey);
  
  if (savedState) {
    try {
      checklistState = JSON.parse(savedState);
    } catch (error) {
      console.error('Erreur chargement état:', error);
      checklistState = { equipment: {}, tasks: {} };
    }
  } else {
    checklistState = { equipment: {}, tasks: {} };
  }
}

// Sauvegarder l'état dans localStorage
function saveChecklistState() {
  const stateKey = `checklist-state-${checklistId}`;
  localStorage.setItem(stateKey, JSON.stringify(checklistState));
}

function resetChecklist() {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser toutes les cases cochées ?')) {
    return;
  }
  
  checklistState = { equipment: {}, tasks: {} };
  saveChecklistState();
  
  renderEquipment();
  renderTasks();
  updateProgress();
  
  showNotification('Checklist réinitialisée', 'success');
}

function showNotification(message, type = 'info') {
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  notification.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <span>${message}</span>
  `;

  container.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.toggleEquipment = toggleEquipment;
window.toggleTask = toggleTask;