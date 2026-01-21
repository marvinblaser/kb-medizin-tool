// public/js/admin.js

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupTabs();
  await loadAllData();

  const safeAddListener = (id, event, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  };

  // --- LOGOUT ---
  safeAddListener('logout-btn', 'click', logout);

  // --- USERS EVENTS ---
  safeAddListener('add-user-btn', 'click', () => openUserModal());
  safeAddListener('cancel-user-btn', 'click', closeUserModal);
  safeAddListener('save-user-btn', 'click', saveUser);
  safeAddListener('cancel-reset-btn', 'click', closeResetModal);
  safeAddListener('confirm-reset-btn', 'click', confirmResetPassword);

  // --- ROLES EVENTS ---
  safeAddListener('add-role-btn', 'click', () => openRoleModal());
  safeAddListener('save-role-btn', 'click', saveRole);

  // --- SECTORS & OTHERS ---
  safeAddListener('add-sector-btn', 'click', openSectorModal);
  safeAddListener('cancel-sector-btn', 'click', closeSectorModal);
  safeAddListener('save-sector-btn', 'click', saveSector);
  safeAddListener('add-device-type-btn', 'click', openDeviceTypeModal);
  safeAddListener('save-device-type-btn', 'click', saveDeviceType);
  safeAddListener('add-equipment-btn', 'click', () => openEquipmentModal());
  safeAddListener('cancel-equipment-btn', 'click', closeEquipmentModal);
  safeAddListener('save-equipment-btn', 'click', saveEquipment);
  safeAddListener('add-material-btn', 'click', () => openMaterialModal());
  safeAddListener('cancel-material-btn', 'click', closeMaterialModal);
  safeAddListener('save-material-btn', 'click', saveMaterial);

  // --- MATERIALS EVENTS ---
  safeAddListener('add-material-btn', 'click', () => openMaterialModal());
  safeAddListener('cancel-material-btn', 'click', closeMaterialModal);
  safeAddListener('save-material-btn', 'click', saveMaterial);
  
  // NOUVEAU : Ecouteur pour le bouton "Tout vider"
  safeAddListener('delete-all-materials-btn', 'click', async () => {
      if(confirm("ATTENTION : Vous allez supprimer TOUTE la liste de matériel.\n\nVoulez-vous continuer ?")) {
          try {
              const res = await fetch('/api/admin/materials/all', { method: 'DELETE' });
              const data = await res.json();
              if (data.success) {
                  showNotification('Liste vidée avec succès.', 'success');
                  loadMaterials();
              } else {
                  showNotification('Erreur serveur.', 'error');
              }
          } catch (e) {
              console.error(e);
              showNotification('Erreur de connexion.', 'error');
          }
      }
  });

  // --- IMPORT MATERIALS ---
  const matInput = document.getElementById('import-material-input');
  if (matInput) {
      matInput.addEventListener('change', async (e) => {
          if (!e.target.files[0]) return;
          
          if(!confirm("Voulez-vous importer ce fichier CSV ? Cela ajoutera les produits à la liste existante.")) {
              e.target.value = ''; // Reset
              return;
          }

          const formData = new FormData();
          formData.append('file', e.target.files[0]);

          showNotification('Import en cours...', 'info');

          try {
              // CORRECTION ICI : L'URL doit correspondre à celle du serveur
              const res = await fetch('/api/admin/materials/import', {
                  method: 'POST',
                  body: formData
              });
              
              // On vérifie d'abord si la réponse est bien du JSON
              const contentType = res.headers.get("content-type");
              if (!contentType || !contentType.includes("application/json")) {
                  throw new Error("Le serveur n'a pas renvoyé de JSON. Vérifiez la console serveur.");
              }

              const data = await res.json();

              if (data.success) {
                  showNotification(`Succès ! Import terminé.`, 'success'); // Message simplifié car count n'est pas toujours renvoyé immédiatement
                  setTimeout(() => loadMaterials(), 1000); // Petit délai pour laisser la BDD finir
              } else {
                  showNotification(data.error || "Erreur lors de l'import", 'error');
              }
          } catch (err) {
              console.error(err);
              showNotification("Erreur technique (voir console)", 'error');
          }
          e.target.value = ''; // Reset pour pouvoir réimporter le même fichier si besoin
      });
  }
  
  // Close Modals
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if(e.target === m) m.classList.remove('active'); });
  });
});

