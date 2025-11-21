let checklists = [];
let currentChecklist = null;
let checklistToDelete = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadChecklists();

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('add-checklist-btn').addEventListener('click', () => openChecklistModal());
  document.getElementById('close-checklist-modal').addEventListener('click', closeChecklistModal);
  document.getElementById('cancel-checklist-btn').addEventListener('click', closeChecklistModal);
  document.getElementById('save-checklist-btn').addEventListener('click', saveChecklist);
  document.getElementById('close-delete-modal').addEventListener('click', closeDeleteModal);
  document.getElementById('cancel-delete-checklist-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('confirm-delete-checklist-btn').addEventListener('click', confirmDelete);

  document.getElementById('checklist-search').addEventListener('input', debounce(filterChecklists, 300));

  // Event listeners sur les boutons d'ajout
  document.getElementById('add-equipment-btn').addEventListener('click', function(e) {
    e.preventDefault();
    addEquipmentItem();
  });
  
  document.getElementById('add-task-btn').addEventListener('click', function(e) {
    e.preventDefault();
    addTaskItem();
  });
  
  // Vérifier si on doit éditer une checklist
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('edit');
  if (editId) {
    setTimeout(() => {
      openChecklistModal(parseInt(editId));
      window.history.replaceState({}, document.title, '/checklists.html');
    }, 300);
  }
});

function closeChecklistModal() {
  document.getElementById('checklist-modal').classList.remove('active');
}

function closeDeleteModal() {
  document.getElementById('delete-checklist-modal').classList.remove('active');
  checklistToDelete = null;
}

async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await response.json();
    currentUser = data.user;
    
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

