let currentPage = 1;
let currentSort = { column: 'cabinet_name', order: 'ASC' };
let currentFilters = {
  search: '',
  brand: '',
  model: '',
  serialNumber: '',
  category: '',
  columnSearch: {}
};
let totalPages = 1;
let clientToDelete = null;
let currentClientForEquipment = null;
let equipmentCatalog = [];
let technicians = [];
let currentClientEquipment = [];
let selectedEquipmentIds = [];
let currentHistoryId = null;
let currentLimit = 25; // Ajouter en haut du fichier

// Vérifier si on doit ouvrir une fiche spécifique au chargement
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const clientIdToOpen = urlParams.get('open');
  if (clientIdToOpen) {
    setTimeout(() => {
      openClientModal(parseInt(clientIdToOpen));
      window.history.replaceState({}, document.title, '/clients.html');
    }, 500);
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadTechnicians();
  await loadClients();
  await loadEquipmentCatalog();

  const lastMaintenanceInput = document.getElementById('last-maintenance');
  const maintenanceIntervalSelect = document.getElementById('maintenance-interval');
  const nextMaintenanceDisplay = document.getElementById('next-maintenance-display');
  
  if (lastMaintenanceInput && maintenanceIntervalSelect) {
    const updateNextMaintenance = () => {
      const lastDate = lastMaintenanceInput.value;
      const interval = maintenanceIntervalSelect.value;
      
      if (lastDate && interval) {
        const nextDate = calculateNextMaintenance(lastDate, interval);
        if (nextMaintenanceDisplay && nextDate) {
          nextMaintenanceDisplay.textContent = formatDate(nextDate);
          nextMaintenanceDisplay.style.fontWeight = 'var(--font-weight-semibold)';
          nextMaintenanceDisplay.style.color = 'var(--color-primary)';
        }
      }
    };
    
    lastMaintenanceInput.addEventListener('change', updateNextMaintenance);
    maintenanceIntervalSelect.addEventListener('change', updateNextMaintenance);
  }

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('add-client-btn').addEventListener('click', () => openClientModal());
  document.getElementById('cancel-modal-btn').addEventListener('click', closeClientModal);
  document.getElementById('save-client-btn').addEventListener('click', saveClient);
  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);

  document.getElementById('add-history-btn').addEventListener('click', openHistoryModal);
  document.getElementById('cancel-history-btn').addEventListener('click', closeHistoryModal);
  document.getElementById('save-history-btn').addEventListener('click', saveHistoryEntry);

  document.getElementById('global-search').addEventListener('input', debounce(handleGlobalSearch, 300));
  document.getElementById('filter-brand').addEventListener('input', debounce(handleEquipmentFilters, 300));
  document.getElementById('filter-model').addEventListener('input', debounce(handleEquipmentFilters, 300));
  document.getElementById('filter-serial').addEventListener('input', debounce(handleEquipmentFilters, 300));
  document.getElementById('filter-category').addEventListener('input', debounce(handleEquipmentFilters, 300));
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);

  document.getElementById('limit-select').addEventListener('change', function() {
    currentLimit = parseInt(this.value);
    currentPage = 1;
    loadClients();
  });

  document.querySelectorAll('.column-search input').forEach((input) => {
    input.addEventListener('input', debounce(handleColumnSearch, 300));
  });

  document.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', (e) => {
      if (!e.target.matches('input')) {
        handleSort(th.dataset.column);
      }
    });
  });

  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadClients();
    }
  });
  
  document.getElementById('next-page').addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadClients();
    }
  });

  document.getElementById('cancel-delete-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);

  document.getElementById('add-equipment-item-btn').addEventListener('click', showEquipmentForm);
  document.getElementById('cancel-equipment-item-btn').addEventListener('click', hideEquipmentForm);
  document.getElementById('save-equipment-item-btn').addEventListener('click', saveEquipmentItem);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu')) {
      document.querySelectorAll('.action-menu-dropdown').forEach((menu) => {
        menu.classList.remove('active');
      });
    }
  });
});

function closeClientModal() { 
  document.getElementById('client-modal').classList.remove('active');
  // Réinitialiser le formulaire si nécessaire
  document.getElementById('client-form').reset();
}
function closeClientDetailsModal() { document.getElementById('client-details-modal').classList.remove('active'); }
function closeEquipmentModal() {
  document.getElementById('equipment-modal').classList.remove('active');
  currentClientForEquipment = null;
  loadClients();
}
function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('active');
  clientToDelete = null;
}
function closeHistoryModal() {
  document.getElementById('history-modal').classList.remove('active');
  // Ne pas fermer le modal client
}

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

async function loadTechnicians() {
  try {
    const response = await fetch('/api/admin/users');
    const users = await response.json();
    technicians = users.filter(u => u.is_active === 1 && (u.role === 'tech' || u.role === 'admin'));
    
    const technicianSelects = [
      document.getElementById('technician'),
      document.getElementById('history-technician')
    ];
    
    technicianSelects.forEach(select => {
      if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">-- Non assigné --</option>' +
          technicians.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
        if (currentValue) {
          select.value = currentValue;
        }
      }
    });
  } catch (error) {
    console.error('Erreur chargement techniciens:', error);
  }
}

