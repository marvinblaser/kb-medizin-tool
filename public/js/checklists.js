// public/js/checklists.js

// --- VARIABLES GLOBALES ---
let checklists = [];
let currentChecklist = null;
let checklistToDelete = null;
let currentUser = null;
let currentTab = 'all'; // Onglet actif par défaut

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadChecklists();

  // Listeners globaux
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Bouton "Nouveau"
  const addBtn = document.getElementById('add-checklist-btn');
  if (addBtn) addBtn.addEventListener('click', () => openChecklistModal());

  // Modale Création / Édition
  document.getElementById('close-checklist-modal').addEventListener('click', closeChecklistModal);
  document.getElementById('cancel-checklist-btn').addEventListener('click', closeChecklistModal);
  document.getElementById('save-checklist-btn').addEventListener('click', saveChecklist);

  // Modale Suppression
  document.getElementById('close-delete-modal').addEventListener('click', closeDeleteModal);
  document.getElementById('cancel-delete-checklist-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('confirm-delete-checklist-btn').addEventListener('click', confirmDelete);

  // Ajout dynamique d'items dans le formulaire
  document.getElementById('add-equipment-btn').addEventListener('click', (e) => { 
    e.preventDefault(); 
    addEquipmentItem(); 
  });
  
  document.getElementById('add-task-btn').addEventListener('click', (e) => { 
    e.preventDefault(); 
    addTaskItem(); 
  });

  // Recherche (Filtrage)
  const searchInput = document.getElementById('checklist-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(filterChecklists, 300));
  }

  // Vérifier s'il faut ouvrir une checklist via URL (ex: ?edit=12)
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('edit');
  if (editId) {
    setTimeout(() => {
      openChecklistModal(parseInt(editId));
      // Nettoyer l'URL
      window.history.replaceState({}, document.title, '/checklists.html');
    }, 300);
  }
});

// --- AUTHENTIFICATION ---
async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) { window.location.href = '/login.html'; return; }
    
    const data = await response.json();
    currentUser = data.user;
    
    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
      userInfoEl.innerHTML = `
        <div class="user-avatar">${data.user.name.charAt(0)}</div>
        <div class="user-details">
          <strong>${data.user.name}</strong>
          <span>${data.user.role === 'admin' ? 'Administrateur' : 'Technicien'}</span>
        </div>
      `;
    }
    
    if (data.user.role === 'admin') {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.classList.remove('hidden');
    }
  } catch (error) { 
    console.error('Auth error:', error);
    window.location.href = '/login.html'; 
  }
}

async function logout() { 
  try {
    await fetch('/api/logout', { method: 'POST' }); 
    window.location.href = '/login.html'; 
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// --- GESTION DES ONGLETS (TABS) ---
function switchTab(category) {
  currentTab = category;
  
  // Mettre à jour l'état visuel des boutons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    // On vérifie si l'attribut onclick du bouton contient la catégorie sélectionnée
    if(btn.getAttribute('onclick').includes(`'${category}'`)) {
      btn.classList.add('active');
    }
  });

  // Relancer le filtrage
  filterChecklists();
}

function updateTabCounts() {
  const categories = ['Maintenance', 'Installation', 'Dépannage', 'Audit', 'Autre'];
  
  // Mise à jour du compteur "Tous"
  const countAll = document.getElementById('count-all');
  if(countAll) countAll.textContent = checklists.length;

  // Mise à jour des compteurs par catégorie
  categories.forEach(cat => {
    const count = checklists.filter(c => c.category === cat).length;
    const el = document.getElementById(`count-${cat}`);
    if(el) el.textContent = count;
  });
}

