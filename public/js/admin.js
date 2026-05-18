// public/js/admin.js

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupTabs();
  await loadAllData();

  const safeAddListener = (id, event, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  };


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
  
  // EQUIPEMENTS
  safeAddListener('add-equipment-btn', 'click', () => openEquipmentModal());
  safeAddListener('cancel-equipment-btn', 'click', closeEquipmentModal);
  safeAddListener('save-equipment-btn', 'click', saveEquipment);
  
  // MATERIELS
  safeAddListener('add-material-btn', 'click', () => openMaterialModal());
  safeAddListener('cancel-material-btn', 'click', closeMaterialModal);
  safeAddListener('save-material-btn', 'click', saveMaterial);
  
  // Import / Delete All Materials
  safeAddListener('delete-all-materials-btn', 'click', async () => {
      if(confirm("ATTENTION : Vous allez supprimer TOUTE la liste de matériel.\n\nVoulez-vous continuer ?")) {
          try {
              const res = await fetch('/api/admin/materials/all', { method: 'DELETE' });
              const data = await res.json();
              if (data.success) {
                  showNotification('Liste vidée avec succès.', 'success');
                  loadMaterials();
              } else {
                  showNotification(data.error || 'Erreur serveur.', 'error');
              }
          } catch (e) { console.error(e); showNotification('Erreur de connexion.', 'error'); }
      }
  });

  const matInput = document.getElementById('import-material-input');
  if (matInput) {
      matInput.addEventListener('change', async (e) => {
          if (!e.target.files[0]) return;
          if(!confirm("Voulez-vous importer ce fichier CSV ?")) { e.target.value = ''; return; }

          const formData = new FormData();
          formData.append('file', e.target.files[0]);
          showNotification('Import en cours...', 'info');

          try {
              const res = await fetch('/api/admin/materials/import', { method: 'POST', body: formData });
              const data = await res.json();
              if (data.success) {
                  showNotification(`Succès ! Import terminé.`, 'success');
                  setTimeout(() => loadMaterials(), 1000); 
              } else { showNotification(data.error || "Erreur import", 'error'); }
          } catch (err) { console.error(err); showNotification("Erreur technique", 'error'); }
          e.target.value = ''; 
      });
  }
  
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
    
    window.currentUserId = data.user.id;
    window.currentUserRole = data.user.role;

    // --- STANDARDISATION DU ROLE ---
    let roleDisplay = "Technicien";
    if (data.user.role === "admin") roleDisplay = "Administrateur";
    else if (data.user.role === "validator" || data.user.role === "sales_director") roleDisplay = "Validateur";
    else if (data.user.role === "verifier" || data.user.role === "verificateur") roleDisplay = "Vérificateur";
    else if (data.user.role === "secretary") roleDisplay = "Secrétariat";

    let avatarHtml = `<div class="user-avatar">${data.user.name.charAt(0).toUpperCase()}</div>`;
    if(data.user.photo_url) avatarHtml = `<img src="${data.user.photo_url}" class="user-avatar-img" alt="avatar" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`;
    
    document.getElementById('user-info').innerHTML = `${avatarHtml}<div class="user-details"><strong>${escapeHtml(data.user.name)}</strong><span>${roleDisplay}</span></div>`;
    
    // --- GESTION DES PERMISSIONS D'AFFICHAGE ---
    if (data.user.role === 'admin') {
        // L'admin voit tout
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    } else {
        // Le technicien (non-admin) ne voit pas le menu Users.
        // On doit donc forcer l'onglet "Catalogue" à être actif par défaut au lieu de "Users" !
        document.querySelectorAll('.nav-text-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(c => c.classList.remove('active'));
        
        const eqBtn = document.getElementById('tab-btn-eq');
        if (eqBtn) eqBtn.classList.add('active');
        document.getElementById('tab-equipment').classList.add('active');
        
        // On cache aussi les boutons d'import/suppression de masse du matériel (Trop dangereux pour un tech)
        const btnDeleteAll = document.getElementById('delete-all-materials-btn');
        if(btnDeleteAll) btnDeleteAll.style.display = 'none';
    }

  } catch { window.location.href = '/login.html'; }
}

function setupTabs() {
  const btns = document.querySelectorAll('#admin-tabs .nav-text-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view-section').forEach(c => c.classList.remove('active'));
      const targetId = `tab-${btn.dataset.tab}`;
      const target = document.getElementById(targetId);
      if (target) target.classList.add('active');

      if (btn.dataset.tab === 'contract-prices') loadContractPrices();
      if (btn.dataset.tab === 'materials') { loadMaterials(); loadBexioStatus(); }
      if (btn.dataset.tab === 'logs') loadLogs(); // ← AJOUTE CETTE LIGNE
    });
  });
}

let cpBrandsCache = [];

async function loadCpBrands() {
  if (cpBrandsCache.length) return cpBrandsCache;
  const data = await fetch('/api/admin/equipment').then(r => r.json());
  // Marques uniques triées
  cpBrandsCache = [...new Set(data.map(e => e.brand).filter(Boolean))].sort();
  return cpBrandsCache;
}

