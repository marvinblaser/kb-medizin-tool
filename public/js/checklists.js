// public/js/checklists.js

// ... (Styles CSS et Variables globales identiques) ...
// Pour gagner de la place, je ne recolle pas le CSS ici car il n'a pas changé.
// Assurez-vous de garder la constante `checklistStyles` du début du fichier original.

// --- INJECTION CSS (STYLE TOOLBAR + CARTE PROPRE) ---
const checklistStyles = `
/* Conteneur */
.checklist-container-fluid { width: 100%; max-width: 100%; box-sizing: border-box; }

/* BARRE D'OUTILS (Style "Une seule ligne") */
.toolbar-card {
    background: white;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    height: 64px; /* Hauteur fixe élégante */
    margin-bottom: 2rem;
    gap: 1.5rem;
}

/* Zone Recherche (Sans bordure, fondue dans la barre) */
.toolbar-search {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--neutral-400);
    flex: 0 0 300px; /* Largeur fixe pour la recherche */
}
.toolbar-search input {
    border: none;
    background: transparent;
    width: 100%;
    font-size: 0.95rem;
    color: var(--neutral-900);
    padding: 0;
    box-shadow: none !important;
    outline: none;
}
.toolbar-search i { font-size: 1.1rem; }

/* Séparateur vertical */
.toolbar-divider {
    width: 1px;
    height: 32px;
    background-color: var(--border-color-light);
}

/* Zone Onglets (Navigation horizontale) */
.toolbar-tabs {
    flex: 1;
    display: flex;
    gap: 2rem;
    height: 100%;
    overflow: hidden;
    align-items: center;
}

.nav-tab {
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    padding: 0;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--neutral-500);
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -1px; /* Chevauchement bordure */
}

.nav-tab:hover { color: var(--color-primary); }

.nav-tab.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
    font-weight: 600;
}

/* Compteur (Badge) */
.nav-count {
    font-size: 0.75rem;
    background: var(--neutral-100);
    color: var(--neutral-600);
    padding: 1px 8px;
    border-radius: 12px;
    font-weight: 600;
}
.nav-tab.active .nav-count {
    background: var(--color-primary-light);
    color: var(--color-primary);
}

/* --- CARTE CHECKLIST (Design "Clean") --- */
.checklists-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
    width: 100%;
}

.checklist-card-clean {
    background: white;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    cursor: pointer;
    position: relative;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: var(--shadow-sm);
    min-height: 180px;
}

.checklist-card-clean:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
    border-color: var(--color-primary-light);
}

/* Header de la carte */
.clean-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.card-cat {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--neutral-500);
}

/* Actions flottantes (apparaissent au survol) */
.card-actions-floating {
    display: flex;
    gap: 0.5rem;
    opacity: 0; /* Caché par défaut */
    transition: opacity 0.2s;
}
.checklist-card-clean:hover .card-actions-floating { opacity: 1; }

.clean-card-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--neutral-900);
    margin: 0;
    line-height: 1.3;
}

.clean-card-desc {
    font-size: 0.9rem;
    color: var(--neutral-500);
    line-height: 1.5;
    flex: 1; /* Pousse le footer vers le bas */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* Footer Stats */
.clean-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 1rem;
    border-top: 1px solid var(--neutral-50);
    margin-top: auto;
}

.card-stats-row {
    display: flex;
    gap: 1rem;
}

.stat-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--neutral-600);
    font-weight: 500;
}
.stat-chip i { color: var(--color-primary); opacity: 0.8; font-size: 0.9rem; }

.card-date {
    font-size: 0.75rem;
    color: var(--neutral-400);
}

/* Modale Items */
.checklist-items-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 300px; overflow-y: auto; padding-right: 5px; }
.checklist-item { 
    display: flex; align-items: center; gap: 0.5rem; 
    background: var(--neutral-50); padding: 0.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);
    transition: background 0.2s;
}
.checklist-item:hover { background: white; border-color: var(--color-primary-light); }
.checklist-item-inputs { flex: 1; display: flex; gap: 0.5rem; }
.checklist-item input { margin: 0 !important; height: 32px !important; font-size: 0.85rem !important; }
.drag-handle { cursor: grab; opacity: 0.5; }
.drag-handle:hover { opacity: 1; color: var(--color-primary); }
.checklist-item.dragging { opacity: 0.5; border: 2px dashed var(--color-primary); }

/* PAGINATION */
.pagination-bar { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 0; margin-top: 1rem; border-top: 1px solid var(--border-color-light); }
.pagination-info { font-size: 0.85rem; color: var(--neutral-500); }
.pagination-buttons { display: flex; gap: 0.5rem; }

@media (max-width: 1024px) {
    .toolbar-card { height: auto; flex-direction: column; padding: 1rem; align-items: stretch; gap: 1rem; }
    .toolbar-divider { display: none; }
    .toolbar-search { flex: none; border-bottom: 1px solid var(--border-color-light); padding-bottom: 0.5rem; }
    .toolbar-tabs { padding-bottom: 0.5rem; gap: 1.5rem; }
}
`;