// --- CHARGEMENT DES DONNÉES ---
async function loadChecklists() {
  try {
    const response = await fetch('/api/checklists');
    if (!response.ok) throw new Error('Erreur réseau');
    
    checklists = await response.json();
    
    // Une fois chargé, on met à jour les badges et on affiche
    updateTabCounts();
    filterChecklists();
  } catch (error) {
    console.error('Erreur chargement:', error);
    showNotification('Impossible de charger les checklists', 'error');
    
    const grid = document.getElementById('checklists-grid');
    if(grid) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--error-500)">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <p>Erreur de connexion au serveur.</p>
            </div>`;
    }
  }
}

// --- FILTRAGE ET RENDU ---
function filterChecklists() {
  const searchInput = document.getElementById('checklist-search');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  
  const filtered = checklists.filter(c => {
    // 1. Filtre Recherche Texte
    const matchesSearch = c.name.toLowerCase().includes(searchTerm) || 
                          (c.description && c.description.toLowerCase().includes(searchTerm));
    
    // 2. Filtre Onglet (Catégorie)
    const matchesTab = currentTab === 'all' ? true : (c.category === currentTab);
    
    return matchesSearch && matchesTab;
  });
  
  renderChecklists(filtered);
}

function renderChecklists(listToRender) {
  const grid = document.getElementById('checklists-grid');
  if (!grid) return;

  if (listToRender.length === 0) {
    let emptyMessage = 'Créez votre première checklist en cliquant sur "Nouveau".';
    if (currentTab !== 'all') emptyMessage = `Aucune checklist dans la catégorie <strong>${currentTab}</strong>.`;
    if (document.getElementById('checklist-search').value) emptyMessage = 'Aucun résultat pour votre recherche.';

    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--neutral-500)">
        <i class="fas fa-folder-open fa-4x" style="margin-bottom: 20px; opacity: 0.3"></i>
        <h3>Liste vide</h3>
        <p>${emptyMessage}</p>
      </div>`;
    return;
  }

  grid.innerHTML = listToRender.map(checklist => `
    <div class="checklist-card" ondblclick="openChecklistWork(${checklist.id})" style="cursor: pointer;">
      <div class="checklist-card-header">
        <div style="display:flex; flex-direction:column; gap:5px;">
           <span class="badge badge-neutral" style="width:fit-content; font-size:10px;">
             ${checklist.category ? checklist.category.toUpperCase() : 'AUTRE'}
           </span>
           <h3>${escapeHtml(checklist.name)}</h3>
        </div>
        <div class="checklist-card-actions">
          <button class="btn-icon-sm btn-icon-secondary" onclick="event.stopPropagation(); duplicateChecklist(${checklist.id})" title="Dupliquer">
            <i class="fas fa-copy"></i>
          </button>
          <button class="btn-icon-sm btn-icon-primary" onclick="event.stopPropagation(); openChecklistModal(${checklist.id})" title="Modifier">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon-sm btn-icon-danger" onclick="event.stopPropagation(); openDeleteModal(${checklist.id}, '${escapeHtml(checklist.name).replace(/'/g, "\\'")}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      ${checklist.description ? `<p class="checklist-card-description">${escapeHtml(checklist.description)}</p>` : ''}
      
      <div class="checklist-card-stats">
        <div class="checklist-stat">
            <i class="fas fa-toolbox"></i><span>${checklist.equipment_count || 0} équipement(s)</span>
        </div>
        <div class="checklist-stat">
            <i class="fas fa-tasks"></i><span>${checklist.tasks_count || 0} tâche(s)</span>
        </div>
      </div>
      
      <div class="checklist-card-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <small><i class="fas fa-clock"></i> ${formatDate(checklist.updated_at)}</small>
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openChecklistWork(${checklist.id})">
          <i class="fas fa-folder-open"></i> Ouvrir
        </button>
      </div>
    </div>
  `).join('');
}

// --- NAVIGATION ---
function openChecklistWork(id) {
  window.location.href = `/checklist-view.html?id=${id}`;
}