const AVAILABLE_PERMISSIONS = [
  { key: 'all', label: 'Super Admin (Tout)' },
  { key: 'view_dashboard', label: 'Voir Tableau de bord' },
  { key: 'view_clients', label: 'Voir Clients' },
  { key: 'manage_clients', label: 'Gérer Clients' },
  { key: 'view_reports', label: 'Voir Rapports' },
  { key: 'create_reports', label: 'Créer Rapports' },
  { key: 'validate_reports', label: 'Valider Rapports' },
  { key: 'manage_stock', label: 'Gérer Stock & Matériel' },
  { key: 'create_quotes', label: 'Créer Devis' },
  { key: 'manage_sales', label: 'Direction des Ventes' },
  { key: 'manage_appointments', label: 'Gérer Rendez-vous' }
];

// ========== HELPERS ==========
function closeUserModal() { document.getElementById('user-modal').classList.remove('active'); }
function closeSectorModal() { document.getElementById('sector-modal').classList.remove('active'); }
function closeDeviceTypeModal() { document.getElementById('device-type-modal').classList.remove('active'); }
function closeEquipmentModal() { document.getElementById('equipment-modal').classList.remove('active'); }
function closeResetModal() { document.getElementById('reset-password-modal').classList.remove('active'); }
function closeMaterialModal() { document.getElementById('material-modal').classList.remove('active'); }
function closeRoleModal() { document.getElementById('role-modal').classList.remove('active'); }

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

// ========== INIT ==========
async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) { window.location.href = '/login.html'; return; }
    const data = await response.json();
    if (data.user.role !== 'admin') { window.location.href = '/dashboard.html'; return; }
    
    let avatarHtml = `<div class="user-avatar">${data.user.name.charAt(0)}</div>`;
    if(data.user.photo_url) avatarHtml = `<img src="${data.user.photo_url}" class="user-avatar-img" alt="avatar" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`;
    document.getElementById('user-info').innerHTML = `${avatarHtml}<div class="user-details"><strong>${escapeHtml(data.user.name)}</strong><span>Admin</span></div>`;
    window.currentUserId = data.user.id;
  } catch { window.location.href = '/login.html'; }
}

async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login.html'; }

function setupTabs() {
  const btns = document.querySelectorAll('#admin-tabs .nav-text-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
        // MAJ active state boutons
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // MAJ content
        document.querySelectorAll('.view-section').forEach(c => c.classList.remove('active'));
        const targetId = `tab-${btn.dataset.tab}`;
        const target = document.getElementById(targetId);
        if(target) target.classList.add('active');
    });
  });
}

async function loadAllData() {
  await Promise.all([loadSectors(), loadDeviceTypes(), loadRoles()]);
  await Promise.all([loadUsers(), loadEquipment(), loadMaterials(), loadLogs()]);
}