// --- VARIABLES GLOBALES ---
let checklists = [];
let filteredChecklists = [];
let currentChecklist = null;
let checklistToDelete = null;
let currentUser = null;
let currentTab = 'all';

// Pagination
let currentPage = 1;
let itemsPerPage = 12;

document.addEventListener('DOMContentLoaded', async () => {
  const styleEl = document.createElement('style');
  styleEl.innerHTML = checklistStyles;
  document.head.appendChild(styleEl);

  await checkAuth();
  await loadChecklists();

  // Listeners
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('add-checklist-btn')?.addEventListener('click', () => openChecklistModal());

  document.getElementById('close-checklist-modal')?.addEventListener('click', closeChecklistModal);
  document.getElementById('cancel-checklist-btn')?.addEventListener('click', closeChecklistModal);
  document.getElementById('save-checklist-btn')?.addEventListener('click', saveChecklist);

  document.getElementById('close-delete-modal')?.addEventListener('click', closeDeleteModal);
  document.getElementById('cancel-delete-checklist-btn')?.addEventListener('click', closeDeleteModal);
  document.getElementById('confirm-delete-checklist-btn')?.addEventListener('click', confirmDelete);

  document.getElementById('add-equipment-btn')?.addEventListener('click', (e) => { e.preventDefault(); addEquipmentItem(); });
  document.getElementById('add-task-btn')?.addEventListener('click', (e) => { e.preventDefault(); addTaskItem(); });

  const searchInput = document.getElementById('checklist-search');
  if (searchInput) searchInput.addEventListener('input', debounce(() => { currentPage = 1; filterChecklists(); }, 300));

  // Pagination Listener
  document.getElementById('limit-select')?.addEventListener('change', (e) => { itemsPerPage = parseInt(e.target.value); currentPage = 1; renderCurrentPage(); });
  document.getElementById('prev-page')?.addEventListener('click', () => { if(currentPage > 1) { currentPage--; renderCurrentPage(); } });
  document.getElementById('next-page')?.addEventListener('click', () => { const maxPage = Math.ceil(filteredChecklists.length / itemsPerPage); if(currentPage < maxPage) { currentPage++; renderCurrentPage(); } });

  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('edit');
  if (editId) { setTimeout(() => { openChecklistModal(parseInt(editId)); window.history.replaceState({}, document.title, '/checklists.html'); }, 300); }
});

async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) { window.location.href = '/login.html'; return; }
    const data = await response.json();
    currentUser = data.user;
    document.getElementById('user-info').innerHTML = `<div class="user-avatar">${data.user.name.charAt(0)}</div><div class="user-details"><strong>${escapeHtml(data.user.name)}</strong><span>${data.user.role === 'admin' ? 'Admin' : 'Tech'}</span></div>`;
    if (data.user.role === 'admin') document.getElementById('admin-link')?.classList.remove('hidden');
  } catch { window.location.href = '/login.html'; }
}
async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login.html'; }