async function loadChecklists() {
  try {
    const response = await fetch('/api/checklists');
    checklists = await response.json();
    renderChecklists();
  } catch (error) {
    console.error('Erreur chargement checklists:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

function renderChecklists() {
  const grid = document.getElementById('checklists-grid');
  
  if (checklists.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--neutral-500)">
        <i class="fas fa-clipboard-list fa-4x" style="margin-bottom: 20px; opacity: 0.3"></i>
        <h3 style="margin-bottom: 10px; color: var(--neutral-700)">Aucune checklist</h3>
        <p>Créez votre première checklist pour commencer</p>
        <button class="btn btn-primary" onclick="openChecklistModal()" style="margin-top: 20px">
          <i class="fas fa-plus"></i> Créer une checklist
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = checklists.map(checklist => `
    <div class="checklist-card" ondblclick="openChecklistWork(${checklist.id})" style="cursor: pointer;">
      <div class="checklist-card-header">
        <h3>${escapeHtml(checklist.name)}</h3>
        <div class="checklist-card-actions">
          <button class="btn-icon-sm btn-icon-primary" onclick="event.stopPropagation(); openChecklistModal(${checklist.id})" title="Modifier">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon-sm btn-icon-danger" onclick="event.stopPropagation(); openDeleteModal(${checklist.id}, '${escapeHtml(checklist.name).replace(/'/g, "\\'")}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      ${checklist.description ? `
        <p class="checklist-card-description">${escapeHtml(checklist.description)}</p>
      ` : ''}
      
      <div class="checklist-card-stats">
        <div class="checklist-stat">
          <i class="fas fa-toolbox"></i>
          <span>${checklist.equipment_count} équipement${checklist.equipment_count > 1 ? 's' : ''}</span>
        </div>
        <div class="checklist-stat">
          <i class="fas fa-tasks"></i>
          <span>${checklist.tasks_count} tâche${checklist.tasks_count > 1 ? 's' : ''}</span>
        </div>
      </div>
      
      <div class="checklist-card-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <small>
          <i class="fas fa-clock"></i> ${formatDate(checklist.updated_at)}
          ${checklist.updated_by ? `<br/>par <strong>${escapeHtml(checklist.updated_by)}</strong>` : ''}
        </small>
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openChecklistWork(${checklist.id})" style="margin-top: var(--space-2);">
          <i class="fas fa-folder-open"></i> Ouvrir
        </button>
      </div>
    </div>
  `).join('');
}

function openChecklistWork(checklistId) {
  window.location.href = `/checklist-view.html?id=${checklistId}`;
}

async function openChecklistModal(checklistId = null) {
  const modal = document.getElementById('checklist-modal');
  const title = document.getElementById('checklist-modal-title');
  const form = document.getElementById('checklist-form');
  
  form.reset();
  document.getElementById('checklist-id').value = '';
  document.getElementById('equipment-list').innerHTML = '';
  document.getElementById('tasks-list').innerHTML = '';
  currentChecklist = null;

  if (checklistId) {
    title.innerHTML = '<i class="fas fa-edit"></i> Modifier la checklist';
    
    try {
      const response = await fetch(`/api/checklists/${checklistId}`);
      currentChecklist = await response.json();
      
      document.getElementById('checklist-id').value = currentChecklist.id;
      document.getElementById('checklist-name').value = currentChecklist.name;
      document.getElementById('checklist-description').value = currentChecklist.description || '';
      
      // Charger les équipements
      if (currentChecklist.equipment && currentChecklist.equipment.length > 0) {
        currentChecklist.equipment.forEach(eq => {
          addEquipmentItem(eq.equipment_name, eq.quantity);
        });
      }
      
      // Charger les tâches
      if (currentChecklist.tasks && currentChecklist.tasks.length > 0) {
        currentChecklist.tasks.forEach(task => {
          addTaskItem(task.task_name);
        });
      }
      
    } catch (error) {
      console.error('Erreur chargement checklist:', error);
      showNotification('Erreur lors du chargement', 'error');
      return;
    }
  } else {
    title.innerHTML = '<i class="fas fa-plus-circle"></i> Créer une checklist';
  }

  modal.classList.add('active');
  setupDragAndDrop();
}

function addEquipmentItem(name = '', quantity = 1) {
  const list = document.getElementById('equipment-list');
  
  const div = document.createElement('div');
  div.className = 'checklist-item';
  div.innerHTML = `
    <div class="checklist-item-inputs">
      <input type="text" class="equipment-name" placeholder="Nom de l'équipement" value="${escapeHtml(name)}" />
      <input type="number" class="equipment-quantity" placeholder="Qté" value="${quantity}" min="1" style="width: 80px" />
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger remove-item">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  // Event listener sur le bouton de suppression
  div.querySelector('.remove-item').addEventListener('click', function() {
    div.remove();
  });
  
  list.appendChild(div);
}

function addTaskItem(name = '') {
  const list = document.getElementById('tasks-list');
  
  const div = document.createElement('div');
  div.className = 'checklist-item';
  div.draggable = true;
  div.innerHTML = `
    <button type="button" class="btn-icon-sm drag-handle" style="cursor: grab; background: transparent; border: none; color: var(--neutral-500);">
      <i class="fas fa-grip-vertical"></i>
    </button>
    <div class="checklist-item-inputs">
      <input type="text" class="task-name" placeholder="Description de la tâche" value="${escapeHtml(name)}" />
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger remove-item">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  // Event listener sur le bouton de suppression
  div.querySelector('.remove-item').addEventListener('click', function() {
    div.remove();
  });
  
  list.appendChild(div);
  setupDragAndDrop();
}

function setupDragAndDrop() {
  const tasksList = document.getElementById('tasks-list');
  if (!tasksList) return;
  
  const tasks = tasksList.querySelectorAll('.checklist-item[draggable="true"]');
  
  tasks.forEach(task => {
    task.addEventListener('dragstart', handleDragStart);
    task.addEventListener('dragover', handleDragOver);
    task.addEventListener('drop', handleDrop);
    task.addEventListener('dragend', handleDragEnd);
  });
}

let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  const tasksList = document.getElementById('tasks-list');
  const afterElement = getDragAfterElement(tasksList, e.clientY);
  
  if (afterElement == null) {
    tasksList.appendChild(draggedElement);
  } else {
    tasksList.insertBefore(draggedElement, afterElement);
  }
  
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  return false;
}

function handleDragEnd(e) {
  this.style.opacity = '1';
  draggedElement = null;
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.checklist-item[draggable="true"]:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveChecklist() {
  const btn = document.getElementById('save-checklist-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const checklistId = document.getElementById('checklist-id').value;
  const name = document.getElementById('checklist-name').value.trim();
  const description = document.getElementById('checklist-description').value.trim();
  
  if (!name) {
    showNotification('Le nom est requis', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
    return;
  }
  
  // Récupérer les équipements
  const equipmentItems = document.querySelectorAll('#equipment-list .checklist-item');
  const equipment = Array.from(equipmentItems).map(item => {
    const nameInput = item.querySelector('.equipment-name');
    const qtyInput = item.querySelector('.equipment-quantity');
    return {
      equipment_name: nameInput ? nameInput.value.trim() : '',
      quantity: qtyInput ? parseInt(qtyInput.value) || 1 : 1
    };
  }).filter(eq => eq.equipment_name !== '');
  
  // Récupérer les tâches
  const taskItems = document.querySelectorAll('#tasks-list .checklist-item');
  const tasks = Array.from(taskItems).map(item => {
    const nameInput = item.querySelector('.task-name');
    return {
      task_name: nameInput ? nameInput.value.trim() : ''
    };
  }).filter(task => task.task_name !== '');

  const data = { 
    name, 
    description, 
    equipment, 
    tasks,
    updated_by: currentUser ? currentUser.name : null
  };

  try {
    const url = checklistId ? `/api/checklists/${checklistId}` : '/api/checklists';
    const method = checklistId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeChecklistModal();
      loadChecklists();
      showNotification('Checklist enregistrée avec succès', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur inconnue', 'error');
    }
  } catch (error) {
    console.error('Erreur sauvegarde checklist:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function openDeleteModal(checklistId, checklistName) {
  checklistToDelete = checklistId;
  document.getElementById('delete-checklist-name').textContent = checklistName;
  document.getElementById('delete-checklist-modal').classList.add('active');
}

async function confirmDelete() {
  if (!checklistToDelete) return;

  const btn = document.getElementById('confirm-delete-checklist-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suppression...';
  btn.disabled = true;

  try {
    const response = await fetch(`/api/checklists/${checklistToDelete}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      closeDeleteModal();
      loadChecklists();
      showNotification('Checklist supprimée', 'success');
    } else {
      showNotification('Erreur lors de la suppression', 'error');
    }
  } catch (error) {
    console.error('Erreur suppression:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
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

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function filterChecklists() {
  const searchTerm = document.getElementById('checklist-search').value.toLowerCase();
  
  if (!searchTerm) {
    renderChecklists();
    return;
  }
  
  const filtered = checklists.filter(c => 
    c.name.toLowerCase().includes(searchTerm) ||
    (c.description && c.description.toLowerCase().includes(searchTerm))
  );
  
  const grid = document.getElementById('checklists-grid');
  
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--neutral-500)">
        <i class="fas fa-search fa-4x" style="margin-bottom: 20px; opacity: 0.3"></i>
        <h3 style="margin-bottom: 10px; color: var(--neutral-700)">Aucun résultat</h3>
        <p>Aucune checklist ne correspond à votre recherche</p>
      </div>
    `;
    return;
  }
  
  // Réutiliser la logique de renderChecklists mais avec filtered
  grid.innerHTML = filtered.map(checklist => `
    <div class="checklist-card" ondblclick="openChecklistWork(${checklist.id})" style="cursor: pointer;">
      <div class="checklist-card-header">
        <h3>${escapeHtml(checklist.name)}</h3>
        <div class="checklist-card-actions">
          <button class="btn-icon-sm btn-icon-primary" onclick="event.stopPropagation(); openChecklistModal(${checklist.id})" title="Modifier">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon-sm btn-icon-danger" onclick="event.stopPropagation(); openDeleteModal(${checklist.id}, '${escapeHtml(checklist.name).replace(/'/g, "\\'")}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      ${checklist.description ? `
        <p class="checklist-card-description">${escapeHtml(checklist.description)}</p>
      ` : ''}
      
      <div class="checklist-card-stats">
        <div class="checklist-stat">
          <i class="fas fa-toolbox"></i>
          <span>${checklist.equipment_count} équipement${checklist.equipment_count > 1 ? 's' : ''}</span>
        </div>
        <div class="checklist-stat">
          <i class="fas fa-tasks"></i>
          <span>${checklist.tasks_count} tâche${checklist.tasks_count > 1 ? 's' : ''}</span>
        </div>
      </div>
      
      <div class="checklist-card-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <small>
          <i class="fas fa-clock"></i> ${formatDate(checklist.updated_at)}
          ${checklist.updated_by ? `<br/>par <strong>${escapeHtml(checklist.updated_by)}</strong>` : ''}
        </small>
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openChecklistWork(${checklist.id})" style="margin-top: var(--space-2);">
          <i class="fas fa-folder-open"></i> Ouvrir
        </button>
      </div>
    </div>
  `).join('');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Exposer les fonctions globalement
window.openChecklistModal = openChecklistModal;
window.openDeleteModal = openDeleteModal;
window.openChecklistWork = openChecklistWork;