// --- MODALES & FORMULAIRES ---
async function openChecklistModal(checklistId = null) {
  const modal = document.getElementById('checklist-modal');
  const title = document.getElementById('checklist-modal-title');
  const form = document.getElementById('checklist-form');
  
  // Reset complet du formulaire
  form.reset();
  document.getElementById('checklist-id').value = '';
  document.getElementById('equipment-list').innerHTML = '';
  document.getElementById('tasks-list').innerHTML = '';
  
  // Valeur par défaut catégorie
  const catSelect = document.getElementById('checklist-category');
  if(catSelect) catSelect.value = 'Autre';

  if (checklistId) {
    // MODE MODIFICATION
    title.innerHTML = '<i class="fas fa-edit"></i> Modifier la checklist';
    try {
      const response = await fetch(`/api/checklists/${checklistId}`);
      if (!response.ok) throw new Error('Checklist introuvable');
      
      currentChecklist = await response.json();
      
      // Remplissage des champs
      document.getElementById('checklist-id').value = currentChecklist.id;
      document.getElementById('checklist-name').value = currentChecklist.name;
      document.getElementById('checklist-description').value = currentChecklist.description || '';
      if(catSelect && currentChecklist.category) {
        catSelect.value = currentChecklist.category;
      }
      
      // Remplissage listes
      if (currentChecklist.equipment) {
        currentChecklist.equipment.forEach(eq => addEquipmentItem(eq.equipment_name, eq.quantity));
      }
      if (currentChecklist.tasks) {
        currentChecklist.tasks.forEach(task => addTaskItem(task.task_name));
      }
    } catch (error) { 
      console.error(error); 
      showNotification('Erreur chargement des données', 'error'); 
      return; 
    }
  } else {
    // MODE CRÉATION
    // Si le titre contient "Dupliquer", on le laisse, sinon on met "Créer"
    if(!title.innerHTML.includes('Dupliquer')) {
      title.innerHTML = '<i class="fas fa-plus-circle"></i> Créer une checklist';
    }
  }
  
  modal.classList.add('active');
  setupDragAndDrop(); // Initialiser le drag & drop
}

function closeChecklistModal() {
  document.getElementById('checklist-modal').classList.remove('active');
  currentChecklist = null;
}

// --- DUPLICATION ---
async function duplicateChecklist(checklistId) {
  try {
    const response = await fetch(`/api/checklists/${checklistId}`);
    if(!response.ok) throw new Error("Erreur fetch");
    const source = await response.json();

    // 1. Ouvrir modale (reset)
    openChecklistModal(); 
    
    // 2. Modifier visuellement pour indiquer la copie
    document.getElementById('checklist-modal-title').innerHTML = '<i class="fas fa-copy"></i> Dupliquer la checklist';
    document.getElementById('checklist-name').value = source.name + ' - Copie';
    document.getElementById('checklist-description').value = source.description || '';
    
    const catSelect = document.getElementById('checklist-category');
    if(catSelect && source.category) catSelect.value = source.category;

    // 3. Remplir les items
    document.getElementById('equipment-list').innerHTML = '';
    document.getElementById('tasks-list').innerHTML = '';

    if (source.equipment) source.equipment.forEach(eq => addEquipmentItem(eq.equipment_name, eq.quantity));
    if (source.tasks) source.tasks.forEach(task => addTaskItem(task.task_name));

    showNotification('Données dupliquées. Vérifiez avant d\'enregistrer.', 'info');
  } catch (e) {
    console.error(e);
    showNotification('Impossible de dupliquer', 'error');
  }
}

// --- GESTION DES ITEMS (DOM) ---
function addEquipmentItem(name = '', quantity = 1) {
  const list = document.getElementById('equipment-list');
  const div = document.createElement('div');
  div.className = 'checklist-item';
  div.innerHTML = `
    <div class="checklist-item-inputs">
      <input type="text" class="equipment-name" placeholder="Nom équipement" value="${escapeHtml(name)}"/>
      <input type="number" class="equipment-quantity" value="${quantity}" min="1" style="width:80px" placeholder="Qté"/>
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger remove-item">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  div.querySelector('.remove-item').addEventListener('click', () => div.remove());
  list.appendChild(div);
}

function addTaskItem(name = '') {
  const list = document.getElementById('tasks-list');
  const div = document.createElement('div');
  div.className = 'checklist-item';
  div.draggable = true; // IMPORTANT pour le drag & drop
  
  div.innerHTML = `
    <button type="button" class="btn-icon-sm drag-handle" style="cursor:grab; color:var(--neutral-400)">
      <i class="fas fa-grip-vertical"></i>
    </button>
    <div class="checklist-item-inputs">
      <input type="text" class="task-name" placeholder="Description de la tâche" value="${escapeHtml(name)}"/>
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger remove-item">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  div.querySelector('.remove-item').addEventListener('click', () => div.remove());
  list.appendChild(div);
  
  // Ré-appliquer les listeners de drag & drop à cause du nouvel élément
  setupDragAndDrop();
}

// --- DRAG & DROP SYSTEM ---
function setupDragAndDrop() {
  const list = document.getElementById('tasks-list');
  if(!list) return;

  const draggables = list.querySelectorAll('.checklist-item');

  // Nettoyage sommaire (pour éviter accumulation de listeners si fonction appelée souvent)
  // Dans une app vanilla simple, écraser n'est pas critique, mais c'est mieux d'être propre.
  // Ici on ré-attache simplement.
  
  draggables.forEach(draggable => {
    draggable.addEventListener('dragstart', () => {
      draggable.classList.add('dragging');
    });

    draggable.addEventListener('dragend', () => {
      draggable.classList.remove('dragging');
    });
  });

  list.addEventListener('dragover', e => {
    e.preventDefault(); // Nécessaire pour autoriser le drop
    const afterElement = getDragAfterElement(list, e.clientY);
    const draggable = document.querySelector('.dragging');
    
    if (draggable) {
      if (afterElement == null) {
        list.appendChild(draggable);
      } else {
        list.insertBefore(draggable, afterElement);
      }
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.checklist-item:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    // On cherche l'élément dont le centre est juste après le curseur (offset négatif le plus proche de 0)
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- SAUVEGARDE ---
async function saveChecklist() {
  const btn = document.getElementById('save-checklist-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const checklistId = document.getElementById('checklist-id').value;
  const catSelect = document.getElementById('checklist-category');

  // Collecte des données
  const data = { 
    name: document.getElementById('checklist-name').value.trim(), 
    description: document.getElementById('checklist-description').value.trim(),
    category: catSelect ? catSelect.value : 'Autre',
    updated_by: currentUser ? currentUser.name : null,
    
    equipment: Array.from(document.querySelectorAll('#equipment-list .checklist-item')).map(item => ({
      equipment_name: item.querySelector('.equipment-name').value.trim(),
      quantity: parseInt(item.querySelector('.equipment-quantity').value) || 1
    })).filter(e => e.equipment_name),
    
    tasks: Array.from(document.querySelectorAll('#tasks-list .checklist-item')).map(item => ({
      task_name: item.querySelector('.task-name').value.trim()
    })).filter(t => t.task_name)
  };

  if (!data.name) { 
    showNotification('Le nom est requis', 'error'); 
    btn.innerHTML = originalText; 
    btn.disabled = false; 
    return; 
  }

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
      await loadChecklists(); // Recharge tout pour mettre à jour les compteurs
      showNotification('Checklist enregistrée avec succès', 'success');
    } else {
      const err = await response.json();
      showNotification(err.error || 'Erreur serveur', 'error');
    }
  } catch (error) { 
    showNotification('Erreur de connexion', 'error'); 
  } finally { 
    btn.innerHTML = originalText; 
    btn.disabled = false; 
  }
}

// --- SUPPRESSION ---
function openDeleteModal(id, name) {
  checklistToDelete = id;
  const nameSpan = document.getElementById('delete-checklist-name');
  if(nameSpan) nameSpan.textContent = name;
  document.getElementById('delete-checklist-modal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('delete-checklist-modal').classList.remove('active');
  checklistToDelete = null;
}

async function confirmDelete() {
  if (!checklistToDelete) return;

  const btn = document.getElementById('confirm-delete-checklist-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  btn.disabled = true;

  try {
    const response = await fetch(`/api/checklists/${checklistToDelete}`, { method: 'DELETE' });
    if (response.ok) {
      showNotification('Checklist supprimée', 'success');
      loadChecklists();
      closeDeleteModal();
    } else {
      showNotification('Erreur lors de la suppression', 'error');
    }
  } catch (error) {
    showNotification('Erreur connexion', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// --- UTILITAIRES ---
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) return;

  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(notif);
  
  requestAnimationFrame(() => {
    notif.style.opacity = '1';
    notif.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transform = 'translateY(20px)';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function formatDate(d) {
  if(!d) return '-';
  return new Date(d).toLocaleDateString('fr-CH', {
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Exposition globale pour les onclick inline du HTML
window.openChecklistModal = openChecklistModal;
window.openDeleteModal = openDeleteModal;
window.openChecklistWork = openChecklistWork;
window.duplicateChecklist = duplicateChecklist;
window.switchTab = switchTab;