// ========== ROLES ==========
async function loadRoles() {
  try {
    const r = await fetch('/api/admin/roles');
    const roles = await r.json();
    
    document.getElementById('roles-tbody').innerHTML = roles.map(role => `
      <tr>
        <td><strong>${escapeHtml(role.name)}</strong></td>
        <td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.85em; color:var(--neutral-600);">${role.slug}</code></td>
        <td><div style="font-size:0.85rem; color:#64748b; max-width:400px; white-space:normal; line-height:1.4;">${role.permissions ? role.permissions.replace(/,/g, ', ') : '-'}</div></td>
        <td style="text-align:right;">
          <div class="table-actions">
            <button class="btn-icon-sm btn-icon-primary" onclick="openRoleModal('${role.slug}', '${escapeHtml(role.name)}', '${role.permissions}')" title="Modifier"><i class="fas fa-pen"></i></button>
            <button class="btn-icon-sm btn-icon-danger" onclick="deleteRole('${role.slug}')" title="Supprimer"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');

    const select = document.getElementById('user-role');
    select.innerHTML = roles.map(r => `<option value="${r.slug}">${r.name}</option>`).join('');
  } catch(e) { console.error(e); }
}

function openRoleModal(slug = null, name = '', permissions = '') {
  const container = document.getElementById('permissions-container');
  container.innerHTML = '';
  const userPerms = permissions ? permissions.split(',') : [];

  AVAILABLE_PERMISSIONS.forEach(perm => {
    const checked = userPerms.includes(perm.key) ? 'checked' : '';
    container.innerHTML += `
      <div class="perm-item">
        <input type="checkbox" id="perm-${perm.key}" value="${perm.key}" ${checked}>
        <label for="perm-${perm.key}">${perm.label}</label>
      </div>
    `;
  });

  if (slug) {
    document.getElementById('role-modal-title').innerHTML = '<i class="fas fa-edit"></i> Modifier le rôle';
    document.getElementById('role-slug-original').value = slug;
    document.getElementById('role-name').value = name;
  } else {
    document.getElementById('role-modal-title').innerHTML = '<i class="fas fa-plus-circle"></i> Nouveau rôle';
    document.getElementById('role-slug-original').value = '';
    document.getElementById('role-name').value = '';
  }
  document.getElementById('role-modal').classList.add('active');
}

async function saveRole() {
  const name = document.getElementById('role-name').value;
  const slugOriginal = document.getElementById('role-slug-original').value;
  const checkboxes = document.querySelectorAll('#permissions-container input[type="checkbox"]:checked');
  const permissions = Array.from(checkboxes).map(cb => cb.value).join(',');

  if(!name) return;

  try {
    let url = '/api/admin/roles';
    let method = 'POST';
    if(slugOriginal) { url = `/api/admin/roles/${slugOriginal}`; method = 'PUT'; }

    const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, permissions }) });

    if(res.ok) { showNotification('Rôle enregistré', 'success'); closeRoleModal(); loadRoles(); } 
    else { const err = await res.json(); showNotification(err.error, 'error'); }
  } catch(e) { console.error(e); }
}

async function deleteRole(slug) {
  if(!confirm('Supprimer ce rôle ?')) return;
  try {
    const res = await fetch(`/api/admin/roles/${slug}`, { method: 'DELETE' });
    if(res.ok) { loadRoles(); showNotification('Supprimé', 'success'); }
  } catch(e) { console.error(e); }
}

// ========== LOGS ==========
async function filterLogs(category, btn) {
  document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await loadLogs(category);
}

async function loadLogs(category = 'all') {
  try {
    let url = '/api/admin/logs?limit=100';
    if(category !== 'all') url += `&category=${category}`;
    const r = await fetch(url);
    const logs = await r.json();
    
    document.getElementById('logs-tbody').innerHTML = logs.length ? logs.map(l => `
      <tr>
        <td style="color:#64748b; font-size:0.85em;">${formatDateTime(l.created_at)}</td>
        <td><div style="display:flex; align-items:center; gap:8px;">
            <div class="user-avatar-sm" style="width:24px; height:24px; font-size:0.7em;">${(l.user_name||'S').charAt(0)}</div> 
            <span style="font-weight:600; font-size:0.9em;">${escapeHtml(l.user_name||'Système')}</span>
        </div></td>
        <td><span class="badge badge-secondary" style="font-weight:500;">${l.action}</span></td>
        <td>${l.entity}</td>
        <td><code style="font-size:0.85em; color:var(--neutral-500);">${l.entity_id||'-'}</code></td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="text-center" style="padding:2rem;">Aucun log trouvé.</td></tr>';
  } catch(e) { console.error(e); }
}

// ========== USERS ==========
async function loadUsers() {
  try {
    const r = await fetch('/api/admin/users'); 
    const users = await r.json();
    document.getElementById('users-tbody').innerHTML = users.map(u => {
      let avatarDisplay = `<div class="user-avatar-sm">${u.name.charAt(0)}</div>`;
      if(u.photo_url) avatarDisplay = `<img src="${u.photo_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`;

      return `
      <tr>
        <td><div style="display:flex; align-items:center; gap:10px;">${avatarDisplay} <span style="font-weight:600;">${escapeHtml(u.name)}</span></div></td>
        <td><a href="mailto:${u.email}" style="color:var(--color-primary); text-decoration:none;">${escapeHtml(u.email)}</a></td>
        <td><span class="badge badge-info">${u.role}</span></td>
        <td>${escapeHtml(u.phone||'-')}</td>
        <td><span class="badge ${u.is_active?'badge-success':'badge-danger'}">${u.is_active?'Actif':'Inactif'}</span></td>
        <td style="color:#64748b; font-size:0.85em;">${formatDateTime(u.last_login_at)}</td>
        <td style="text-align:right;">
          <div class="table-actions">
            <button class="btn-icon-sm btn-icon-primary" onclick="openUserModal(${u.id})" title="Modifier"><i class="fas fa-pen"></i></button>
            <button class="btn-icon-sm btn-icon-secondary" onclick="openResetModal(${u.id})" title="Réinitialiser MDP"><i class="fas fa-key"></i></button>
            <button class="btn-icon-sm btn-icon-danger" onclick="deleteUser(${u.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `}).join('');
  } catch(e) { console.error(e); }
}

async function openUserModal(id = null) {
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  form.reset();
  document.getElementById('user-id').value = '';
  document.getElementById('password-group').style.display = 'block';
  document.getElementById('user-password').required = true;
  document.getElementById('user-modal-title').innerHTML = '<i class="fas fa-user-plus"></i> Ajouter Utilisateur';
  await loadRoles(); 

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
        document.getElementById('user-modal-title').innerHTML = '<i class="fas fa-user-edit"></i> Modifier Utilisateur';
      }
    } catch(e) { console.error(e); }
  }
  modal.classList.add('active');
}

