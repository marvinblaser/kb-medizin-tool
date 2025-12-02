/**
 * KB Medizin Technik - Administration
 * Version: Complete (Users, Sectors, Device Types, Equipment, Materials, Logs)
 */

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupTabs();
  await loadAllData();

  document.getElementById('logout-btn').addEventListener('click', logout);

  // --- USERS EVENTS ---
  document.getElementById('add-user-btn').addEventListener('click', () => openUserModal());
  document.getElementById('cancel-user-btn').addEventListener('click', closeUserModal);
  document.getElementById('save-user-btn').addEventListener('click', saveUser);
  document.getElementById('cancel-reset-btn').addEventListener('click', closeResetModal);
  document.getElementById('confirm-reset-btn').addEventListener('click', confirmResetPassword);

  // --- SECTORS EVENTS ---
  document.getElementById('add-sector-btn').addEventListener('click', openSectorModal);
  document.getElementById('cancel-sector-btn').addEventListener('click', closeSectorModal);
  document.getElementById('save-sector-btn').addEventListener('click', saveSector);

  // --- DEVICE TYPES EVENTS (NOUVEAU) ---
  const addDeviceTypeBtn = document.getElementById('add-device-type-btn');
  if(addDeviceTypeBtn) addDeviceTypeBtn.addEventListener('click', openDeviceTypeModal);
  
  const saveDeviceTypeBtn = document.getElementById('save-device-type-btn');
  if(saveDeviceTypeBtn) saveDeviceTypeBtn.addEventListener('click', saveDeviceType);

  // --- EQUIPMENT EVENTS ---
  document.getElementById('add-equipment-btn').addEventListener('click', () => openEquipmentModal());
  document.getElementById('cancel-equipment-btn').addEventListener('click', closeEquipmentModal);
  document.getElementById('save-equipment-btn').addEventListener('click', saveEquipment);

  // --- MATERIALS EVENTS ---
  document.getElementById('add-material-btn').addEventListener('click', () => openMaterialModal());
  document.getElementById('cancel-material-btn').addEventListener('click', closeMaterialModal);
  document.getElementById('save-material-btn').addEventListener('click', saveMaterial);
  
  // Close Modals on click outside
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if(e.target === m) m.classList.remove('active'); });
  });
});

// ========== MODAL HELPERS ==========
function closeUserModal() { document.getElementById('user-modal').classList.remove('active'); }
function closeSectorModal() { document.getElementById('sector-modal').classList.remove('active'); }
function closeDeviceTypeModal() { document.getElementById('device-type-modal').classList.remove('active'); }
function closeEquipmentModal() { document.getElementById('equipment-modal').classList.remove('active'); }
function closeResetModal() { document.getElementById('reset-password-modal').classList.remove('active'); }
function closeMaterialModal() { document.getElementById('material-modal').classList.remove('active'); }

function showNotification(message, type = 'info') {
  let container = document.getElementById('notification-container');
  if (!container) {
    const div = document.createElement('div'); div.id = 'notification-container'; div.className = 'notification-container';
    document.body.appendChild(div); container = div;
  }
  const n = document.createElement('div'); n.className = `notification notification-${type}`;
  n.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i> <span>${message}</span>`;
  container.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, 3000);
}

// ========== AUTH & INIT ==========
async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) { window.location.href = '/login.html'; return; }
    const data = await response.json();
    if (data.user.role !== 'admin') { window.location.href = '/dashboard.html'; return; }
    document.getElementById('user-info').innerHTML = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details"><strong>${escapeHtml(data.user.name)}</strong><span>Admin</span></div>
    `;
    // Store ID for self-delete check
    window.currentUserId = data.user.id;
  } catch { window.location.href = '/login.html'; }
}

async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login.html'; }

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const targetId = `tab-${tab.dataset.tab}`;
      const targetContent = document.getElementById(targetId);
      if(targetContent) targetContent.classList.add('active');
    });
  });
}

async function loadAllData() {
  // Load dependencies first (for select options)
  await Promise.all([loadSectors(), loadDeviceTypes()]);
  // Load main data
  await Promise.all([loadUsers(), loadEquipment(), loadMaterials(), loadLogs()]);
}