async function loadClients() {
  const params = new URLSearchParams({
    page: currentPage,
    limit: currentLimit, // 🔥 UTILISER LA VARIABLE
    search: currentFilters.search,
    sortBy: currentSort.column,
    sortOrder: currentSort.order,
    brand: currentFilters.brand,
    model: currentFilters.model,
    serialNumber: currentFilters.serialNumber,
    category: currentFilters.category,
    columnSearch: JSON.stringify(currentFilters.columnSearch)
  });

  try {
    const response = await fetch(`/api/clients?${params}`);
    const data = await response.json();

    const clientsWithEquipment = await Promise.all(
      data.clients.map(async (client) => {
        try {
          const eqResponse = await fetch(`/api/clients/${client.id}/equipment`);
          const equipment = await eqResponse.json();
          return { ...client, equipment };
        } catch {
          return { ...client, equipment: [] };
        }
      })
    );

    renderClients(clientsWithEquipment);
    updatePagination(data.pagination);
  } catch (error) {
    console.error('Erreur chargement clients:', error);
    document.getElementById('clients-tbody').innerHTML = `
      <tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 40px">
        <i class="fas fa-exclamation-triangle fa-2x"></i>
        <p style="margin-top: 10px">Erreur de chargement</p>
      </td></tr>
    `;
  }
}