async function saveUser() {
  const btn = document.getElementById('save-user-btn'); btn.disabled = true;
  const id = document.getElementById('user-id').value;
  const formData = new FormData();
  formData.append('name', document.getElementById('user-name').value);
  formData.append('email', document.getElementById('user-email').value);
  formData.append('role', document.getElementById('user-role').value);
  formData.append('phone', document.getElementById('user-phone').value);
  formData.append('is_active', document.getElementById('user-active').checked ? 1 : 0);
  
  const fileInput = document.getElementById('user-photo');
  if(fileInput.files.length > 0) formData.append('photo', fileInput.files[0]);

  if(!id) {
    const pwd = document.getElementById('user-password').value;
    if(pwd.length < 6) { showNotification('Mot de passe trop court', 'error'); btn.disabled = false; return; }
    formData.append('password', pwd);
  }

  try {
    const res = await fetch(id ? `/api/admin/users/${id}` : '/api/admin/users', { method: id ? 'PUT' : 'POST', body: formData });
    if(res.ok) { showNotification('Enregistré', 'success'); closeUserModal(); loadUsers(); if(id==window.currentUserId) checkAuth(); }
    else { const err = await res.json(); showNotification(err.error, 'error'); }
  } catch(e) { console.error(e); }
  btn.disabled = false;
}

async function deleteUser(id) {
  if(id === window.currentUserId) return showNotification('Impossible de se supprimer soi-même', 'warning');
  if(!confirm('Supprimer ?')) return;
  const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  if(res.ok) { showNotification('Supprimé', 'success'); loadUsers(); }
}

async function confirmResetPassword() {
  const id = document.getElementById('reset-user-id').value;
  const password = document.getElementById('new-password').value;
  if(password.length < 6) return showNotification('Trop court', 'warning');
  const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password}) });
  if(res.ok) { showNotification('Réinitialisé', 'success'); closeResetModal(); }
}
function openResetModal(id) { document.getElementById('reset-user-id').value = id; document.getElementById('new-password').value = ''; document.getElementById('reset-password-modal').classList.add('active'); }