// ── Charge les marques dans le select ────────────────────────────────
async function loadCpBrandSelect() {
  await loadCpEquipmentCache();
  const sel    = document.getElementById('cp-brand-select');
  const brands = [...new Set(cpEquipmentCache.map(e => e.brand).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">-- Sélectionner une marque --</option>' +
    brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

  sel.onchange = function() {
    const brand = this.value;
    const wrapper = document.getElementById('cp-models-wrapper');
    const list    = document.getElementById('cp-models-list');

    if (!brand) {
      wrapper.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    // Filtre les modèles de cette marque
    const models = cpEquipmentCache.filter(e => e.brand === brand);
    list.innerHTML = models.map(m => `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;
        border-bottom:1px solid var(--border-primary);cursor:pointer;
        transition:background 0.1s;" onmouseover="this.style.background='var(--bg-secondary)'"
        onmouseout="this.style.background='transparent'">
        <input type="checkbox" class="cp-model-cb"
          data-id="${m.id}" data-brand="${escapeHtml(m.brand)}" data-model="${escapeHtml(m.name)}"
          style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer;">
        <div>
          <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary)">
            ${escapeHtml(m.name)}
          </div>
          ${m.brand ? `<div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(m.brand)}</div>` : ''}
        </div>
      </label>`).join('');

    wrapper.style.display = 'block';
  };
}

function cpSelectAllModels(checked) {
  document.querySelectorAll('.cp-model-cb').forEach(cb => cb.checked = checked);
}

async function loadCpModels(brand) {
  const sel = document.getElementById('cp-model');
  sel.innerHTML = '<option value="">-- Toute la marque --</option>';
  if (!brand) return;
  const data = await fetch('/api/admin/equipment').then(r => r.json());
  const models = data.filter(e => e.brand === brand).map(e => e.name);
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  });
}

async function loadAllData() {
  await Promise.all([loadSectors(), loadDeviceTypes(), loadRoles()]);
  await Promise.all([loadUsers(), loadEquipment(), loadMaterials(), loadLogs()]);
}

// ========== ROLES, LOGS, USERS (inchangés) ==========
async function loadRoles() {
  try {
    const r = await fetch('/api/admin/roles'); const roles = await r.json();
    document.getElementById('roles-tbody').innerHTML = roles.map(role => `<tr><td><strong>${escapeHtml(role.name)}</strong></td><td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.85em; color:var(--neutral-600);">${role.slug}</code></td><td><div style="font-size:0.85rem; color:#64748b; max-width:400px; white-space:normal; line-height:1.4;">${role.permissions ? role.permissions.replace(/,/g, ', ') : '-'}</div></td><td style="text-align:right;"><div class="table-actions"><button class="btn-icon-sm btn-icon-primary" onclick="openRoleModal('${role.slug}', '${escapeHtml(role.name)}', '${role.permissions}')"><i class="fas fa-pen"></i></button><button class="btn-icon-sm btn-icon-danger" onclick="deleteRole('${role.slug}')"><i class="fas fa-trash"></i></button></div></td></tr>`).join('');
    const select = document.getElementById('user-role'); select.innerHTML = roles.map(r => `<option value="${r.slug}">${r.name}</option>`).join('');
  } catch(e) { console.error(e); }
}

function openRoleModal(slug = null, name = '', permissions = '') {
  const container = document.getElementById('permissions-container'); container.innerHTML = '';
  const userPerms = permissions ? permissions.split(',') : [];
  AVAILABLE_PERMISSIONS.forEach(perm => {
    const checked = userPerms.includes(perm.key) ? 'checked' : '';
    container.innerHTML += `<div class="perm-item"><input type="checkbox" id="perm-${perm.key}" value="${perm.key}" ${checked}><label for="perm-${perm.key}">${perm.label}</label></div>`;
  });
  if (slug) { document.getElementById('role-modal-title').innerHTML = '<i class="fas fa-edit"></i> Modifier le rôle'; document.getElementById('role-slug-original').value = slug; document.getElementById('role-name').value = name; } 
  else { document.getElementById('role-modal-title').innerHTML = '<i class="fas fa-plus-circle"></i> Nouveau rôle'; document.getElementById('role-slug-original').value = ''; document.getElementById('role-name').value = ''; }
  document.getElementById('role-modal').classList.add('active');
}
async function saveRole() {
  const name = document.getElementById('role-name').value; const slugOriginal = document.getElementById('role-slug-original').value;
  const checkboxes = document.querySelectorAll('#permissions-container input[type="checkbox"]:checked');
  const permissions = Array.from(checkboxes).map(cb => cb.value).join(',');
  if(!name) return;
  try {
    let url = '/api/admin/roles'; let method = 'POST';
    if(slugOriginal) { url = `/api/admin/roles/${slugOriginal}`; method = 'PUT'; }
    const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, permissions }) });
    if(res.ok) { showNotification('Rôle enregistré', 'success'); closeRoleModal(); loadRoles(); } else { const err = await res.json(); showNotification(err.error, 'error'); }
  } catch(e) { console.error(e); }
}
async function deleteRole(slug) {
    const ok = await confirmDelete('ce rôle');
    if (!ok) return;
    const res = await fetch(`/api/admin/roles/${slug}`, { method: 'DELETE' });
    if (res.ok) { loadRoles(); if (window.toast) toast.success('Rôle supprimé', ''); }
}