// ========== USERS ==========
async function loadUsers() {
  try {
    const r = await fetch('/api/admin/users'); 
    const users = await r.json();
    document.getElementById('users-tbody').innerHTML = users.map(u => `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar-sm">${u.name.charAt(0)}</div>
            <strong>${escapeHtml(u.name)}</strong>
          </div>
        </td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.role==='admin'?'badge-primary':'badge-secondary'}">${u.role}</span></td>
        <td>${escapeHtml(u.phone||'-')}</td>
        <td><span class="badge ${u.is_active?'badge-success':'badge-danger'}">${u.is_active?'Actif':'Inactif'}</span></td>
        <td>${formatDateTime(u.last_login_at)}</td>
        <td>
          <div class="table-actions">
            <button class="btn-icon-sm btn-icon-primary" onclick="openUserModal(${u.id})"><i class="fas fa-edit"></i></button>
            <button class="btn-icon-sm btn-icon-danger" onclick="openResetModal(${u.id})"><i class="fas fa-key"></i></button>
            <button class="btn-icon-sm btn-icon-danger" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch(e) { console.error(e); }
}

async function openUserModal(id = null) {
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  form.reset();
  document.getElementById('user-id').value = '';
  document.getElementById('password-group').style.display = 'block';
  document.getElementById('user-password').required = true;
  document.getElementById('user-modal-title').innerHTML = '<i class="fas fa-user-plus"></i> Ajouter un utilisateur';

  if(id) {
    try {
      const r = await fetch('/api/admin/users');
      const users = await r.json();
      const u = users.find(x => x.id === id);
      if(u) {
        document.getElementById('user-id').value = u.id;
        document.getElementById('user-name').value = u.name;
        document.getElementById('user-email').value = u.email;
        document.getElementById('user-role').value = u.role;
        document.getElementById('user-phone').value = u.phone || '';
        document.getElementById('user-active').checked = !!u.is_active;
        
        document.getElementById('password-group').style.display = 'none';
        document.getElementById('user-password').required = false;
        document.getElementById('user-modal-title').innerHTML = '<i class="fas fa-user-edit"></i> Modifier l\'utilisateur';
      }
    } catch(e) { console.error(e); }
  }
  modal.classList.add('active');
}

async function saveUser() {
  const btn = document.getElementById('save-user-btn');
  btn.disabled = true;
  const id = document.getElementById('user-id').value;
  
  const data = {
    name: document.getElementById('user-name').value,
    email: document.getElementById('user-email').value,
    role: document.getElementById('user-role').value,
    phone: document.getElementById('user-phone').value,
    is_active: document.getElementById('user-active').checked ? 1 : 0
  };
  
  if(!id) {
    data.password = document.getElementById('user-password').value;
    if(data.password.length < 6) {
      showNotification('Mot de passe trop court (min 6)', 'error');
      btn.disabled = false;
      return;
    }
  }

  try {
    const res = await fetch(id ? `/api/admin/users/${id}` : '/api/admin/users', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    
    if(res.ok) {
      showNotification('Utilisateur enregistré', 'success');
      closeUserModal();
      loadUsers();
    } else {
      const err = await res.json();
      showNotification(err.error || 'Erreur', 'error');
    }
  } catch(e) { console.error(e); }
  btn.disabled = false;
}

async function deleteUser(id) {
  if(id === window.currentUserId) return showNotification('Impossible de supprimer votre compte', 'warning');
  if(!confirm('Supprimer cet utilisateur ?')) return;
  
  try {
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if(res.ok) { showNotification('Supprimé', 'success'); loadUsers(); }
    else { const err = await res.json(); showNotification(err.error, 'error'); }
  } catch(e) { console.error(e); }
}

async function confirmResetPassword() {
  const id = document.getElementById('reset-user-id').value;
  const password = document.getElementById('new-password').value;
  if(password.length < 6) return showNotification('Mot de passe trop court', 'warning');
  
  try {
    const res = await fetch(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({password})
    });
    if(res.ok) { showNotification('Mot de passe réinitialisé', 'success'); closeResetModal(); }
    else showNotification('Erreur', 'error');
  } catch(e) { console.error(e); }
}

function openResetModal(id) {
  document.getElementById('reset-user-id').value = id;
  document.getElementById('new-password').value = '';
  document.getElementById('reset-password-modal').classList.add('active');
}

// ========== SECTORS ==========
async function loadSectors() {
  try {
    const r = await fetch('/api/admin/sectors');
    const sectors = await r.json();
    document.getElementById('sectors-tbody').innerHTML = sectors.map(s => `
      <tr>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td><code>${escapeHtml(s.slug)}</code></td>
        <td>${formatDate(s.created_at)}</td>
        <td><button class="btn-icon-sm btn-icon-danger" onclick="deleteSector(${s.id})"><i class="fas fa-trash"></i></button></td>
      </tr>
    `).join('');
    updateSelectOptions('equipment-type', sectors);
  } catch(e) { console.error(e); }
}

function openSectorModal() { 
  document.getElementById('sector-name').value = ''; 
  document.getElementById('sector-modal').classList.add('active'); 
}

async function saveSector() {
  const name = document.getElementById('sector-name').value;
  if(!name) return;
  try {
    const res = await fetch('/api/admin/sectors', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name})
    });
    if(res.ok) { showNotification('Secteur ajouté', 'success'); closeSectorModal(); loadSectors(); }
    else showNotification('Erreur', 'error');
  } catch(e) { console.error(e); }
}

async function deleteSector(id) {
  if(!confirm('Supprimer ce secteur ?')) return;
  await fetch(`/api/admin/sectors/${id}`, { method: 'DELETE' });
  loadSectors();
}

// ========== DEVICE TYPES (TYPES D'APPAREILS) ==========
async function loadDeviceTypes() {
  try {
    const r = await fetch('/api/admin/device-types');
    const types = await r.json();
    document.getElementById('device-types-tbody').innerHTML = types.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td><button class="btn-icon-sm btn-icon-danger" onclick="deleteDeviceType(${t.id})"><i class="fas fa-trash"></i></button></td>
      </tr>
    `).join('');
    updateSelectOptions('equipment-device-type', types);
  } catch(e) { console.error(e); }
}