// --- TABS & COUNTS ---
function switchTab(category) {
  currentTab = category;
  currentPage = 1; 
  
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('active');
    if(btn.getAttribute('onclick').includes(`'${category}'`)) btn.classList.add('active');
  });
  filterChecklists();
}

function updateTabCounts() {
  const categories = ['Maintenance', 'Installation', 'Dépannage', 'Audit', 'Autre'];
  document.getElementById('count-all').textContent = checklists.length;
  categories.forEach(cat => {
    const count = checklists.filter(c => c.category === cat).length;
    const el = document.getElementById(`count-${cat}`);
    if(el) el.textContent = count;
  });
}

// --- LOAD & RENDER ---
async function loadChecklists() {
  try {
    const response = await fetch('/api/checklists');
    if (!response.ok) throw new Error('Erreur réseau');
    checklists = await response.json();
    updateTabCounts();
    filterChecklists();
  } catch (error) {
    console.error(error);
    document.getElementById('checklists-grid').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--color-danger);">Erreur de chargement.</div>`;
  }
}

function filterChecklists() {
  const searchTerm = document.getElementById('checklist-search')?.value.toLowerCase() || '';
  filteredChecklists = checklists.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm) || (c.description && c.description.toLowerCase().includes(searchTerm));
    const matchesTab = currentTab === 'all' ? true : (c.category === currentTab);
    return matchesSearch && matchesTab;
  });
  renderCurrentPage();
}