async function loadLogs(category='all') {
    let url = '/api/admin/logs?limit=100'; if(category!=='all') url+=`&category=${category}`;
    const r=await fetch(url); const logs=await r.json();
    document.getElementById('logs-tbody').innerHTML=logs.length?logs.map(l=>`<tr><td style="color:#64748b; font-size:0.85em;">${formatDateTime(l.created_at)}</td><td><div style="display:flex; align-items:center; gap:8px;"><div class="user-avatar-sm" style="width:24px; height:24px; font-size:0.7em;">${(l.user_name||'S').charAt(0)}</div><span style="font-weight:600; font-size:0.9em;">${escapeHtml(l.user_name||'Système')}</span></div></td><td><span class="badge badge-secondary" style="font-weight:500;">${l.action}</span></td><td>${l.entity}</td><td><code style="font-size:0.85em; color:var(--neutral-500);">${l.entity_id||'-'}</code></td></tr>`).join(''):'<tr><td colspan="5">Aucun log.</td></tr>';
}
async function filterLogs(cat, btn) { document.querySelectorAll('.log-filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); await loadLogs(cat); }

async function loadUsers() {
    const r=await fetch('/api/admin/users'); const users=await r.json();
    document.getElementById('users-tbody').innerHTML=users.map(u=>`<tr><td><div style="display:flex; align-items:center; gap:10px;">${u.photo_url?`<img src="${u.photo_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`:`<div class="user-avatar-sm">${u.name.charAt(0)}</div>`}<span style="font-weight:600;">${escapeHtml(u.name)}</span></div></td><td>${escapeHtml(u.email)}</td><td><span class="badge badge-info">${u.role}</span></td><td>${escapeHtml(u.phone||'-')}</td><td><span class="badge ${u.is_active?'badge-success':'badge-danger'}">${u.is_active?'Actif':'Inactif'}</span></td><td style="text-align:right;"><div class="table-actions"><button class="btn-icon-sm btn-icon-primary" onclick="openUserModal(${u.id})"><i class="fas fa-pen"></i></button><button class="btn-icon-sm btn-icon-secondary" onclick="openResetModal(${u.id})"><i class="fas fa-key"></i></button><button class="btn-icon-sm btn-icon-danger" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button></div></td></tr>`).join('');
}
async function openUserModal(id=null){ 
    const form=document.getElementById('user-form'); 
    form.reset();
    document.getElementById('user-active').checked = true; // Actif par défaut
    document.getElementById('user-id').value=''; document.getElementById('password-group').style.display='block'; document.getElementById('user-password').required=true; document.getElementById('user-modal-title').innerHTML='<i class="fas fa-user-plus"></i> Ajouter'; await loadRoles();
    if(id){const r=await fetch('/api/admin/users');const users=await r.json();const u=users.find(x=>x.id===id);if(u){document.getElementById('user-id').value=u.id;document.getElementById('user-name').value=u.name;document.getElementById('user-email').value=u.email;document.getElementById('user-role').value=u.role;document.getElementById('user-phone').value=u.phone||'';document.getElementById('user-active').checked=!!u.is_active;document.getElementById('password-group').style.display='none';document.getElementById('user-password').required=false;document.getElementById('user-modal-title').innerHTML='<i class="fas fa-user-edit"></i> Modifier';}}
    document.getElementById('user-modal').classList.add('active'); 
}
async function saveUser() {
    const id = document.getElementById('user-id').value;
    const formData = new FormData();

    formData.append('name',      document.getElementById('user-name').value);
    formData.append('email',     document.getElementById('user-email').value);
    formData.append('role',      document.getElementById('user-role').value);
    formData.append('phone',     document.getElementById('user-phone').value);
    // Force explicitement 1 ou 0 (pas de boolean JS)
    formData.append('is_active', document.getElementById('user-active').checked ? '1' : '0');

    const fileInput = document.getElementById('user-photo');
    if (fileInput && fileInput.files.length > 0) {
        formData.append('photo', fileInput.files[0]);
    }

    if (!id) {
        const pwd = document.getElementById('user-password').value;
        if (pwd.length < 6) {
            if (window.toast) toast.error('Erreur', 'Mot de passe trop court (6 caractères min.)');
            return;
        }
        formData.append('password', pwd);
    }

    try {
        const url = id ? `/api/admin/users/${id}` : '/api/admin/users';
        const res = await fetch(url, { method: id ? 'PUT' : 'POST', body: formData });
        const data = await res.json();

        if (res.ok) {
            if (window.toast) toast.success(id ? 'Utilisateur modifié' : 'Utilisateur créé', '');
            closeUserModal();
            loadUsers();
        } else {
            if (window.toast) toast.error('Erreur', data.error || 'Impossible de sauvegarder.');
            console.error('saveUser error:', data);
        }
    } catch (e) {
        console.error('saveUser exception:', e);
        if (window.toast) toast.error('Erreur réseau', 'Connexion au serveur impossible.');
    }
}
async function deleteUser(id) {
    if (id === window.currentUserId) {
        if (window.toast) toast.error('Impossible', 'Vous ne pouvez pas supprimer votre propre compte.');
        return;
    }
    const ok = await confirmDelete('cet utilisateur');
    if (!ok) return;

    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
        loadUsers();
        if (window.toast) toast.success('Supprimé', 'Utilisateur supprimé.');
    } else {
        const err = await res.json();
        if (window.toast) toast.error('Erreur', err.error || 'Suppression impossible.');
    }
}
function openResetModal(id){document.getElementById('reset-user-id').value=id;document.getElementById('new-password').value='';document.getElementById('reset-password-modal').classList.add('active');}
async function confirmResetPassword(){const id=document.getElementById('reset-user-id').value;const password=document.getElementById('new-password').value;if(password.length<6)return showNotification('Trop court','warning');const res=await fetch(`/api/admin/users/${id}/reset-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});if(res.ok){showNotification('Réinitialisé','success');closeResetModal();}else{showNotification('Erreur','error');}}

// ========== SECTORS, DEVICES ==========
async function loadSectors(){const r=await fetch('/api/admin/sectors');const d=await r.json();document.getElementById('sectors-tbody').innerHTML=d.map(s=>`<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${s.slug}</td><td style="text-align:right"><button class="btn-icon-sm btn-icon-danger" onclick="deleteSector(${s.id})"><i class="fas fa-trash"></i></button></td></tr>`).join('');updateSelectOptions('equipment-type',d);}
function openSectorModal(){document.getElementById('sector-name').value='';document.getElementById('sector-modal').classList.add('active');}
async function saveSector(){const n=document.getElementById('sector-name').value;if(!n)return;await fetch('/api/admin/sectors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})});closeSectorModal();loadSectors();}
async function deleteSector(id) {
    const ok = await confirmDelete('ce secteur');
    if (!ok) return;
    await fetch(`/api/admin/sectors/${id}`, { method: 'DELETE' });
    loadSectors();
}
async function loadDeviceTypes(){const r=await fetch('/api/admin/device-types');const d=await r.json();document.getElementById('device-types-tbody').innerHTML=d.map(t=>`<tr><td><strong>${escapeHtml(t.name)}</strong></td><td style="text-align:right"><button class="btn-icon-sm btn-icon-danger" onclick="deleteDeviceType(${t.id})"><i class="fas fa-trash"></i></button></td></tr>`).join('');updateSelectOptions('equipment-device-type',d);}
function openDeviceTypeModal(){document.getElementById('device-type-name').value='';document.getElementById('device-type-modal').classList.add('active');}
async function saveDeviceType(){const n=document.getElementById('device-type-name').value;if(!n)return;await fetch('/api/admin/device-types',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})});closeDeviceTypeModal();loadDeviceTypes();}
async function deleteDeviceType(id) {
    const ok = await confirmDelete("ce type d'appareil");
    if (!ok) return;
    await fetch(`/api/admin/device-types/${id}`, { method: 'DELETE' });
    loadDeviceTypes();
}

// ========== EQUIPMENT (CORRIGÉ & COMPLET) ==========
async function loadEquipment() { 
  const r = await fetch('/api/admin/equipment'); 
  const d = await r.json(); 
  
  document.getElementById('equipment-tbody').innerHTML = d.map(e => {
      // Badge visuel si secondaire
      const badgeSec = e.is_secondary 
        ? '<span class="badge" style="background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd;">Secondaire</span>' 
        : '';
        
      return `<tr>
        <td>
            <strong>${escapeHtml(e.name)}</strong>
            ${badgeSec}
        </td>
        <td>${escapeHtml(e.brand)}</td>
        <td>${escapeHtml(e.device_type||'-')}</td>
        <td><span class="badge badge-secondary">${escapeHtml(e.type)}</span></td>
        <td style="text-align:right">
            <div class="table-actions">
                <button class="btn-icon-sm btn-icon-primary" onclick="openEquipmentModal(${e.id})"><i class="fas fa-pen"></i></button>
                <button class="btn-icon-sm btn-icon-danger" onclick="deleteEquipment(${e.id})"><i class="fas fa-trash"></i></button>
            </div>
        </td>
      </tr>`;
  }).join(''); 
}

async function openEquipmentModal(id=null) { 
  const form = document.getElementById('equipment-form'); 
  form.reset(); 
  document.getElementById('equipment-id').value = ''; 
  
  // 1. On vide le champ allemand par défaut (en cas de nouveau modèle)
  const nameDeInput = document.getElementById('equipment-name-de');
  if (nameDeInput) nameDeInput.value = '';

  // Reset de la case à cocher
  const checkSec = document.getElementById('equipment-secondary');
  if(checkSec) checkSec.checked = false;

  document.getElementById('equipment-modal-title').innerText = 'Ajouter Équipement';
  
  if(id){ 
      const r = await fetch('/api/admin/equipment'); 
      const d = await r.json(); 
      const e = d.find(x => x.id === id); 
      if(e){ 
          document.getElementById('equipment-id').value = e.id; 
          document.getElementById('equipment-name').value = e.name; 
          
          // 2. C'EST SEULEMENT ICI QUE "e" EXISTE ! On remplit le champ allemand :
          if (nameDeInput) nameDeInput.value = e.name_de || '';
          
          document.getElementById('equipment-brand').value = e.brand; 
          document.getElementById('equipment-type').value = e.type; 
          document.getElementById('equipment-device-type').value = e.device_type || ''; 
          
          // Cocher la case si c'est un secondaire
          if(checkSec) checkSec.checked = (e.is_secondary === 1);
          
          document.getElementById('equipment-modal-title').innerText = 'Modifier'; 
      }
  }
  document.getElementById('equipment-modal').classList.add('active'); 
}

async function saveEquipment() { 
  const id = document.getElementById('equipment-id').value; 
  
  // Récupération de la valeur de la case
  const checkSec = document.getElementById('equipment-secondary');
  const isSecondary = checkSec && checkSec.checked ? 1 : 0;
  
  // Récupération du champ allemand
  const nameDeInput = document.getElementById('equipment-name-de');

  const data = {
      name: document.getElementById('equipment-name').value, 
      name_de: nameDeInput ? nameDeInput.value : null, // Envoi du nom en allemand
      brand: document.getElementById('equipment-brand').value, 
      type: document.getElementById('equipment-type').value, 
      device_type: document.getElementById('equipment-device-type').value,
      is_secondary: isSecondary 
  }; 
  
  const res = await fetch(id ? `/api/admin/equipment/${id}` : '/api/admin/equipment', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
  }); 
  
  if(res.ok){
      closeEquipmentModal(); 
      loadEquipment();
      showNotification('Enregistré', 'success');
  } else {
      const e = await res.json();
      showNotification(e.error || 'Erreur', 'error');
  } 
}

async function deleteEquipment(id) {
    const ok = await confirmDelete('cet équipement du catalogue');
    if (!ok) return;

    const res = await fetch(`/api/admin/equipment/${id}`, { method: 'DELETE' });
    if (res.ok) {
        loadEquipment();
        if (window.toast) toast.success('Supprimé', 'Équipement supprimé du catalogue.');
    } else {
        const err = await res.json();
        if (window.toast) toast.error('Erreur', err.error || 'Suppression impossible.');
    }
}

let cpMaterialsList = [];
let cpEquipmentCache = [];

async function loadCpEquipmentCache() {
  if (cpEquipmentCache.length) return;
  const data = await fetch('/api/admin/equipment').then(r => r.json());
  cpEquipmentCache = data.sort((a, b) =>
    `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`)
  );
}

let selectedContractPrices = new Set();
let allContractPrices      = []; // cache local pour les filtres
 
async function loadContractPrices() {
  try {
    allContractPrices = await fetch('/api/contract-prices').then(r => r.json());
    selectedContractPrices.clear();
    renderContractPrices();
  } catch (e) { console.error(e); }
}

function renderContractPrices() {
  const tbody    = document.getElementById('contract-prices-tbody');
  const toolbar  = document.getElementById('cp-bulk-toolbar');
  const countEl  = document.getElementById('cp-selected-count');
  if (!tbody) return;
 
  // ── Applique les filtres ──────────────────────────────────────────────────
  const searchBrand     = (document.getElementById('cp-filter-brand')?.value     || '').toLowerCase();
  const searchModel     = (document.getElementById('cp-filter-model')?.value     || '').toLowerCase();
  const searchMaterial  = (document.getElementById('cp-filter-material')?.value  || '').toLowerCase();
 
  const filtered = allContractPrices.filter(r => {
    if (searchBrand    && !(r.brand         || '').toLowerCase().includes(searchBrand))    return false;
    if (searchModel    && !(r.model         || '').toLowerCase().includes(searchModel))    return false;
    if (searchMaterial && !(r.material_name || '').toLowerCase().includes(searchMaterial)) return false;
    return true;
  });
 
  // ── Toolbar bulk ──────────────────────────────────────────────────────────
  if (toolbar) {
    toolbar.style.display = selectedContractPrices.size > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = selectedContractPrices.size;
  }
 
  // ── Tableau vide ──────────────────────────────────────────────────────────
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"
      style="text-align:center;padding:40px;color:var(--text-tertiary)">
      Aucun tarif trouvé.
    </td></tr>`;
    return;
  }
 
  // ── Rendu des lignes ──────────────────────────────────────────────────────
  tbody.innerHTML = filtered.map(r => {
    const checked = selectedContractPrices.has(r.id) ? 'checked' : '';
    return `
      <tr id="cp-row-${r.id}"
        style="${selectedContractPrices.has(r.id) ? 'background:rgba(44,90,160,0.06);' : ''}">
        <td style="padding:10px 14px;width:36px;">
          <input type="checkbox" class="cp-cb" data-id="${r.id}" ${checked}
            style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer;"
            onchange="toggleCpSelection(${r.id}, this)">
        </td>
        <td style="padding:10px 14px;font-weight:600;color:var(--text-primary)">
          ${escapeHtml(r.brand)}
        </td>
        <td style="padding:10px 14px;color:var(--text-secondary)">
          ${r.model
            ? escapeHtml(r.model)
            : '<span style="color:var(--text-tertiary);font-style:italic">Toute la marque</span>'}
        </td>
        <td style="padding:10px 14px;color:var(--text-secondary)">
          ${escapeHtml(r.material_name)}
        </td>
        <td style="padding:10px 14px;font-family:var(--font-mono);font-size:var(--text-xs);
          color:var(--color-primary)">
          ${r.product_code || '—'}
        </td>
        <td style="padding:10px 14px;text-align:right;font-weight:700;color:var(--text-primary)">
          ${parseFloat(r.price || 0).toFixed(2)}
        </td>
        <td style="padding:10px 14px;font-size:var(--text-xs);color:var(--text-tertiary)">
          ${r.notes || '—'}
        </td>
        <td style="padding:10px 14px;text-align:right">
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick="openContractPriceModal(${r.id})">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteContractPrice(${r.id})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
 
  // Mise à jour "Tout sélectionner"
  const selectAll = document.getElementById('cp-select-all');
  if (selectAll) {
    const allIds = filtered.map(r => r.id);
    selectAll.checked       = allIds.length > 0 && allIds.every(id => selectedContractPrices.has(id));
    selectAll.indeterminate = !selectAll.checked && allIds.some(id => selectedContractPrices.has(id));
  }
}

// ── Sélection individuelle ────────────────────────────────────────────────────
window.toggleCpSelection = function(id, cb) {
  if (cb.checked) selectedContractPrices.add(id);
  else            selectedContractPrices.delete(id);

  // Met à jour seulement la ligne — pas tout le tableau
  const row = document.getElementById(`cp-row-${id}`);
  if (row) {
    row.style.background = cb.checked ? 'rgba(44,90,160,0.06)' : '';
  }

  // Met à jour le toolbar et la case "Tout sélectionner"
  const toolbar  = document.getElementById('cp-bulk-toolbar');
  const countEl  = document.getElementById('cp-selected-count');
  const selectAll = document.getElementById('cp-select-all');

  if (toolbar)  toolbar.style.display = selectedContractPrices.size > 0 ? 'flex' : 'none';
  if (countEl)  countEl.textContent   = selectedContractPrices.size;

  if (selectAll) {
    const allCbs = [...document.querySelectorAll('.cp-cb')];
    const allChecked = allCbs.every(c => c.checked);
    const someChecked = allCbs.some(c => c.checked);
    selectAll.checked       = allChecked;
    selectAll.indeterminate = !allChecked && someChecked;
  }
};
 
// ── Tout sélectionner / désélectionner ───────────────────────────────────────
window.toggleAllCpSelection = function(cb) {
  document.querySelectorAll('.cp-cb').forEach(box => {
    const id = parseInt(box.dataset.id);
    if (cb.checked) selectedContractPrices.add(id);
    else            selectedContractPrices.delete(id);
  });
  renderContractPrices();
};
 
// ── Suppression en masse ──────────────────────────────────────────────────────
window.deleteBulkContractPrices = async function() {
  const ids = [...selectedContractPrices];
  if (!ids.length) return;
 
  const ok = await confirmDelete(`ces ${ids.length} tarif(s)`);
  if (!ok) return;
 
  try {
    const res = await fetch('/api/contract-prices/bulk', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids })
    });
    const d = await res.json();
    if (res.ok) {
      selectedContractPrices.clear();
      await loadContractPrices();
      if (window.toast) toast.success('Supprimés', `${d.count} tarif(s) supprimé(s).`);
    } else {
      if (window.toast) toast.error('Erreur', d.error || 'Suppression impossible.');
    }
  } catch (e) { console.error(e); }
};
 
// ── Réinitialise les filtres ──────────────────────────────────────────────────
window.clearCpFilters = function() {
  ['cp-filter-brand', 'cp-filter-model', 'cp-filter-material'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderContractPrices();
};
 
// ── Ouvre le modal ───────────────────────────────────────────────────
async function openContractPriceModal(id = null) {
  // Matériaux
  if (!cpMaterialsList.length) {
    cpMaterialsList = await fetch('/api/contract-prices/materials-list').then(r => r.json());
  }

  // Remplit le select prestations
  const sel = document.getElementById('cp-material-id');
  sel.innerHTML = '<option value="">-- Sélectionner une prestation --</option>' +
    cpMaterialsList.map(m => {
      const code  = m.product_code || '';
      const price = parseFloat(m.unit_price ?? m.price ?? m.prix ?? m.tarif ?? 0);
      const label = `${code ? '[' + code + '] ' : ''}${m.name} — ${price.toFixed(2)} CHF`;
      return `<option value="${m.id}"
        data-name="${escapeHtml(m.name)}"
        data-code="${escapeHtml(code)}"
        data-price="${price}">${escapeHtml(label)}</option>`;
    }).join('');

  // Aperçu prestation
  sel.onchange = function() {
    const opt     = this.options[this.selectedIndex];
    const preview = document.getElementById('cp-material-preview');
    if (!preview) return;
    if (opt && opt.value) {
      const code  = opt.dataset.code  || '—';
      const price = parseFloat(opt.dataset.price || 0);
      preview.style.cssText = 'display:flex;gap:8px;align-items:center;' +
        'padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-primary);' +
        'border-radius:3px;font-size:var(--text-xs);margin-top:6px;';
      preview.innerHTML = `
        <span style="font-family:var(--font-mono);background:var(--bg-tertiary);
          padding:1px 6px;border-radius:2px;color:var(--color-primary);font-size:11px;">
          ${escapeHtml(code)}
        </span>
        <span>${escapeHtml(opt.dataset.name || '—')}</span>
        <strong style="margin-left:auto;">${price.toFixed(2)} CHF</strong>`;
    } else {
      preview.style.display = 'none';
    }
  };

  // Reset
  document.getElementById('cp-id').value    = id || '';
  document.getElementById('cp-notes').value = '';
  sel.value = '';
  document.getElementById('cp-models-wrapper').style.display = 'none';
  document.getElementById('cp-models-list').innerHTML = '';
  const preview = document.getElementById('cp-material-preview');
  if (preview) preview.style.display = 'none';
  document.getElementById('cp-modal-title').textContent = id ? 'Modifier le tarif' : 'Nouveau tarif';

  // Charge les marques
  await loadCpBrandSelect();

  // Si édition : pré-sélectionne
  if (id) {
  try {
    const rows = await fetch('/api/contract-prices').then(r => r.json());
    const row  = rows.find(r => r.id === id);
    if (row) {
      // ── Prestation ─────────────────────────────────────────────────
      // String() car les valeurs d'option sont des strings
      sel.value = String(row.material_id || '');
      sel.dispatchEvent(new Event('change'));

      // ── Notes ──────────────────────────────────────────────────────
      document.getElementById('cp-notes').value = row.notes || '';

      // ── Marque → modèles ───────────────────────────────────────────
      const brandSel = document.getElementById('cp-brand-select');

      // Trouve la marque correspondante (comparaison insensible à la casse)
      const matchingBrand = [...brandSel.options].find(
        opt => opt.value.toLowerCase().trim() === (row.brand || '').toLowerCase().trim()
      );
      if (matchingBrand) {
        brandSel.value = matchingBrand.value;
      }
      brandSel.dispatchEvent(new Event('change'));

      // Attend que les checkboxes soient rendus
      await new Promise(r => setTimeout(r, 100));

      // Coche le bon modèle
      document.querySelectorAll('.cp-model-cb').forEach(cb => {
        const cbBrand = cb.dataset.brand?.toLowerCase().trim();
        const cbModel = cb.dataset.model?.toLowerCase().trim();
        const rowBrand = (row.brand || '').toLowerCase().trim();
        const rowModel = (row.model || '').toLowerCase().trim();
        if (cbBrand === rowBrand && cbModel === rowModel) {
          cb.checked = true;
        }
      });
    }
  } catch(e) { console.error('openContractPriceModal edit:', e); }
}

  document.getElementById('contract-price-modal').classList.add('active');
}
 
function closeContractPriceModal() {
  document.getElementById('contract-price-modal').classList.remove('active');
}
 
// ── Sauvegarde ───────────────────────────────────────────────────────
async function saveContractPrice() {
  const id          = document.getElementById('cp-id').value;
  const material_id = document.getElementById('cp-material-id').value;
  const notes       = document.getElementById('cp-notes').value.trim() || null;
  const checked     = Array.from(document.querySelectorAll('.cp-model-cb:checked'));

  if (!material_id) {
    if (window.toast) toast.error('Erreur', 'Sélectionne une prestation du catalogue.');
    return;
  }
  if (!checked.length) {
    if (window.toast) toast.error('Erreur', 'Coche au moins un modèle.');
    return;
  }

  try {
    if (id) {
      // ── Modification : met à jour l'entrée existante ────────────────
      const cb  = checked[0];
      const res = await fetch(`/api/contract-prices/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          brand:       cb.dataset.brand,
          model:       cb.dataset.model,
          material_id: parseInt(material_id),
          notes
        })
      });
      if (!res.ok) throw new Error('PUT failed');

      // Crée les lignes supplémentaires si plusieurs modèles cochés
      if (checked.length > 1) {
        await Promise.all(checked.slice(1).map(cb =>
          fetch('/api/contract-prices', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              brand:       cb.dataset.brand,
              model:       cb.dataset.model,
              material_id: parseInt(material_id),
              notes
            })
          })
        ));
      }
    } else {
      // ── Création : une ligne par modèle coché ───────────────────────
      const results = await Promise.all(checked.map(cb =>
        fetch('/api/contract-prices', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            brand:       cb.dataset.brand,
            model:       cb.dataset.model,
            material_id: parseInt(material_id),
            notes
          })
        })
      ));
      if (results.some(r => !r.ok)) throw new Error('POST failed');
    }

    closeContractPriceModal();
    loadContractPrices();
    if (window.toast) toast.success(
      id ? 'Tarif modifié' : `${checked.length} tarif(s) créé(s)`,
      checked.map(cb => cb.dataset.model).join(', ')
    );
  } catch(e) {
    console.error(e);
    if (window.toast) toast.error('Erreur', 'Impossible de sauvegarder.');
  }
}
 