function renderClients(clients) {
  const tbody = document.getElementById('clients-tbody');

  if (clients.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="6" class="table-empty">
        <i class="fas fa-inbox"></i>
        <p>Aucun client trouvé</p>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = clients.map(client => `
    <tr>
      <td data-label="Cabinet / Contact">
        <div class="client-info-cell">
          <strong class="client-name">${escapeHtml(client.cabinet_name)}</strong>
          <div class="client-meta">
            <span><i class="fas fa-user"></i> ${escapeHtml(client.contact_name)}</span>
            ${client.phone ? `<span><i class="fas fa-phone"></i> <a href="tel:${client.phone}">${escapeHtml(client.phone)}</a></span>` : ''}
            ${client.email ? `<span><i class="fas fa-envelope"></i> <a href="mailto:${client.email}">${escapeHtml(client.email)}</a></span>` : ''}
          </div>
        </div>
      </td>
      <td data-label="Activité">
        <span class="badge badge-info">${escapeHtml(client.activity)}</span>
      </td>
      <td data-label="Localisation">
        <div style="display: flex; flex-direction: column; gap: var(--space-2);">
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <i class="fas fa-map-marker-alt" style="color: var(--color-primary); width: 14px;"></i>
            <span style="font-weight: var(--font-weight-semibold);">
              ${client.postal_code ? escapeHtml(client.postal_code) + ' ' : ''}${escapeHtml(client.city)}, ${escapeHtml(client.canton)}
            </span>
          </div>
          <span style="font-size: var(--font-size-sm); color: var(--neutral-600); padding-left: 22px;">${escapeHtml(client.address)}</span>
        </div>
      </td>
      <td data-label="Équipements">${renderEquipmentColumn(client)}</td>
      <td data-label="Rendez-vous">${formatDate(client.appointment_at)}</td>
      <td data-label="Actions">
        <div class="action-menu">
          <button class="action-menu-trigger" onclick="toggleActionMenu(event, ${client.id})">
            <i class="fas fa-ellipsis-v"></i>
          </button>
          <div class="action-menu-dropdown" id="action-menu-${client.id}">
            <button class="action-menu-item" onclick="openClientDetails(${client.id})">
              <i class="fas fa-folder-open"></i> Voir la fiche
            </button>
            <button class="action-menu-item" onclick="openEquipmentModal(${client.id}, '${escapeHtml(client.cabinet_name).replace(/'/g, "\\'")}')">
              <i class="fas fa-tools"></i> Équipements
            </button>
            <button class="action-menu-item" onclick="openClientModal(${client.id})">
              <i class="fas fa-edit"></i> Modifier
            </button>
            <button class="action-menu-item danger" onclick="openDeleteModal(${client.id}, '${escapeHtml(client.cabinet_name).replace(/'/g, "\\'")}')">
              <i class="fas fa-trash"></i> Supprimer
            </button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

function calculateNextMaintenance(lastMaintenanceDate, intervalYears) {
  if (!lastMaintenanceDate || !intervalYears) return null;
  
  const date = new Date(lastMaintenanceDate);
  date.setFullYear(date.getFullYear() + parseInt(intervalYears));
  return date.toISOString().split('T')[0];
}

function renderEquipmentColumn(client) {
  if (!client.equipment || client.equipment.length === 0) {
    return '<div class="equipment-empty"><i class="fas fa-box-open"></i> Aucun équipement</div>';
  }

  return `
    <div class="equipment-badges">
      ${client.equipment.map(eq => {
        const { badge, daysLeft } = getMaintenanceBadge(eq.next_maintenance_date);
        return `
          <div class="equipment-badge-item">
            <div class="equipment-badge-name">${escapeHtml(eq.name)}</div>
            ${badge}
            ${daysLeft !== null ? `<div class="equipment-badge-days">${daysLeft}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getMaintenanceBadge(dateString) {
  if (!dateString) {
    return { 
      badge: '<span class="badge badge-primary equipment-badge-status"><i class="fas fa-clock"></i> À définir</span>',
      daysLeft: null
    };
  }
  
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = date - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      badge: '<span class="badge badge-danger equipment-badge-status"><i class="fas fa-exclamation-circle"></i> Expiré</span>',
      daysLeft: `${Math.abs(diffDays)}j de retard`
    };
  } else if (diffDays <= 30) {
    return {
      badge: '<span class="badge badge-warning equipment-badge-status"><i class="fas fa-clock"></i> Bientôt</span>',
      daysLeft: `${diffDays}j restants`
    };
  } else {
    return {
      badge: '<span class="badge badge-success equipment-badge-status"><i class="fas fa-check-circle"></i> OK</span>',
      daysLeft: `${diffDays}j restants`
    };
  }
}

function toggleActionMenu(event, clientId) {
  event.stopPropagation();
  document.querySelectorAll('.action-menu-dropdown').forEach((menu) => {
    if (menu.id !== `action-menu-${clientId}`) {
      menu.classList.remove('active');
    }
  });
  const menu = document.getElementById(`action-menu-${clientId}`);
  menu.classList.toggle('active');
}

async function openClientModal(clientId = null) {
  const modal = document.getElementById('client-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('client-form');
  const historySection = document.getElementById('history-section');

  form.reset();
  document.getElementById('client-id').value = '';
  historySection.style.display = 'none';

  if (clientId) {
    title.innerHTML = '<i class="fas fa-edit"></i> Modifier le client';
    historySection.style.display = 'block';

    try {
      const response = await fetch(`/api/clients/${clientId}`);
      
      if (!response.ok) {
        throw new Error('Client non trouvé');
      }
      
      const client = await response.json();

      document.getElementById('client-id').value = client.id;
      document.getElementById('cabinet-name').value = client.cabinet_name;
      document.getElementById('contact-name').value = client.contact_name;
      document.getElementById('activity').value = client.activity;
      document.getElementById('address').value = client.address;
      document.getElementById('postal-code').value = client.postal_code || '';
      document.getElementById('canton').value = client.canton || '';
      document.getElementById('city').value = client.city;
      document.getElementById('phone').value = client.phone || '';
      document.getElementById('email').value = client.email || '';
      document.getElementById('appointment').value = client.appointment_at || '';
      document.getElementById('technician').value = client.technician_id || '';
      document.getElementById('notes').value = client.notes || '';
      
      await loadAppointmentsHistory(clientId);
      
    } catch (error) {
      console.error('Erreur chargement client:', error);
      showNotification('Erreur lors du chargement du client', 'error');
      return;
    }
  } else {
    title.innerHTML = '<i class="fas fa-plus-circle"></i> Ajouter un client';
  }

  modal.classList.add('active');
}

async function saveClient() {
  const btn = document.getElementById('save-client-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const clientId = document.getElementById('client-id').value;
  const data = {
    cabinet_name: document.getElementById('cabinet-name').value.trim(),
    contact_name: document.getElementById('contact-name').value.trim(),
    activity: document.getElementById('activity').value,
    address: document.getElementById('address').value.trim(),
    postal_code: document.getElementById('postal-code').value.trim(),
    canton: document.getElementById('canton').value,
    city: document.getElementById('city').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    appointment_at: document.getElementById('appointment').value,
    technician_id: document.getElementById('technician').value || null,
    notes: document.getElementById('notes').value.trim()
  };

  if (!data.cabinet_name || !data.contact_name || !data.activity || !data.address || !data.city) {
    showNotification('Veuillez remplir tous les champs requis', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
    return;
  }

  try {
    const url = clientId ? `/api/clients/${clientId}` : '/api/clients';
    const method = clientId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeClientModal();
      loadClients();
      showNotification('Client enregistré avec succès', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur lors de l\'enregistrement', 'error');
    }
  } catch (error) {
    console.error('Erreur sauvegarde client:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ========== FICHE CLIENT DÉTAILLÉE (LECTURE SEULE) ==========
async function openClientDetails(clientId) {
  try {
    const response = await fetch(`/api/clients/${clientId}`);
    if (!response.ok) throw new Error('Client non trouvé');
    
    const client = await response.json();
    
    const eqResponse = await fetch(`/api/clients/${clientId}/equipment`);
    const equipment = await eqResponse.json();
    
    const histResponse = await fetch(`/api/clients/${clientId}/appointments`);
    const appointments = await histResponse.json();
    
    renderClientDetails(client, equipment, appointments);
    
    document.getElementById('edit-from-details-btn').onclick = () => {
      closeClientDetailsModal();
      openClientModal(clientId);
    };
    
    document.getElementById('client-details-modal').classList.add('active');
    
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

function renderClientDetails(client, equipment, appointments) {
  const content = document.getElementById('client-details-content');
  
  content.innerHTML = `
    <div style="display: grid; gap: var(--space-6);">
      <div class="form-section">
        <h3 class="form-section-title">
          <i class="fas fa-info-circle"></i> Informations générales
        </h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4);">
          <div>
            <strong style="color: var(--neutral-600); font-size: var(--font-size-sm); display: block; margin-bottom: var(--space-1);">Cabinet</strong>
            <p style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); color: var(--neutral-900);">${escapeHtml(client.cabinet_name)}</p>
          </div>
          <div>
            <strong style="color: var(--neutral-600); font-size: var(--font-size-sm); display: block; margin-bottom: var(--space-1);">Contact</strong>
            <p style="font-size: var(--font-size-base); color: var(--neutral-900);">${escapeHtml(client.contact_name)}</p>
          </div>
          <div>
            <strong style="color: var(--neutral-600); font-size: var(--font-size-sm); display: block; margin-bottom: var(--space-1);">Activité</strong>
            <span class="badge badge-info">${escapeHtml(client.activity)}</span>
          </div>
          <div>
            <strong style="color: var(--neutral-600); font-size: var(--font-size-sm); display: block; margin-bottom: var(--space-1);">Téléphone</strong>
            <p style="font-size: var(--font-size-base); color: var(--neutral-900);">
              ${client.phone ? `<a href="tel:${client.phone}">${escapeHtml(client.phone)}</a>` : '-'}
            </p>
          </div>
          <div>
            <strong style="color: var(--neutral-600); font-size: var(--font-size-sm); display: block; margin-bottom: var(--space-1);">Email</strong>
            <p style="font-size: var(--font-size-base); color: var(--neutral-900);">
              ${client.email ? `<a href="mailto:${client.email}">${escapeHtml(client.email)}</a>` : '-'}
            </p>
          </div>
        </div>
      </div>

      <div class="form-section">
        <h3 class="form-section-title">
          <i class="fas fa-map-marker-alt"></i> Adresse
        </h3>
        <p style="font-size: var(--font-size-base); color: var(--neutral-900); line-height: 1.6;">
          ${escapeHtml(client.address)}<br/>
          ${client.postal_code ? escapeHtml(client.postal_code) + ' ' : ''}${escapeHtml(client.city)}, ${escapeHtml(client.canton)}
        </p>
      </div>

      <div class="form-section">
        <h3 class="form-section-title">
          <i class="fas fa-calendar-alt"></i> Prochain rendez-vous
        </h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4);">
          <div>
            <strong style="color: var(--neutral-600); font-size: var(--font-size-sm); display: block; margin-bottom: var(--space-1);">Date</strong>
            <p style="font-size: var(--font-size-base); color: var(--neutral-900);">${client.appointment_at ? formatDate(client.appointment_at) : '-'}</p>
          </div>
          <div>
            <strong style="color: var(--neutral-600); font-size: var(--font-size-sm); display: block; margin-bottom: var(--space-1);">Technicien assigné</strong>
            <p style="font-size: var(--font-size-base); color: var(--neutral-900);">
              ${client.technician_id ? getTechnicianName(client.technician_id) : 'Non assigné'}
            </p>
          </div>
        </div>
      </div>

      <div class="form-section">
        <h3 class="form-section-title">
          <i class="fas fa-tools"></i> Équipements installés (${equipment.length})
        </h3>
        ${equipment.length > 0 ? `
          <div style="display: grid; gap: var(--space-3);">
            ${equipment.map(eq => {
              const { badge, daysLeft } = getMaintenanceBadge(eq.next_maintenance_date);
              return `
                <div class="equipment-detail-card">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-3);">
                    <div>
                      <strong style="font-size: var(--font-size-lg); color: var(--neutral-900);">${escapeHtml(eq.name)}</strong>
                      <p style="font-size: var(--font-size-sm); color: var(--neutral-600); margin-top: var(--space-1);">
                        ${escapeHtml(eq.brand)} ${eq.model ? '- ' + escapeHtml(eq.model) : ''}
                      </p>
                    </div>
                    ${badge}
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); font-size: var(--font-size-sm); color: var(--neutral-700);">
                    ${eq.serial_number ? `
                      <div>
                        <strong style="color: var(--neutral-600); display: block; margin-bottom: var(--space-1);">N° série</strong>
                        ${escapeHtml(eq.serial_number)}
                      </div>
                    ` : ''}
                    ${eq.installed_at ? `
                      <div>
                        <strong style="color: var(--neutral-600); display: block; margin-bottom: var(--space-1);">Installé le</strong>
                        ${formatDate(eq.installed_at)}
                      </div>
                    ` : ''}
                    ${eq.last_maintenance_date ? `
                      <div>
                        <strong style="color: var(--neutral-600); display: block; margin-bottom: var(--space-1);">Dernière maintenance</strong>
                        ${formatDate(eq.last_maintenance_date)}
                      </div>
                    ` : ''}
                    ${eq.next_maintenance_date ? `
                      <div>
                        <strong style="color: var(--neutral-600); display: block; margin-bottom: var(--space-1);">Prochaine maintenance</strong>
                        ${formatDate(eq.next_maintenance_date)} ${daysLeft ? `<span style="color: var(--neutral-500);">(${daysLeft})</span>` : ''}
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : '<p style="text-align: center; color: var(--neutral-500); padding: var(--space-6);">Aucun équipement installé</p>'}
      </div>

      <div class="form-section">
        <h3 class="form-section-title">
          <i class="fas fa-history"></i> Historique des rendez-vous
        </h3>
        ${appointments.length > 0 ? `
          <div class="history-list">
            ${appointments.map(apt => `
              <div class="history-item">
                <div class="history-item-date">
                  <i class="fas fa-calendar"></i>
                  <strong>${formatDate(apt.appointment_date)}</strong>
                </div>
                <div class="history-item-content">
                  ${apt.task_description ? `
                    <div class="history-item-task">
                      <i class="fas fa-tasks"></i>
                      <span>${escapeHtml(apt.task_description)}</span>
                    </div>
                  ` : ''}
                  ${apt.technician_name ? `
                    <div class="history-item-tech">
                      <i class="fas fa-user-tie"></i>
                      <span>${escapeHtml(apt.technician_name)}</span>
                    </div>
                  ` : ''}
                  ${apt.equipment_names && apt.equipment_names.length > 0 ? `
                    <div class="history-item-tech">
                      <i class="fas fa-tools"></i>
                      <span>${apt.equipment_names.map(escapeHtml).join(', ')}</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<p style="text-align: center; color: var(--neutral-500); padding: var(--space-6);">Aucun historique</p>'}
      </div>

      ${client.notes ? `
        <div class="form-section">
          <h3 class="form-section-title">
            <i class="fas fa-sticky-note"></i> Notes
          </h3>
          <p style="font-size: var(--font-size-base); color: var(--neutral-700); line-height: 1.6; white-space: pre-wrap;">${escapeHtml(client.notes)}</p>
        </div>
      ` : ''}
    </div>
  `;
}

function getTechnicianName(technicianId) {
  const tech = technicians.find(t => t.id == technicianId);
  return tech ? tech.name : 'Non assigné';
}

// ========== HISTORIQUE DES RENDEZ-VOUS ==========
async function loadAppointmentsHistory(clientId) {
  try {
    const response = await fetch(`/api/clients/${clientId}/appointments`);
    const appointments = await response.json();
    
    const container = document.getElementById('appointments-history');
    
    if (appointments.length === 0) {
      container.innerHTML = `
        <p style="text-align: center; color: var(--neutral-500); padding: 20px">
          <i class="fas fa-inbox"></i><br/>
          Aucun historique de rendez-vous
        </p>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="history-list">
        ${appointments.map(apt => `
          <div class="history-item">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-3);">
              <div class="history-item-date">
                <i class="fas fa-calendar"></i>
                <strong>${formatDate(apt.appointment_date)}</strong>
              </div>
              <div style="display: flex; gap: var(--space-2);">
                <button class="btn-icon-sm btn-icon-primary edit-history-btn" data-id="${apt.id}" title="Modifier">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon-sm btn-icon-danger delete-history-btn" data-id="${apt.id}" title="Supprimer">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
            <div class="history-item-content">
              ${apt.task_description ? `
                <div class="history-item-task">
                  <i class="fas fa-tasks"></i>
                  <span>${escapeHtml(apt.task_description)}</span>
                </div>
              ` : ''}
              ${apt.technician_name ? `
                <div class="history-item-tech">
                  <i class="fas fa-user-tie"></i>
                  <span>${escapeHtml(apt.technician_name)}</span>
                </div>
              ` : ''}
              ${apt.equipment_names && apt.equipment_names.length > 0 ? `
                <div class="history-item-tech">
                  <i class="fas fa-tools"></i>
                  <span>${apt.equipment_names.map(escapeHtml).join(', ')}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    // Attacher les event listeners APRÈS le rendu
    container.querySelectorAll('.edit-history-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(this.dataset.id);
        editHistoryEntry(id);
      });
    });
    
    container.querySelectorAll('.delete-history-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(this.dataset.id);
        deleteHistoryEntry(id);
      });
    });
    
  } catch (error) {
    console.error('Erreur chargement historique:', error);
    const container = document.getElementById('appointments-history');
    container.innerHTML = `
      <p style="text-align: center; color: var(--color-danger); padding: 20px">
        Erreur lors du chargement de l'historique
      </p>
    `;
  }
}

async function openHistoryModal() {
  const clientId = document.getElementById('client-id').value;
  if (!clientId) {
    showNotification('Veuillez d\'abord enregistrer le client', 'warning');
    return;
  }
  
  document.getElementById('history-id').value = '';
  document.getElementById('history-client-id').value = clientId;
  document.getElementById('history-form').reset();
  document.getElementById('history-modal-title').innerHTML = '<i class="fas fa-plus-circle"></i> Ajouter un rendez-vous passé';
  currentHistoryId = null;
  selectedEquipmentIds = [];
  
  await loadClientEquipmentForHistory(clientId);
  
  document.getElementById('history-modal').classList.add('active');
}

async function editHistoryEntry(appointmentId) {
  const clientId = document.getElementById('client-id').value;
  
  try {
    const response = await fetch(`/api/clients/${clientId}/appointments/${appointmentId}`);
    
    if (!response.ok) {
      throw new Error('Rendez-vous non trouvé');
    }
    
    const appointment = await response.json();
    
    document.getElementById('history-id').value = appointment.id;
    document.getElementById('history-client-id').value = clientId;
    document.getElementById('history-date').value = appointment.appointment_date;
    document.getElementById('history-task').value = appointment.task_description || '';
    document.getElementById('history-technician').value = appointment.technician_id || '';
    document.getElementById('history-modal-title').innerHTML = '<i class="fas fa-edit"></i> Modifier le rendez-vous';
    
    currentHistoryId = appointmentId;
    selectedEquipmentIds = appointment.equipment_ids || [];
    
    await loadClientEquipmentForHistory(clientId);
    
    // Ouvrir le modal historique
    document.getElementById('history-modal').classList.add('active');
    
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors du chargement du rendez-vous', 'error');
  }
}

async function loadClientEquipmentForHistory(clientId) {
  try {
    const response = await fetch(`/api/clients/${clientId}/equipment`);
    currentClientEquipment = await response.json();
    
    const container = document.getElementById('history-equipment-list');
    
    if (currentClientEquipment.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--neutral-500); padding: var(--space-4);">Aucun équipement installé</p>';
      return;
    }
    
    container.innerHTML = currentClientEquipment.map(eq => `
      <div class="checkbox-group" style="margin-bottom: var(--space-2); padding: var(--space-2); background: white; border-radius: var(--radius-sm);">
        <input 
          type="checkbox" 
          id="eq-${eq.id}" 
          value="${eq.id}"
          ${selectedEquipmentIds.includes(eq.id) ? 'checked' : ''}
          onchange="toggleEquipmentSelection(${eq.id})"
        />
        <label for="eq-${eq.id}" style="flex: 1; cursor: pointer; margin: 0;">
          <strong>${escapeHtml(eq.name)}</strong>
          <small style="display: block; color: var(--neutral-600); margin-top: 2px;">
            ${escapeHtml(eq.brand)} ${eq.model ? '- ' + escapeHtml(eq.model) : ''}
            ${eq.serial_number ? ' • S/N: ' + escapeHtml(eq.serial_number) : ''}
          </small>
        </label>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Erreur chargement équipements:', error);
  }
}

function toggleEquipmentSelection(equipmentId) {
  const index = selectedEquipmentIds.indexOf(equipmentId);
  if (index > -1) {
    selectedEquipmentIds.splice(index, 1);
  } else {
    selectedEquipmentIds.push(equipmentId);
  }
}

async function saveHistoryEntry() {
  const btn = document.getElementById('save-history-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const historyId = document.getElementById('history-id').value;
  const clientId = document.getElementById('history-client-id').value;
  const data = {
    appointment_date: document.getElementById('history-date').value,
    task_description: document.getElementById('history-task').value.trim(),
    technician_id: document.getElementById('history-technician').value || null,
    equipment_ids: selectedEquipmentIds
  };

  if (!data.appointment_date) {
    showNotification('La date est requise', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
    return;
  }

  try {
    const url = historyId 
      ? `/api/clients/${clientId}/appointments/${historyId}`
      : `/api/clients/${clientId}/appointments`;
    const method = historyId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeHistoryModal();
      // NE PAS forcer le modal client à rester ouvert ici
      await loadAppointmentsHistory(clientId);
      showNotification(historyId ? 'Rendez-vous modifié' : 'Rendez-vous ajouté à l\'historique', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur lors de l\'ajout', 'error');
    }
  } catch (error) {
    console.error('Erreur sauvegarde historique:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function deleteHistoryEntry(appointmentId) {
  if (!confirm('Supprimer ce rendez-vous de l\'historique ?')) return;
  
  const clientId = document.getElementById('client-id').value;
  
  try {
    const response = await fetch(`/api/clients/${clientId}/appointments/${appointmentId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadAppointmentsHistory(clientId);
      showNotification('Rendez-vous supprimé', 'success');
    } else {
      showNotification('Erreur lors de la suppression', 'error');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur de connexion', 'error');
  }
}

// ========== ÉQUIPEMENTS ==========
async function loadEquipmentCatalog() {
  try {
    const response = await fetch('/api/admin/equipment');
    equipmentCatalog = await response.json();
  } catch (error) {
    console.error('Erreur chargement catalogue:', error);
  }
}

async function openEquipmentModal(clientId, clientName) {
  currentClientForEquipment = clientId;
  document.getElementById('equipment-client-name').textContent = ` - ${clientName}`;
  document.getElementById('equipment-client-id').value = clientId;
  
  await loadClientEquipment(clientId);
  
  const select = document.getElementById('equipment-select');
  select.innerHTML = '<option value="">-- Sélectionner --</option>' +
    equipmentCatalog.map(eq => 
      `<option value="${eq.id}">${eq.name} - ${eq.brand} (${eq.type})</option>`
    ).join('');
  
  hideEquipmentForm();
  document.getElementById('equipment-modal').classList.add('active');
}

async function loadClientEquipment(clientId) {
  try {
    const response = await fetch(`/api/clients/${clientId}/equipment`);
    const equipment = await response.json();
    
    const container = document.getElementById('equipment-list-container');
    
    if (equipment.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--neutral-500)">
          <i class="fas fa-box-open fa-3x"></i>
          <p style="margin-top: 10px">Aucun équipement installé</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = equipment.map(eq => {
      const { badge, daysLeft } = getMaintenanceBadge(eq.next_maintenance_date);
      
      return `
        <div class="equipment-detail-card">
          <div class="equipment-detail-header">
            <div>
              <strong class="equipment-detail-name">${escapeHtml(eq.name)}</strong>
              <div class="equipment-detail-meta">
                <span><i class="fas fa-industry"></i> ${escapeHtml(eq.brand)}</span>
                <span><i class="fas fa-th-large"></i> ${escapeHtml(eq.type)}</span>
              </div>
            </div>
            ${badge}
          </div>
          
          <div class="equipment-detail-grid">
            ${eq.serial_number ? `
              <div class="equipment-detail-item">
                <i class="fas fa-barcode"></i>
                <div>
                  <small>N° de série</small>
                  <strong>${escapeHtml(eq.serial_number)}</strong>
                </div>
              </div>
            ` : ''}
            
            ${eq.installed_at ? `
              <div class="equipment-detail-item">
                <i class="fas fa-calendar-plus"></i>
                <div>
                  <small>Installation</small>
                  <strong>${formatDate(eq.installed_at)}</strong>
                </div>
              </div>
            ` : ''}
            
            ${eq.last_maintenance_date ? `
              <div class="equipment-detail-item">
                <i class="fas fa-wrench"></i>
                <div>
                  <small>Dernière maintenance</small>
                  <strong>${formatDate(eq.last_maintenance_date)}</strong>
                </div>
              </div>
            ` : ''}
            
            ${eq.next_maintenance_date ? `
              <div class="equipment-detail-item">
                <i class="fas fa-calendar-check"></i>
                <div>
                  <small>Prochaine maintenance</small>
                  <strong style="color: ${getMaintenanceColor(eq.next_maintenance_date)};">${formatDate(eq.next_maintenance_date)}</strong>
                  ${daysLeft ? `<small style="color: var(--neutral-600); margin-top: 4px; display: block;">${daysLeft}</small>` : ''}
                </div>
              </div>
            ` : ''}
            
            ${eq.warranty_until ? `
              <div class="equipment-detail-item">
                <i class="fas fa-shield-alt"></i>
                <div>
                  <small>Garantie</small>
                  <strong>${formatDate(eq.warranty_until)}</strong>
                </div>
              </div>
            ` : ''}
          </div>
          
          <div class="equipment-detail-actions">
            <button class="btn btn-sm btn-secondary" onclick="editEquipmentItem(${eq.id})">
              <i class="fas fa-edit"></i> Modifier
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteEquipmentItem(${eq.id})">
              <i class="fas fa-trash"></i> Supprimer
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Erreur chargement équipements:', error);
  }
}

function getMaintenanceColor(dateString) {
  if (!dateString) return 'var(--neutral-700)';
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'var(--color-danger)';
  if (diffDays <= 30) return 'var(--color-warning)';
  return 'var(--color-success)';
}

function showEquipmentForm() {
  document.getElementById('equipment-form-container').classList.remove('hidden');
  document.getElementById('add-equipment-item-btn').classList.add('hidden');
  
  const equipmentItemId = document.getElementById('equipment-item-id').value;
  const select = document.getElementById('equipment-select');
  
  if (!equipmentItemId) {
    document.getElementById('equipment-item-form').reset();
    document.getElementById('equipment-item-id').value = '';
    document.getElementById('maintenance-interval').value = '1';
    select.disabled = false;
    
    const display = document.getElementById('next-maintenance-display');
    if (display) {
      display.textContent = 'Saisissez la dernière maintenance';
      display.style.color = 'var(--neutral-600)';
    }
  } else {
    select.disabled = true;
  }
}

function hideEquipmentForm() {
  document.getElementById('equipment-form-container').classList.add('hidden');
  document.getElementById('add-equipment-item-btn').classList.remove('hidden');
  document.getElementById('equipment-item-form').reset();
  document.getElementById('equipment-item-id').value = '';
  document.getElementById('equipment-select').disabled = false;
}

async function editEquipmentItem(equipmentItemId) {
  try {
    const clientId = currentClientForEquipment;
    const response = await fetch(`/api/clients/${clientId}/equipment`);
    const equipment = await response.json();
    const item = equipment.find(e => e.id === equipmentItemId);
    
    if (item) {
      document.getElementById('equipment-item-id').value = item.id;
      
      const select = document.getElementById('equipment-select');
      select.value = item.equipment_id;
      select.disabled = true;
      
      document.getElementById('equipment-serial').value = item.serial_number || '';
      document.getElementById('equipment-installed').value = item.installed_at || '';
      document.getElementById('equipment-warranty').value = item.warranty_until || '';
      document.getElementById('last-maintenance').value = item.last_maintenance_date || '';
      document.getElementById('maintenance-interval').value = item.maintenance_interval || '1';
      
      if (item.last_maintenance_date) {
        const nextDate = calculateNextMaintenance(item.last_maintenance_date, item.maintenance_interval || 1);
        const display = document.getElementById('next-maintenance-display');
        if (display && nextDate) {
          display.textContent = formatDate(nextDate);
          display.style.color = 'var(--color-primary)';
          display.style.fontWeight = 'var(--font-weight-semibold)';
        }
      }
      
      showEquipmentForm();
    }
  } catch (error) {
    console.error('Erreur chargement équipement:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

async function saveEquipmentItem() {
  const btn = document.getElementById('save-equipment-item-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  const equipmentItemId = document.getElementById('equipment-item-id').value;
  const clientId = currentClientForEquipment;
  const equipmentId = document.getElementById('equipment-select').value;
  
  if (!equipmentId) {
    showNotification('Veuillez sélectionner un équipement', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
    return;
  }
  
  const lastMaintenance = document.getElementById('last-maintenance').value;
  const maintenanceInterval = parseInt(document.getElementById('maintenance-interval').value) || 1;
  const nextMaintenance = lastMaintenance ? calculateNextMaintenance(lastMaintenance, maintenanceInterval) : null;
  
  const data = {
    equipment_id: parseInt(equipmentId),
    serial_number: document.getElementById('equipment-serial').value.trim(),
    installed_at: document.getElementById('equipment-installed').value,
    warranty_until: document.getElementById('equipment-warranty').value,
    last_maintenance_date: lastMaintenance,
    maintenance_interval: maintenanceInterval,
    next_maintenance_date: nextMaintenance
  };

  try {
    const url = equipmentItemId 
      ? `/api/clients/${clientId}/equipment/${equipmentItemId}`
      : `/api/clients/${clientId}/equipment`;
    const method = equipmentItemId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      hideEquipmentForm();
      loadClientEquipment(clientId);
      showNotification('Équipement enregistré avec succès', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur lors de l\'enregistrement', 'error');
    }
  } catch (error) {
    console.error('Erreur sauvegarde équipement:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function deleteEquipmentItem(equipmentItemId) {
  if (!confirm('Supprimer cet équipement ?')) return;

  try {
    const clientId = currentClientForEquipment;
    const response = await fetch(
      `/api/clients/${clientId}/equipment/${equipmentItemId}`,
      { method: 'DELETE' }
    );

    if (response.ok) {
      loadClientEquipment(clientId);
      showNotification('Équipement supprimé', 'success');
    } else {
      showNotification('Erreur lors de la suppression', 'error');
    }
  } catch (error) {
    console.error('Erreur suppression équipement:', error);
    showNotification('Erreur de connexion au serveur', 'error');
  }
}

function openDeleteModal(clientId, clientName) {
  clientToDelete = clientId;
  document.getElementById('delete-client-name').textContent = clientName;
  document.getElementById('delete-modal').classList.add('active');
}

async function confirmDelete() {
  if (!clientToDelete) return;

  const btn = document.getElementById('confirm-delete-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suppression...';
  btn.disabled = true;

  try {
    const response = await fetch(`/api/clients/${clientToDelete}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      closeDeleteModal();
      loadClients();
      showNotification('Client supprimé', 'success');
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

function handleGlobalSearch(e) {
  currentFilters.search = e.target.value;
  currentPage = 1;
  loadClients();
}

function handleEquipmentFilters() {
  currentFilters.brand = document.getElementById('filter-brand').value;
  currentFilters.model = document.getElementById('filter-model').value;
  currentFilters.serialNumber = document.getElementById('filter-serial').value;
  currentFilters.category = document.getElementById('filter-category').value;
  currentPage = 1;
  loadClients();
}

function handleColumnSearch(e) {
  const column = e.target.dataset.column;
  currentFilters.columnSearch[column] = e.target.value;
  currentPage = 1;
  loadClients();
}

function clearFilters() {
  document.getElementById('global-search').value = '';
  document.getElementById('filter-brand').value = '';
  document.getElementById('filter-model').value = '';
  document.getElementById('filter-serial').value = '';
  document.getElementById('filter-category').value = '';
  document.querySelectorAll('.column-search input').forEach((input) => {
    input.value = '';
  });

  currentFilters = {
    search: '',
    brand: '',
    model: '',
    serialNumber: '',
    category: '',
    columnSearch: {}
  };
  currentPage = 1;
  loadClients();
}

function handleSort(column) {
  if (currentSort.column === column) {
    currentSort.order = currentSort.order === 'ASC' ? 'DESC' : 'ASC';
  } else {
    currentSort.column = column;
    currentSort.order = 'ASC';
  }

  document.querySelectorAll('th.sortable').forEach((th) => {
    th.classList.remove('sorted-asc', 'sorted-desc');
  });

  const th = document.querySelector(`th[data-column="${column}"]`);
  if (th) {
    th.classList.add(currentSort.order === 'ASC' ? 'sorted-asc' : 'sorted-desc');
  }

  loadClients();
}

function updatePagination(pagination) {
  totalPages = pagination.totalPages;
  document.getElementById('pagination-info').textContent = 
    `Page ${pagination.page} sur ${totalPages} (${pagination.total} clients)`;

  document.getElementById('prev-page').disabled = currentPage === 1;
  document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;
}

async function exportCSV() {
  const params = new URLSearchParams({
    page: 1,
    limit: 10000,
    search: currentFilters.search,
    sortBy: currentSort.column,
    sortOrder: currentSort.order,
    brand: currentFilters.brand,
    model: currentFilters.model,
    serialNumber: currentFilters.serialNumber,
    category: currentFilters.category,
    columnSearch: JSON.stringify(currentFilters.columnSearch)
  });

  try {
    const response = await fetch(`/api/clients?${params}`);
    const data = await response.json();

    const csv = [
      ['Cabinet', 'Contact', 'Activité', 'Adresse', 'Code Postal', 'Canton', 'Ville', 'Téléphone', 'Email', 'Équipements', 'Rendez-vous', 'Notes'].join(';'),
      ...data.clients.map((c) =>
        [
          c.cabinet_name,
          c.contact_name,
          c.activity,
          c.address,
          c.postal_code || '',
          c.canton,
          c.city,
          c.phone || '',
          c.email || '',
          c.equipment_count,
          formatDate(c.appointment_at),
          (c.notes || '').replace(/[\r\n]+/g, ' ')
        ].map((field) => `"${field}"`).join(';')
      )
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `clients_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showNotification('Export CSV réussi', 'success');
  } catch (error) {
    console.error('Erreur export CSV:', error);
    showNotification("Erreur lors de l'export", 'error');
  }
}

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

function formatDate(dateString) {
  if (!dateString) return '-';
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// À ajouter à la fin de clients.js, APRÈS toutes les autres fonctions
document.addEventListener('DOMContentLoaded', function() {
  // Gestion du modal client - fermeture sur clic du fond
  const clientModal = document.getElementById('client-modal');
  if (clientModal) {
    clientModal.addEventListener('click', function(e) {
      // Si on clique sur le fond du modal (pas sur le contenu), on le ferme
      if (e.target === clientModal) {
        closeClientModal();
      }
    });
  }
  
  // Gestion du modal historique - fermeture sur clic du fond
  const historyModal = document.getElementById('history-modal');
  if (historyModal) {
    historyModal.addEventListener('click', function(e) {
      // Si on clique sur le fond du modal (pas sur le contenu), on le ferme
      if (e.target === historyModal) {
        closeHistoryModal();
      }
    });
  }
  
  // Gestion du modal équipement - fermeture sur clic du fond
  const equipmentModal = document.getElementById('equipment-modal');
  if (equipmentModal) {
    equipmentModal.addEventListener('click', function(e) {
      if (e.target === equipmentModal) {
        closeEquipmentModal();
      }
    });
  }
  
  // Gestion du modal suppression - fermeture sur clic du fond
  const deleteModal = document.getElementById('delete-modal');
  if (deleteModal) {
    deleteModal.addEventListener('click', function(e) {
      if (e.target === deleteModal) {
        closeDeleteModal();
      }
    });
  }
});

// Fermer les modals avec la touche Échap
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    // Fermer le modal le plus haut dans la pile
    if (document.getElementById('history-modal').classList.contains('active')) {
      closeHistoryModal();
    } else if (document.getElementById('equipment-modal').classList.contains('active')) {
      closeEquipmentModal();
    } else if (document.getElementById('client-modal').classList.contains('active')) {
      closeClientModal();
    } else if (document.getElementById('delete-modal').classList.contains('active')) {
      closeDeleteModal();
    }
  }
});

// Exposer les fonctions globalement
window.openClientDetails = openClientDetails;
window.editHistoryEntry = editHistoryEntry;
window.deleteHistoryEntry = deleteHistoryEntry;
window.toggleEquipmentSelection = toggleEquipmentSelection;