function openDeviceTypeModal() {
  document.getElementById('device-type-name').value = '';
  document.getElementById('device-type-modal').classList.add('active');
}

async function saveDeviceType() {
  const name = document.getElementById('device-type-name').value;
  if(!name) return;
  try {
    const res = await fetch('/api/admin/device-types', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name})
    });
    if(res.ok) { showNotification('Type ajouté', 'success'); closeDeviceTypeModal(); loadDeviceTypes(); }
    else showNotification('Erreur', 'error');
  } catch(e) { console.error(e); }
}

async function deleteDeviceType(id) {
  if(!confirm('Supprimer ce type ?')) return;
  await fetch(`/api/admin/device-types/${id}`, { method: 'DELETE' });
  loadDeviceTypes();
}

// ========== EQUIPMENT ==========
async function loadEquipment() {
  try {
    const r = await fetch('/api/admin/equipment'); 
    const eq = await r.json();
    document.getElementById('equipment-tbody').innerHTML = eq.map(e => `
      <tr>
        <td data-label="Modèle"><strong>${escapeHtml(e.name)}</strong></td>
        <td data-label="Marque">${escapeHtml(e.brand)}</td>
        <td data-label="Appareil">${escapeHtml(e.device_type || '-')}</td>
        <td data-label="Secteur"><span class="badge badge-info">${escapeHtml(e.type)}</span></td>
        <td data-label="Actions">
          <div class="table-actions">
            <button class="btn-icon-sm btn-icon-primary" onclick="openEquipmentModal(${e.id})"><i class="fas fa-edit"></i></button>
            <button class="btn-icon-sm btn-icon-danger" onclick="deleteEquipment(${e.id})"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch(e) { console.error(e); }
}

async function openEquipmentModal(id = null) {
  const modal = document.getElementById('equipment-modal');
  const form = document.getElementById('equipment-form');
  form.reset();
  document.getElementById('equipment-id').value = '';
  document.getElementById('equipment-modal-title').innerHTML = '<i class="fas fa-tools"></i> Ajouter un équipement';

  if(id) {
    try {
      const r = await fetch('/api/admin/equipment');
      const eqs = await r.json();
      const e = eqs.find(x => x.id === id);
      if(e) {
        document.getElementById('equipment-id').value = e.id;
        document.getElementById('equipment-name').value = e.name; // Modèle
        document.getElementById('equipment-brand').value = e.brand;
        document.getElementById('equipment-type').value = e.type; // Secteur
        document.getElementById('equipment-device-type').value = e.device_type || ''; // Appareil
        document.getElementById('equipment-modal-title').innerHTML = '<i class="fas fa-edit"></i> Modifier l\'équipement';
      }
    } catch(err) { console.error(err); }
  }
  modal.classList.add('active');
}

async function saveEquipment() {
  const id = document.getElementById('equipment-id').value;
  const data = {
    name: document.getElementById('equipment-name').value, // Modèle
    brand: document.getElementById('equipment-brand').value,
    type: document.getElementById('equipment-type').value, // Secteur
    device_type: document.getElementById('equipment-device-type').value // Appareil
  };

  try {
    const res = await fetch(id ? `/api/admin/equipment/${id}` : '/api/admin/equipment', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    if(res.ok) {
      showNotification('Équipement enregistré', 'success');
      closeEquipmentModal();
      loadEquipment();
    } else {
      showNotification('Erreur', 'error');
    }
  } catch(e) { console.error(e); }
}

async function deleteEquipment(id) {
  if(!confirm('Supprimer cet équipement ?')) return;
  await fetch(`/api/admin/equipment/${id}`, { method: 'DELETE' });
  loadEquipment();
}

// ========== MATERIALS ==========
async function loadMaterials() {
  try {
    const r = await fetch('/api/admin/materials');
    const mats = await r.json();
    document.getElementById('materials-tbody').innerHTML = mats.map(m => `
      <tr>
        <td data-label="Nom"><strong>${escapeHtml(m.name)}</strong></td>
        <td data-label="Code"><code>${escapeHtml(m.product_code)}</code></td>
        <td data-label="Prix">${parseFloat(m.unit_price).toFixed(2)} CHF</td>
        <td data-label="Actions">
          <div class="table-actions">
            <button class="btn-icon-sm btn-icon-primary" onclick="openMaterialModal(${m.id})"><i class="fas fa-edit"></i></button>
            <button class="btn-icon-sm btn-icon-danger" onclick="deleteMaterial(${m.id})"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch(e) { console.error(e); }
}

async function openMaterialModal(id = null) {
  const modal = document.getElementById('material-modal');
  const form = document.getElementById('material-form');
  form.reset();
  document.getElementById('material-id').value = '';
  document.getElementById('material-modal-title').innerHTML = '<i class="fas fa-plus-circle"></i> Ajouter du matériel';

  if(id) {
    try {
      const r = await fetch('/api/admin/materials');
      const mats = await r.json();
      const m = mats.find(x => x.id === id);
      if(m) {
        document.getElementById('material-id').value = m.id;
        document.getElementById('material-name').value = m.name;
        document.getElementById('material-code').value = m.product_code;
        document.getElementById('material-price').value = m.unit_price;
        document.getElementById('material-modal-title').innerHTML = '<i class="fas fa-edit"></i> Modifier le matériel';
      }
    } catch(e) { console.error(e); }
  }
  modal.classList.add('active');
}

async function saveMaterial() {
  const id = document.getElementById('material-id').value;
  const data = {
    name: document.getElementById('material-name').value,
    product_code: document.getElementById('material-code').value,
    unit_price: parseFloat(document.getElementById('material-price').value)
  };

  try {
    const res = await fetch(id ? `/api/admin/materials/${id}` : '/api/admin/materials', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    if(res.ok) { showNotification('Matériel enregistré', 'success'); closeMaterialModal(); loadMaterials(); }
    else showNotification('Erreur', 'error');
  } catch(e) { console.error(e); }
}

async function deleteMaterial(id) {
  if(!confirm('Supprimer ce matériel ?')) return;
  await fetch(`/api/admin/materials/${id}`, { method: 'DELETE' });
  loadMaterials();
}

// ========== LOGS ==========
async function loadLogs() {
  try {
    const r = await fetch('/api/admin/logs?limit=50');
    const logs = await r.json();
    document.getElementById('logs-tbody').innerHTML = logs.map(l => `
      <tr>
        <td>${formatDateTime(l.created_at)}</td>
        <td><div class="user-cell"><div class="user-avatar-sm">${(l.user_name||'S').charAt(0)}</div> ${escapeHtml(l.user_name||'Système')}</div></td>
        <td><span class="badge badge-secondary">${l.action}</span></td>
        <td>${l.entity}</td>
        <td><code>${l.entity_id||'-'}</code></td>
      </tr>
    `).join('');
  } catch(e) { console.error(e); }
}

// ========== UTILS ==========
function updateSelectOptions(elementId, items) {
  const sel = document.getElementById(elementId);
  if(!sel) return;
  sel.innerHTML = '<option value="">-- Sélectionner --</option>' + 
    items.map(i => `<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}</option>`).join('');
}

function formatDate(s) { if(!s) return '-'; return new Date(s).toLocaleDateString('fr-CH'); }
function formatDateTime(s) { if(!s) return '-'; return new Date(s).toLocaleString('fr-CH', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}); }
function escapeHtml(t) { if(!t) return ''; return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }