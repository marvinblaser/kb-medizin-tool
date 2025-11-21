/**
 * KB Medizin Technik - Administration
 */

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupTabs();
  await loadAllData();

  document.getElementById('logout-btn').addEventListener('click', logout);

  // Users
  document.getElementById('add-user-btn').addEventListener('click', () => openUserModal());
  document.getElementById('cancel-user-btn').addEventListener('click', closeUserModal);
  document.getElementById('save-user-btn').addEventListener('click', saveUser);
  document.getElementById('cancel-reset-btn').addEventListener('click', closeResetModal);
  document.getElementById('confirm-reset-btn').addEventListener('click', confirmResetPassword);

  // Sectors
  document.getElementById('add-sector-btn').addEventListener('click', openSectorModal);
  document.getElementById('cancel-sector-btn').addEventListener('click', closeSectorModal);
  document.getElementById('save-sector-btn').addEventListener('click', saveSector);

  // Equipment
  document.getElementById('add-equipment-btn').addEventListener('click', () => openEquipmentModal());
  document.getElementById('cancel-equipment-btn').addEventListener('click', closeEquipmentModal);
  document.getElementById('save-equipment-btn').addEventListener('click', saveEquipment);

  document.getElementById('add-material-btn').addEventListener('click', () => openMaterialModal());
  document.getElementById('cancel-material-btn').addEventListener('click', closeMaterialModal);
  document.getElementById('save-material-btn').addEventListener('click', saveMaterial);
});

function closeUserModal() { document.getElementById('user-modal').classList.remove('active'); }
function closeSectorModal() { document.getElementById('sector-modal').classList.remove('active'); }
function closeEquipmentModal() { document.getElementById('equipment-modal').classList.remove('active'); }
function closeResetModal() { document.getElementById('reset-password-modal').classList.remove('active'); }

function showNotification(message, type = 'info') {
  let container = document.getElementById('notification-container');
  if (!container) {
    const div = document.createElement('div');
    div.id = 'notification-container';
    div.className = 'notification-container';
    document.body.appendChild(div);
    container = div;
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

async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await response.json();

    if (data.user.role !== 'admin') {
      alert('Accès réservé aux administrateurs');
      window.location.href = '/dashboard.html';
      return;
    }

    document.getElementById('user-info').innerHTML = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details">
        <strong>${data.user.name}</strong>
        <span>Administrateur</span>
      </div>
    `;
  } catch (error) {
    window.location.href = '/login.html';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

async function loadAllData() {
  await Promise.all([loadUsers(), loadSectors(), loadEquipment(), loadLogs(), loadMaterials()]);
}

// 🔥 NOUVELLES FONCTIONS
function closeMaterialModal() { 
  document.getElementById('material-modal').classList.remove('active'); 
}

async function loadMaterials() {
  try {
    const response = await fetch('/api/admin/materials');
    const materials = await response.json();

    const tbody = document.getElementById('materials-tbody');
    tbody.innerHTML = materials.map(mat => `
      <tr>
        <td data-label="Nom"><strong>${escapeHtml(mat.name)}</strong></td>
        <td data-label="Code produit"><code>${escapeHtml(mat.product_code)}</code></td>
        <td data-label="Prix unitaire">${mat.unit_price.toFixed(2)} CHF</td>
        <td data-label="Actions">
          <div class="table-actions">
            <button class="btn-icon btn-icon-primary" onclick="openMaterialModal(${mat.id})" title="Modifier">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon btn-icon-danger" onclick="deleteMaterial(${mat.id}, '${escapeHtml(mat.name).replace(/'/g, "\\'")}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement matériel:', error);
  }
}

async function openMaterialModal(materialId = null) {
  const modal = document.getElementById('material-modal');
  const title = document.getElementById('material-modal-title');
  const form = document.getElementById('material-form');

  form.reset();
  document.getElementById('material-id').value = '';

  if (materialId) {
    title.innerHTML = '<i class="fas fa-edit"></i> Modifier le matériel';

    try {
      const response = await fetch('/api/admin/materials');
      const materials = await response.json();
      const mat = materials.find((m) => m.id === materialId);

      if (mat) {
        document.getElementById('material-id').value = mat.id;
        document.getElementById('material-name').value = mat.name;
        document.getElementById('material-code').value = mat.product_code;
        document.getElementById('material-price').value = mat.unit_price;
      }
    } catch (error) {
      console.error('Erreur chargement matériel:', error);
    }
  } else {
    title.innerHTML = '<i class="fas fa-plus-circle"></i> Ajouter du matériel';
  }

  modal.classList.add('active');
}

async function saveMaterial() {
  const btn = document.getElementById('save-material-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const materialId = document.getElementById('material-id').value;
  const data = {
    name: document.getElementById('material-name').value,
    product_code: document.getElementById('material-code').value,
    unit_price: parseFloat(document.getElementById('material-price').value)
  };

  try {
    const url = materialId ? `/api/admin/materials/${materialId}` : '/api/admin/materials';
    const method = materialId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeMaterialModal();
      loadMaterials();
      showNotification('Matériel enregistré avec succès', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur inconnue', 'error');
    }
  } catch (error) {
    console.error('Erreur sauvegarde matériel:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function deleteMaterial(id, name) {
  if (!confirm(`Supprimer le matériel "${name}" ?`)) return;

  try {
    const response = await fetch(`/api/admin/materials/${id}`, { method: 'DELETE' });

    if (response.ok) {
      loadMaterials();
      showNotification('Matériel supprimé', 'success');
    } else {
      showNotification('Erreur lors de la suppression', 'error');
    }
  } catch (error) {
    console.error('Erreur suppression matériel:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  }
}

// Exposer globalement
window.openMaterialModal = openMaterialModal;
window.deleteMaterial = deleteMaterial;

// ========== UTILISATEURS ==========

async function loadUsers() {
  try {
    const response = await fetch('/api/admin/users');
    const users = await response.json();

    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = users.map(user => `
      <tr>
        <td data-label="Nom">
          <div class="user-cell">
            <div class="user-avatar-sm">${user.name.charAt(0)}</div>
            <strong>${escapeHtml(user.name)}</strong>
          </div>
        </td>
        <td data-label="Email">${escapeHtml(user.email)}</td>
        <td data-label="Rôle">
          <span class="badge ${user.role === 'admin' ? 'badge-primary' : 'badge-secondary'}">
            <i class="fas ${user.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}"></i>
            ${user.role === 'admin' ? 'Admin' : 'Technicien'}
          </span>
        </td>
        <td data-label="Téléphone">${escapeHtml(user.phone || '-')}</td>
        <td data-label="Statut">
          <span class="badge ${user.is_active ? 'badge-success' : 'badge-danger'}">
            <i class="fas ${user.is_active ? 'fa-check-circle' : 'fa-times-circle'}"></i>
            ${user.is_active ? 'Actif' : 'Inactif'}
          </span>
        </td>
        <td data-label="Dernière connexion">${formatDateTime(user.last_login_at)}</td>
        <td data-label="Actions">
          <div class="admin-table-actions">
            <button class="btn-icon-sm btn-icon-primary" onclick="openUserModal(${user.id})" title="Modifier">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon-sm btn-icon-danger" onclick="openResetModal(${user.id})" title="Réinitialiser mot de passe">
              <i class="fas fa-key"></i>
            </button>
            <!-- 🔥 NOUVEAU : Bouton de suppression -->
            <button class="btn-icon-sm btn-icon-danger" onclick="deleteUser(${user.id}, '${escapeHtml(user.name).replace(/'/g, "\\'")}', ${user.id === currentUserId ? 'true' : 'false'})" title="Supprimer">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement utilisateurs:', error);
  }
}

// 🔥 NOUVELLE FONCTION
async function deleteUser(userId, userName, isSelf) {
  if (isSelf) {
    showNotification('Vous ne pouvez pas supprimer votre propre compte', 'error');
    return;
  }
  
  if (!confirm(`Supprimer l'utilisateur "${userName}" ?\n\nCette action est irréversible.`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    
    if (response.ok) {
      showNotification('Utilisateur supprimé', 'success');
      loadUsers();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur lors de la suppression', 'error');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur de connexion', 'error');
  }
}

// Ajouter en haut pour récupérer l'ID de l'utilisateur connecté
let currentUserId = null;

async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await response.json();
    currentUserId = data.user.id; // 🔥 STOCKER L'ID
    
    // ... reste du code
  } catch (error) {
    window.location.href = '/login.html';
  }
}

async function openUserModal(userId = null) {
  const modal = document.getElementById('user-modal');
  const title = document.getElementById('user-modal-title');
  const form = document.getElementById('user-form');
  const passwordGroup = document.getElementById('password-group');
  const passwordInput = document.getElementById('user-password');

  form.reset();
  document.getElementById('user-id').value = '';

  if (userId) {
    title.innerHTML = '<i class="fas fa-user-edit"></i> Modifier l\'utilisateur';
    passwordGroup.style.display = 'none';
    passwordInput.removeAttribute('required');

    try {
      const response = await fetch('/api/admin/users');
      const users = await response.json();
      const user = users.find((u) => u.id === userId);

      if (user) {
        document.getElementById('user-id').value = user.id;
        document.getElementById('user-name').value = user.name;
        document.getElementById('user-email').value = user.email;
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-phone').value = user.phone || '';
        document.getElementById('user-active').checked = user.is_active === 1;
      }
    } catch (error) {
      console.error('Erreur chargement utilisateur:', error);
    }
  } else {
    title.innerHTML = '<i class="fas fa-user-plus"></i> Ajouter un utilisateur';
    passwordGroup.style.display = 'block';
    passwordInput.setAttribute('required', 'required');
    document.getElementById('user-active').checked = true;
  }

  modal.classList.add('active');
}

async function saveUser() {
  const btn = document.getElementById('save-user-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const userId = document.getElementById('user-id').value;
  const data = {
    name: document.getElementById('user-name').value,
    email: document.getElementById('user-email').value,
    role: document.getElementById('user-role').value,
    phone: document.getElementById('user-phone').value,
    is_active: document.getElementById('user-active').checked ? 1 : 0
  };

  if (!userId) {
    data.password = document.getElementById('user-password').value;
    if (!data.password || data.password.length < 6) {
      showNotification('Le mot de passe doit contenir au moins 6 caractères', 'error');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }
  }

  try {
    const url = userId ? `/api/admin/users/${userId}` : '/api/admin/users';
    const method = userId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      showNotification('Utilisateur enregistré avec succès', 'success');
      closeUserModal();
      loadUsers();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur inconnue', 'error');
    }
  } catch (error) {
    console.error('Erreur sauvegarde utilisateur:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function openResetModal(userId) {
  document.getElementById('reset-user-id').value = userId;
  document.getElementById('new-password').value = '';
  document.getElementById('reset-password-modal').classList.add('active');
}

async function confirmResetPassword() {
  const btn = document.getElementById('confirm-reset-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Réinitialisation...';
  btn.disabled = true;

  const userId = document.getElementById('reset-user-id').value;
  const password = document.getElementById('new-password').value;

  if (!password || password.length < 6) {
    showNotification('Le mot de passe doit contenir au moins 6 caractères', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
    return;
  }

  try {
    const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (response.ok) {
      showNotification('Mot de passe réinitialisé avec succès', 'success');
      closeResetModal();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur inconnue', 'error');
    }
  } catch (error) {
    console.error('Erreur réinitialisation:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ========== SECTEURS ==========

async function loadSectors() {
  try {
    const response = await fetch('/api/admin/sectors');
    const sectors = await response.json();

    const tbody = document.getElementById('sectors-tbody');
    tbody.innerHTML = sectors.map(sector => `
      <tr>
        <td data-label="Nom"><strong>${escapeHtml(sector.name)}</strong></td>
        <td data-label="Slug"><code>${escapeHtml(sector.slug)}</code></td>
        <td data-label="Date création">${formatDate(sector.created_at)}</td>
        <td data-label="Actions">
          <button class="btn-icon btn-icon-danger" onclick="deleteSector(${sector.id}, '${escapeHtml(sector.name).replace(/'/g, "\\'")}')">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement secteurs:', error);
  }
}

function openSectorModal() {
  document.getElementById('sector-name').value = '';
  document.getElementById('sector-modal').classList.add('active');
}

async function saveSector() {
  const btn = document.getElementById('save-sector-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const name = document.getElementById('sector-name').value;

  if (!name) {
    showNotification('Le nom est requis', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
    return;
  }

  try {
    const response = await fetch('/api/admin/sectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (response.ok) {
      showNotification('Secteur créé avec succès', 'success');
      closeSectorModal();
      loadSectors();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur inconnue', 'error');
    }
  } catch (error) {
    console.error('Erreur sauvegarde secteur:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function deleteSector(id, name) {
  if (!confirm(`Supprimer le secteur "${name}" ?`)) return;

  try {
    const response = await fetch(`/api/admin/sectors/${id}`, { method: 'DELETE' });

    if (response.ok) {
      showNotification('Secteur supprimé', 'success');
      loadSectors();
    } else {
      showNotification('Erreur lors de la suppression', 'error');
    }
  } catch (error) {
    console.error('Erreur suppression secteur:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  }
}

// ========== ÉQUIPEMENTS ==========

async function loadEquipment() {
  try {
    const response = await fetch('/api/admin/equipment');
    const equipment = await response.json();

    const tbody = document.getElementById('equipment-tbody');
    tbody.innerHTML = equipment.map(eq => `
      <tr>
        <td data-label="Modèle"><strong>${escapeHtml(eq.name)}</strong></td>
        <td data-label="Marque">${escapeHtml(eq.brand)}</td>
        <td data-label="Type"><span class="badge badge-info">${escapeHtml(eq.type)}</span></td>
        <td data-label="Actions">
          <div class="table-actions">
            <button class="btn-icon btn-icon-primary" onclick="openEquipmentModal(${eq.id})" title="Modifier">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon btn-icon-danger" onclick="deleteEquipment(${eq.id}, '${escapeHtml(eq.name).replace(/'/g, "\\'")}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement équipements:', error);
  }
}

async function openEquipmentModal(equipmentId = null) {
  const modal = document.getElementById('equipment-modal');
  const title = document.getElementById('equipment-modal-title');
  const form = document.getElementById('equipment-form');

  form.reset();
  document.getElementById('equipment-id').value = '';

  if (equipmentId) {
    title.innerHTML = '<i class="fas fa-tools"></i> Modifier l\'équipement';

    try {
      const response = await fetch('/api/admin/equipment');
      const equipment = await response.json();
      const eq = equipment.find((e) => e.id === equipmentId);

      if (eq) {
        document.getElementById('equipment-id').value = eq.id;
        document.getElementById('equipment-name').value = eq.name;
        document.getElementById('equipment-brand').value = eq.brand;
        document.getElementById('equipment-type').value = eq.type;
      }
    } catch (error) {
      console.error('Erreur chargement équipement:', error);
    }
  } else {
    title.innerHTML = '<i class="fas fa-plus-circle"></i> Ajouter un équipement';
  }

  modal.classList.add('active');
}

async function saveEquipment() {
  const btn = document.getElementById('save-equipment-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const equipmentId = document.getElementById('equipment-id').value;
  const data = {
    name: document.getElementById('equipment-name').value,
    brand: document.getElementById('equipment-brand').value,
    type: document.getElementById('equipment-type').value
  };

  try {
    const url = equipmentId ? `/api/admin/equipment/${equipmentId}` : '/api/admin/equipment';
    const method = equipmentId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      showNotification('Équipement enregistré avec succès', 'success');
      closeEquipmentModal();
      loadEquipment();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur inconnue', 'error');
    }
  } catch (error) {
    console.error('Erreur sauvegarde équipement:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function deleteEquipment(id, name) {
  if (!confirm(`Supprimer l'équipement "${name}" ?`)) return;

  try {
    const response = await fetch(`/api/admin/equipment/${id}`, { method: 'DELETE' });

    if (response.ok) {
      showNotification('Équipement supprimé', 'success');
      loadEquipment();
    } else {
      showNotification('Erreur lors de la suppression', 'error');
    }
  } catch (error) {
    console.error('Erreur suppression équipement:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  }
}

// ========== LOGS ==========

async function loadLogs() {
  try {
    const response = await fetch('/api/admin/logs?limit=100');
    const logs = await response.json();

    const tbody = document.getElementById('logs-tbody');

    const actionLabels = {
      login: 'Connexion',
      create: 'Création',
      update: 'Modification',
      delete: 'Suppression',
      reset_password: 'Réinit. MDP'
    };

    const entityLabels = {
      user: 'Utilisateur',
      client: 'Client',
      equipment: 'Équipement',
      sector: 'Secteur'
    };

    const actionIcons = {
      login: 'fa-sign-in-alt',
      create: 'fa-plus-circle',
      update: 'fa-edit',
      delete: 'fa-trash',
      reset_password: 'fa-key'
    };

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td data-label="Date/Heure">${formatDateTime(log.created_at)}</td>
        <td data-label="Utilisateur">
          <div class="user-cell">
            <div class="user-avatar-sm">${(log.user_name || 'S').charAt(0)}</div>
            ${escapeHtml(log.user_name || 'Système')}
          </div>
        </td>
        <td data-label="Action">
          <span class="badge badge-secondary">
            <i class="fas ${actionIcons[log.action] || 'fa-circle'}"></i>
            ${actionLabels[log.action] || log.action}
          </span>
        </td>
        <td data-label="Entité">${entityLabels[log.entity] || log.entity}</td>
        <td data-label="ID"><code>${log.entity_id || '-'}</code></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement logs:', error);
  }
}

// ========== UTILS ==========

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-CH');
}

function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('fr-CH', {
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