function renderCurrentPage() {
    const grid = document.getElementById('checklists-grid');
    const paginationContainer = document.getElementById('pagination-container');
    const paginationInfo = document.getElementById('pagination-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (filteredChecklists.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--neutral-400);"><i class="fas fa-folder-open fa-3x" style="opacity:0.3;margin-bottom:1rem;"></i><p>Aucune checklist trouvée.</p></div>`;
        paginationContainer.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(filteredChecklists.length / itemsPerPage);
    if(currentPage > totalPages) currentPage = totalPages;
    if(currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const itemsToShow = filteredChecklists.slice(start, end);

    paginationContainer.style.display = 'flex';
    paginationInfo.textContent = `Page ${currentPage} sur ${totalPages} (${filteredChecklists.length} checklists)`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;

    grid.innerHTML = itemsToShow.map(c => `
    <div class="checklist-card-clean" onclick="openChecklistWork(${c.id})">
      
      <div class="clean-card-header">
        <span class="card-cat">${c.category ? c.category.toUpperCase() : 'AUTRE'}</span>
        <div class="card-actions-floating">
          <button class="btn-icon-sm btn-icon-secondary" onclick="event.stopPropagation(); duplicateChecklist(${c.id})" title="Dupliquer"><i class="fas fa-copy"></i></button>
          <button class="btn-icon-sm btn-icon-primary" onclick="event.stopPropagation(); openChecklistModal(${c.id})" title="Modifier"><i class="fas fa-pen"></i></button>
          <button class="btn-icon-sm btn-icon-danger" onclick="event.stopPropagation(); openDeleteModal(${c.id}, '${escapeHtml(c.name).replace(/'/g, "\\'")}')" title="Supprimer"><i class="fas fa-trash"></i></button>
        </div>
      </div>

      <h3 class="clean-card-title">${escapeHtml(c.name)}</h3>
      <div class="clean-card-desc">${c.description ? escapeHtml(c.description) : '<span style="font-style:italic;opacity:0.5;">Pas de description</span>'}</div>
      
      <div class="clean-card-footer">
        <div class="card-stats-row">
            <span class="stat-chip"><i class="fas fa-toolbox"></i> ${c.equipment_count || 0}</span>
            <span class="stat-chip"><i class="fas fa-tasks"></i> ${c.tasks_count || 0}</span>
        </div>
        <div class="card-date">
            ${formatDate(c.updated_at)}
        </div>
      </div>

    </div>
  `).join('');
}

function openChecklistWork(id) { window.location.href = `/checklist-view.html?id=${id}`; }

// --- MODALES & FORMS ---
async function openChecklistModal(id = null) {
  const modal = document.getElementById('checklist-modal');
  const title = document.getElementById('checklist-modal-title');
  document.getElementById('checklist-form').reset();
  document.getElementById('checklist-id').value = '';
  document.getElementById('equipment-list').innerHTML = '';
  document.getElementById('tasks-list').innerHTML = '';
  
  if (id) {
    title.innerHTML = '<i class="fas fa-pen"></i> Modifier la checklist';
    try {
      const res = await fetch(`/api/checklists/${id}`);
      if (!res.ok) throw new Error();
      currentChecklist = await res.json();
      document.getElementById('checklist-id').value = currentChecklist.id;
      document.getElementById('checklist-name').value = currentChecklist.name;
      document.getElementById('checklist-description').value = currentChecklist.description || '';
      document.getElementById('checklist-category').value = currentChecklist.category || 'Autre';
      if (currentChecklist.equipment) currentChecklist.equipment.forEach(eq => addEquipmentItem(eq.equipment_name, eq.quantity));
      if (currentChecklist.tasks) currentChecklist.tasks.forEach(task => addTaskItem(task.task_name));
    } catch { showNotification('Erreur chargement', 'error'); return; }
  } else {
    if(!title.innerHTML.includes('Dupliquer')) title.innerHTML = '<i class="fas fa-plus-circle"></i> Nouvelle checklist';
  }
  modal.classList.add('active');
  setupDragAndDrop();
}

function closeChecklistModal() { document.getElementById('checklist-modal').classList.remove('active'); currentChecklist = null; }

async function duplicateChecklist(id) {
  try {
    const res = await fetch(`/api/checklists/${id}`);
    const source = await res.json();
    openChecklistModal(); 
    document.getElementById('checklist-modal-title').innerHTML = '<i class="fas fa-copy"></i> Dupliquer la checklist';
    document.getElementById('checklist-name').value = source.name + ' - Copie';
    document.getElementById('checklist-description').value = source.description || '';
    document.getElementById('checklist-category').value = source.category || 'Autre';
    if(source.equipment) source.equipment.forEach(e => addEquipmentItem(e.equipment_name, e.quantity));
    if(source.tasks) source.tasks.forEach(t => addTaskItem(t.task_name));
    showNotification('Contenu dupliqué.', 'info');
  } catch { showNotification('Erreur duplication', 'error'); }
}

function addEquipmentItem(name = '', quantity = 1) {
  const list = document.getElementById('equipment-list');
  const div = document.createElement('div');
  div.className = 'checklist-item';
  div.innerHTML = `
    <div class="checklist-item-inputs">
      <input type="text" class="equipment-name" placeholder="Nom équipement" value="${escapeHtml(name)}"/>
      <input type="number" class="equipment-quantity" value="${quantity}" min="1" style="width:70px" placeholder="Qté"/>
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger remove-item"><i class="fas fa-times"></i></button>
  `;
  div.querySelector('.remove-item').addEventListener('click', () => div.remove());
  list.appendChild(div);
}

function addTaskItem(name = '') {
  const list = document.getElementById('tasks-list');
  const div = document.createElement('div');
  div.className = 'checklist-item';
  div.draggable = true;
  div.innerHTML = `
    <button type="button" class="btn-icon-sm drag-handle"><i class="fas fa-grip-vertical"></i></button>
    <div class="checklist-item-inputs">
      <input type="text" class="task-name" placeholder="Description de la tâche" value="${escapeHtml(name)}"/>
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger remove-item"><i class="fas fa-times"></i></button>
  `;
  div.querySelector('.remove-item').addEventListener('click', () => div.remove());
  list.appendChild(div);
  setupDragAndDrop();
}

function setupDragAndDrop() {
  const list = document.getElementById('tasks-list');
  if(!list) return;
  list.querySelectorAll('.checklist-item').forEach(draggable => {
    draggable.addEventListener('dragstart', () => draggable.classList.add('dragging'));
    draggable.addEventListener('dragend', () => draggable.classList.remove('dragging'));
  });
  list.addEventListener('dragover', e => { e.preventDefault(); const afterElement = getDragAfterElement(list, e.clientY); const draggable = document.querySelector('.dragging'); if (draggable) afterElement == null ? list.appendChild(draggable) : list.insertBefore(draggable, afterElement); });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.checklist-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return (offset < 0 && offset > closest.offset) ? { offset: offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveChecklist() {
  const btn = document.getElementById('save-checklist-btn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...'; btn.disabled = true;
  const id = document.getElementById('checklist-id').value;
  const data = {
    name: document.getElementById('checklist-name').value.trim(),
    description: document.getElementById('checklist-description').value.trim(),
    category: document.getElementById('checklist-category').value,
    updated_by: currentUser ? currentUser.name : null,
    equipment: Array.from(document.querySelectorAll('#equipment-list .checklist-item')).map(i => ({ equipment_name: i.querySelector('.equipment-name').value.trim(), quantity: parseInt(i.querySelector('.equipment-quantity').value)||1 })).filter(e => e.equipment_name),
    tasks: Array.from(document.querySelectorAll('#tasks-list .checklist-item')).map(i => ({ task_name: i.querySelector('.task-name').value.trim() })).filter(t => t.task_name)
  };
  if(!data.name) { showNotification('Nom requis', 'error'); btn.innerHTML = 'Enregistrer'; btn.disabled = false; return; }
  try {
    const res = await fetch(id ? `/api/checklists/${id}` : '/api/checklists', { method: id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)});
    
    // CORRECTION ICI : Gestion du retour serveur
    if(res.ok) { 
        closeChecklistModal(); loadChecklists(); showNotification('Enregistré !', 'success'); 
    } else {
        const err = await res.json();
        showNotification(err.error || 'Erreur serveur', 'error');
    }
  } catch { showNotification('Erreur réseau', 'error'); } 
  finally { btn.innerHTML = 'Enregistrer'; btn.disabled = false; }
}

function openDeleteModal(id, name) { checklistToDelete = id; document.getElementById('delete-checklist-name').textContent = name; document.getElementById('delete-checklist-modal').classList.add('active'); }
function closeDeleteModal() { document.getElementById('delete-checklist-modal').classList.remove('active'); checklistToDelete = null; }
async function confirmDelete() {
  if(!checklistToDelete) return;
  try {
    const res = await fetch(`/api/checklists/${checklistToDelete}`, { method: 'DELETE' });
    if(res.ok) { 
        showNotification('Supprimé', 'success'); loadChecklists(); closeDeleteModal(); 
    } else {
        const err = await res.json();
        showNotification(err.error || 'Erreur', 'error');
    }
  } catch { showNotification('Erreur réseau', 'error'); }
}

function showNotification(msg, type='info') {
  const c = document.getElementById('notification-container');
  const n = document.createElement('div'); n.className = `notification notification-${type} show`;
  n.innerHTML = `<i class="fas ${type==='success'?'fa-check':type==='error'?'fa-exclamation':'fa-info'}"></i> ${msg}`;
  c.appendChild(n); setTimeout(()=>n.remove(), 3000);
}
function debounce(f,w){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>f.apply(this,a),w);};}
function formatDate(d){return d?new Date(d).toLocaleDateString('fr-CH'):'-';}
function escapeHtml(t){if(!t)return'';const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

window.openChecklistModal = openChecklistModal;
window.openDeleteModal = openDeleteModal;
window.openChecklistWork = openChecklistWork;
window.duplicateChecklist = duplicateChecklist;
window.switchTab = switchTab;