// ========== SECTORS, DEVICES, EQUIPMENT, MATERIALS ==========
async function loadSectors() { const r=await fetch('/api/admin/sectors'); const d=await r.json(); document.getElementById('sectors-tbody').innerHTML=d.map(s=>`<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${s.slug}</td><td>${formatDate(s.created_at)}</td><td style="text-align:right"><button class="btn-icon-sm btn-icon-danger" onclick="deleteSector(${s.id})"><i class="fas fa-trash"></i></button></td></tr>`).join(''); updateSelectOptions('equipment-type', d); }
function openSectorModal() { document.getElementById('sector-name').value=''; document.getElementById('sector-modal').classList.add('active'); }
async function saveSector() { const name=document.getElementById('sector-name').value; if(!name)return; await fetch('/api/admin/sectors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}); closeSectorModal(); loadSectors(); }
async function deleteSector(id) { if(!confirm('Supprimer ?'))return; await fetch(`/api/admin/sectors/${id}`,{method:'DELETE'}); loadSectors(); }

async function loadDeviceTypes() { const r=await fetch('/api/admin/device-types'); const d=await r.json(); document.getElementById('device-types-tbody').innerHTML=d.map(t=>`<tr><td><strong>${escapeHtml(t.name)}</strong></td><td style="text-align:right"><button class="btn-icon-sm btn-icon-danger" onclick="deleteDeviceType(${t.id})"><i class="fas fa-trash"></i></button></td></tr>`).join(''); updateSelectOptions('equipment-device-type', d); }
function openDeviceTypeModal() { document.getElementById('device-type-name').value=''; document.getElementById('device-type-modal').classList.add('active'); }
async function saveDeviceType() { const name=document.getElementById('device-type-name').value; if(!name)return; await fetch('/api/admin/device-types',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}); closeDeviceTypeModal(); loadDeviceTypes(); }
async function deleteDeviceType(id) { if(!confirm('Supprimer ?'))return; await fetch(`/api/admin/device-types/${id}`,{method:'DELETE'}); loadDeviceTypes(); }

async function loadEquipment() { const r=await fetch('/api/admin/equipment'); const d=await r.json(); document.getElementById('equipment-tbody').innerHTML=d.map(e=>`<tr><td><strong>${escapeHtml(e.name)}</strong></td><td>${escapeHtml(e.brand)}</td><td>${escapeHtml(e.device_type||'-')}</td><td><span class="badge badge-secondary">${escapeHtml(e.type)}</span></td><td style="text-align:right"><div class="table-actions"><button class="btn-icon-sm btn-icon-primary" onclick="openEquipmentModal(${e.id})"><i class="fas fa-pen"></i></button><button class="btn-icon-sm btn-icon-danger" onclick="deleteEquipment(${e.id})"><i class="fas fa-trash"></i></button></div></td></tr>`).join(''); }
async function openEquipmentModal(id=null) { 
  const form=document.getElementById('equipment-form'); form.reset(); document.getElementById('equipment-id').value=''; document.getElementById('equipment-modal-title').innerText='Ajouter Équipement';
  if(id){ const r=await fetch('/api/admin/equipment'); const d=await r.json(); const e=d.find(x=>x.id===id); if(e){ document.getElementById('equipment-id').value=e.id; document.getElementById('equipment-name').value=e.name; document.getElementById('equipment-brand').value=e.brand; document.getElementById('equipment-type').value=e.type; document.getElementById('equipment-device-type').value=e.device_type||''; document.getElementById('equipment-modal-title').innerText='Modifier'; }}
  document.getElementById('equipment-modal').classList.add('active'); 
}
async function saveEquipment() { const id=document.getElementById('equipment-id').value; const data={name:document.getElementById('equipment-name').value, brand:document.getElementById('equipment-brand').value, type:document.getElementById('equipment-type').value, device_type:document.getElementById('equipment-device-type').value}; await fetch(id?`/api/admin/equipment/${id}`:'/api/admin/equipment',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); closeEquipmentModal(); loadEquipment(); }
async function deleteEquipment(id) { if(!confirm('Supprimer ?'))return; await fetch(`/api/admin/equipment/${id}`,{method:'DELETE'}); loadEquipment(); }

async function loadMaterials() { 
  const r = await fetch('/api/admin/materials'); 
  const d = await r.json(); 
  
  document.getElementById('materials-tbody').innerHTML = d.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.name)}</strong></td>
      <td><code>${escapeHtml(m.product_code)}</code></td>
      <td>${parseFloat(m.unit_price).toFixed(2)} CHF</td>
      <td style="text-align:right">
        <div class="table-actions">
          <button class="btn-icon-sm btn-icon-primary" onclick="openMaterialModal(${m.id})"><i class="fas fa-pen"></i></button>
          <button class="btn-icon-sm btn-icon-danger" onclick="deleteMaterial(${m.id})"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join(''); 
}
async function openMaterialModal(id=null) { const form=document.getElementById('material-form'); form.reset(); document.getElementById('material-id').value=''; document.getElementById('material-modal-title').innerText='Ajouter Matériel'; if(id){ const r=await fetch('/api/admin/materials'); const d=await r.json(); const m=d.find(x=>x.id===id); if(m){ document.getElementById('material-id').value=m.id; document.getElementById('material-name').value=m.name; document.getElementById('material-code').value=m.product_code; document.getElementById('material-price').value=m.unit_price; document.getElementById('material-modal-title').innerText='Modifier'; }} document.getElementById('material-modal').classList.add('active'); }
async function saveMaterial() { const id=document.getElementById('material-id').value; const data={name:document.getElementById('material-name').value, product_code:document.getElementById('material-code').value, unit_price:document.getElementById('material-price').value}; await fetch(id?`/api/admin/materials/${id}`:'/api/admin/materials',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); closeMaterialModal(); loadMaterials(); }
async function deleteMaterial(id) { if(!confirm('Supprimer ?'))return; await fetch(`/api/admin/materials/${id}`,{method:'DELETE'}); loadMaterials(); }

function updateSelectOptions(eid, items) { const s=document.getElementById(eid); if(s) s.innerHTML='<option value="">--</option>'+items.map(i=>`<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}</option>`).join(''); }
function formatDate(s) { return s?new Date(s).toLocaleDateString('fr-CH'):'-'; }
function formatDateTime(s) { return s?new Date(s).toLocaleString('fr-CH'):'-'; }
function escapeHtml(t) { return t?t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):''; }