async function deleteContractPrice(id) {
  const ok = await confirmDelete('ce tarif contractuel');
  if (!ok) return;
  try {
    const res = await fetch(`/api/contract-prices/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadContractPrices();
      if (window.toast) toast.success('Tarif supprimé', '');
    }
  } catch (e) { console.error(e); }
}

// ========== MATERIALS ==========
async function loadMaterials() {
  const r = await fetch('/api/admin/materials');
  const d = await r.json();

  document.getElementById('materials-tbody').innerHTML = d.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.name)}</strong></td>
      <td>
        <code>${escapeHtml(m.product_code)}</code>
        ${m.bexio_id
          ? `<span title="Synchronisé depuis Bexio #${m.bexio_id}"
               style="color:var(--color-success);font-size:10px;margin-left:6px;">
               <i class="fas fa-link"></i>
             </span>`
          : ''}
      </td>
      <td>${parseFloat(m.unit_price).toFixed(2)} CHF</td>
      <td style="text-align:right">
        <div class="table-actions">
          <button class="btn-icon-sm btn-icon-primary" onclick="openMaterialModal(${m.id})">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn-icon-sm btn-icon-danger" onclick="deleteMaterial(${m.id})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function openMaterialModal(id=null){const form=document.getElementById('material-form');form.reset();document.getElementById('material-id').value='';document.getElementById('material-modal-title').innerText='Ajouter';if(id){const r=await fetch('/api/admin/materials');const d=await r.json();const m=d.find(x=>x.id===id);if(m){document.getElementById('material-id').value=m.id;document.getElementById('material-name').value=m.name;document.getElementById('material-code').value=m.product_code;document.getElementById('material-price').value=m.unit_price;document.getElementById('material-modal-title').innerText='Modifier';}}document.getElementById('material-modal').classList.add('active');}
async function saveMaterial(){const id=document.getElementById('material-id').value;const data={name:document.getElementById('material-name').value,product_code:document.getElementById('material-code').value,unit_price:document.getElementById('material-price').value};const res=await fetch(id?`/api/admin/materials/${id}`:'/api/admin/materials',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(res.ok){closeMaterialModal();loadMaterials();showNotification('Enregistré','success');}else{showNotification('Erreur','error');}}
async function deleteMaterial(id) {
    const ok = await confirmDelete('ce matériel');
    if (!ok) return;
    const res = await fetch(`/api/admin/materials/${id}`, { method: 'DELETE' });
    if (res.ok) { loadMaterials(); if (window.toast) toast.success('Supprimé', ''); }
    else { if (window.toast) toast.error('Erreur', 'Suppression impossible.'); }
}


function updateSelectOptions(eid,items){const s=document.getElementById(eid);if(s)s.innerHTML='<option value="">--</option>'+items.map(i=>`<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}</option>`).join('');}
function formatDate(s){return s?new Date(s).toLocaleDateString('fr-CH'):'-';}
function formatDateTime(s){return s?new Date(s).toLocaleString('fr-CH'):'-';}
function escapeHtml(t){return t?t.toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):'';}

async function loadBexioStatus() {
  try {
    const res  = await fetch('/api/bexio/status');
    if (!res.ok) return;
    const data = await res.json();
 
    const el = document.getElementById('bexio-last-sync');
    if (!el) return;
 
    if (!data.token_configured) {
      el.innerHTML = '<span style="color:var(--color-danger)"><i class="fas fa-times-circle"></i> Token non configuré</span>';
      return;
    }
 
    if (data.last_sync) {
      const dt = new Date(data.last_sync);
      el.innerHTML = `<i class="fas fa-check-circle" style="color:var(--color-success)"></i>
        Dernière sync : ${dt.toLocaleDateString('fr-CH')} à ${dt.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}
        · ${data.synced_materials} articles Bexio`;
    } else {
      el.innerHTML = '<i class="fas fa-info-circle" style="color:var(--color-info)"></i> Jamais synchronisé';
    }
  } catch (e) { console.error('Bexio status:', e); }
}
 
async function triggerBexioSync() {
  const btn  = document.getElementById('bexio-sync-btn');
  const icon = document.getElementById('bexio-sync-icon');
 
  if (!btn) return;
 
  // Spinner
  btn.disabled   = true;
  icon.className = 'fas fa-spinner fa-spin';
  if (window.toast) toast.info?.('Synchronisation', 'Connexion à Bexio...');
 
  try {
    const res    = await fetch('/api/bexio/sync', { method: 'POST' });
    const result = await res.json();
 
    if (res.ok && result.success) {
      if (window.toast) toast.success('Bexio synchronisé', result.message);
      loadMaterials();     // Recharge le tableau
      loadBexioStatus();   // Met à jour le statut
    } else {
      if (window.toast) toast.error('Erreur Bexio', result.error || 'Synchronisation échouée.');
    }
  } catch (e) {
    console.error(e);
    if (window.toast) toast.error('Erreur réseau', 'Impossible de contacter le serveur.');
  } finally {
    btn.disabled   = false;
    icon.className = 'fas fa-sync-alt';
  }
}