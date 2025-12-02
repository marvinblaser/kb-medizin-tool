/**
 * KB Medizin Technik - Clients Logic
 * Version: Fixed (SafeAdd Hoisting)
 */

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
let currentLimit = 25;

// Variables contextuelles
let currentClientForEquipment = null;
let equipmentCatalog = [];
let technicians = [];
let currentClientEquipment = [];
let selectedEquipmentIds = [];
let currentHistoryId = null;

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  
  // 1. Chargement initial des données
  await checkAuth();
  await loadTechnicians();
  await loadClients();
  await loadEquipmentCatalog();

  // 2. Gestion de l'ouverture automatique depuis le dashboard
  const urlParams = new URLSearchParams(window.location.search);
  const openId = urlParams.get('open');
  if (openId) {
    window.history.replaceState({}, document.title, "/clients.html");
    setTimeout(() => {
        openClientDetails(parseInt(openId));
    }, 500);
  }

  // 3. Toggle Filtres Avancés
  const toggleBtn = document.getElementById('toggle-filters-btn');
  const filtersPanel = document.getElementById('advanced-filters');
  if (toggleBtn && filtersPanel) {
    toggleBtn.addEventListener('click', () => {
      filtersPanel.classList.toggle('hidden');
      toggleBtn.classList.toggle('active');
    });
  }

  // 4. Events Globaux (Utilisation de safeAdd)
  safeAdd('logout-btn', 'click', () => logout());
  safeAdd('add-client-btn', 'click', () => openClientModal());
  safeAdd('cancel-modal-btn', 'click', closeClientModal);
  safeAdd('save-client-btn', 'click', saveClient);
  safeAdd('export-csv-btn', 'click', exportCSV);
  
  // NOUVEAU : Bouton outil géo
  safeAdd('open-geo-tool-btn', 'click', openGeoTool);
  
  // Recherche Globale
  const globalSearch = document.getElementById('global-search');
  if (globalSearch) globalSearch.addEventListener('input', debounce((e) => handleGlobalSearch(e), 300));

  // Filtres spécifiques
  ['brand', 'model', 'serial', 'category'].forEach(f => {
    const el = document.getElementById(`filter-${f}`);
    if (el) el.addEventListener('input', debounce(() => handleEquipmentFilters(), 300));
  });

  safeAdd('clear-filters-btn', 'click', () => clearFilters());
  
  // Sélecteur de limite
  const limitSelect = document.getElementById('limit-select');
  if (limitSelect) {
    limitSelect.addEventListener('change', function() {
      currentLimit = parseInt(this.value);
      currentPage = 1;
      loadClients();
    });
  }

  // --- RECHERCHE COLONNES ---
  const columnInputs = document.querySelectorAll('.column-search input, .column-search select');
  columnInputs.forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
    const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
    
    input.addEventListener(eventType, debounce((e) => {
      let column = e.target.getAttribute('data-column');
      if (!column) {
        const th = e.target.closest('th');
        if (th) column = th.getAttribute('data-column');
      }
      if (column) {
        currentFilters.columnSearch[column] = e.target.value;
        currentPage = 1;
        loadClients();
      }
    }, 300));
  });

  // Tri Colonnes
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', (e) => {
      if (!e.target.matches('input') && !e.target.matches('select')) {
        handleSort(th.dataset.column);
      }
    });
  });

  // Pagination
  safeAdd('prev-page', 'click', () => { if (currentPage > 1) { currentPage--; loadClients(); } });
  safeAdd('next-page', 'click', () => { if (currentPage < totalPages) { currentPage++; loadClients(); } });

  // Modals Suppression
  safeAdd('cancel-delete-btn', 'click', () => closeDeleteModal());
  safeAdd('confirm-delete-btn', 'click', () => confirmDelete());

  // Équipements
  safeAdd('add-equipment-item-btn', 'click', () => showEquipmentForm());
  safeAdd('cancel-equipment-item-btn', 'click', () => hideEquipmentForm());
  safeAdd('save-equipment-item-btn', 'click', () => saveEquipmentItem());
  
  // Historique
  safeAdd('add-history-btn', 'click', () => openHistoryModal());
  safeAdd('cancel-history-btn', 'click', () => closeHistoryModal());
  safeAdd('save-history-btn', 'click', () => saveHistoryEntry());

  // Calcul Automatique Date Maintenance
  const lastMaint = document.getElementById('last-maintenance');
  const maintInterval = document.getElementById('maintenance-interval');
  if (lastMaint && maintInterval) {
    const updateNext = () => {
      const next = calculateNextMaintenance(lastMaint.value, maintInterval.value);
      const display = document.getElementById('next-maintenance-display');
      if (display && next) display.textContent = formatDate(next);
    };
    lastMaint.addEventListener('change', updateNext);
    maintInterval.addEventListener('change', updateNext);
  }

  // Fermeture des menus
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu')) {
      document.querySelectorAll('.action-menu-dropdown').forEach((menu) => menu.classList.remove('active'));
    }
  });

  // Fermeture Modals
  ['client-modal', 'client-details-modal', 'history-modal', 'equipment-modal', 'delete-modal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) {
      m.addEventListener('click', (e) => { 
        if (e.target === m) m.classList.remove('active'); 
      });
    }
  });
});

/* ========== FONCTIONS GLOBALES (DÉCLARÉES ICI POUR ÉVITER LES ERREURS) ========== */

// Helper sécurisé pour ajouter des événements
function safeAdd(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

// Outil Géolocalisation
function openGeoTool() {
  const address = document.getElementById('address').value;
  const zip = document.getElementById('postal-code').value;
  const city = document.getElementById('city').value;
  
  const params = new URLSearchParams({
    address: address || '',
    zip: zip || '',
    city: city || ''
  });

  const width = 600;
  const height = 700;
  const left = (window.screen.width / 2) - (width / 2);
  const top = (window.screen.height / 2) - (height / 2);
  
  window.open(
    `/geo-tool.html?${params.toString()}`, 
    'KBMedGeoTool', 
    `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
  );
}

// Réception des coordonnées depuis la popup
window.receiveCoordinates = function(lat, lon) {
  document.getElementById('client-lat').value = lat;
  document.getElementById('client-lon').value = lon;
  
  const latInput = document.getElementById('client-lat');
  const lonInput = document.getElementById('client-lon');
  
  latInput.style.borderColor = 'var(--color-success)';
  lonInput.style.borderColor = 'var(--color-success)';
  
  setTimeout(() => {
    latInput.style.borderColor = '';
    lonInput.style.borderColor = '';
  }, 1500);
};

/* ========== CHARGEMENT DES CLIENTS ========== */
async function loadClients() {
  const cleanColumnSearch = {};
  for (const [key, value] of Object.entries(currentFilters.columnSearch)) {
    if (value !== '' && value !== null) cleanColumnSearch[key] = value;
  }

  const params = new URLSearchParams({
    page: currentPage, 
    limit: currentLimit, 
    search: currentFilters.search,
    sortBy: currentSort.column, 
    sortOrder: currentSort.order,
    brand: currentFilters.brand, 
    model: currentFilters.model,
    serialNumber: currentFilters.serialNumber, 
    category: currentFilters.category,
    columnSearch: JSON.stringify(cleanColumnSearch)
  });

  try {
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json();

    const clientsWithEq = await Promise.all(data.clients.map(async c => {
      try {
        const r = await fetch(`/api/clients/${c.id}/equipment`);
        return { ...c, equipment: await r.json() };
      } catch { return { ...c, equipment: [] }; }
    }));

    renderClients(clientsWithEq);
    updatePagination(data.pagination);
  } catch (e) { console.error(e); }
}

function renderClients(clients) {
  const tbody = document.getElementById('clients-tbody');
  if (clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fas fa-inbox"></i><p>Aucun client trouvé</p></td></tr>`;
    return;
  }

  tbody.innerHTML = clients.map(client => `
    <tr>
      <td data-label="Cabinet">
        <div class="client-info-cell">
          <strong class="client-name">${escapeHtml(client.cabinet_name)}</strong>
          <div class="client-meta">
            <span><i class="fas fa-user"></i> ${escapeHtml(client.contact_name)}</span>
            ${client.phone ? `<span><i class="fas fa-phone"></i> <a href="tel:${client.phone}">${escapeHtml(client.phone)}</a></span>` : ''}
          </div>
        </div>
      </td>
      <td data-label="Activité"><span class="badge badge-info">${escapeHtml(client.activity)}</span></td>
      <td data-label="Localisation">
        <div class="client-info-cell">
          <div style="font-weight:600; color:var(--text-main);">${escapeHtml(client.address)}</div>
          <div style="color:var(--text-muted); font-size:0.85rem;">
            ${escapeHtml(client.postal_code || '')} ${escapeHtml(client.city)}
            ${client.canton ? `(${escapeHtml(client.canton)})` : ''}
          </div>
        </div>
      </td>
      <td data-label="Équipements">${renderEquipmentColumn(client)}</td>
      <td data-label="Rendez-vous">${formatDate(client.appointment_at)}</td>
      <td data-label="Actions">
        <div class="action-menu">
          <button class="action-menu-trigger" onclick="toggleActionMenu(event, ${client.id})"><i class="fas fa-ellipsis-v"></i></button>
          <div class="action-menu-dropdown" id="action-menu-${client.id}">
            <button class="action-menu-item" onclick="openClientDetails(${client.id})"><i class="fas fa-folder-open"></i> Voir fiche</button>
            <button class="action-menu-item" onclick="openEquipmentModal(${client.id}, '${escapeHtml(client.cabinet_name).replace(/'/g,"\\'")}')"><i class="fas fa-tools"></i> Équipements</button>
            <button class="action-menu-item" onclick="openClientModal(${client.id})"><i class="fas fa-edit"></i> Modifier</button>
            <button class="action-menu-item danger" onclick="openDeleteModal(${client.id}, '${escapeHtml(client.cabinet_name).replace(/'/g,"\\'")}')"><i class="fas fa-trash"></i> Supprimer</button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderEquipmentColumn(client) {
  if (!client.equipment || client.equipment.length === 0) return '<div class="equipment-empty"><i class="fas fa-box-open"></i> Vide</div>';
  
  return `<div class="equipment-badges">
    ${client.equipment.map(eq => {
      const { badge, daysLeft } = getMaintenanceBadge(eq.next_maintenance_date);
      
      let display = eq.final_name || eq.name;
      if (!display || display === 'undefined') {
         display = (eq.final_brand || eq.brand || '') + ' ' + (eq.final_type || eq.type || '');
         if (!display.trim()) display = 'Équipement';
      }

      // FIX ALIGNEMENT GRID
      return `<div class="equipment-badge-item">
        <span class="equipment-badge-name" title="${escapeHtml(display)}">${escapeHtml(display)}</span>
        <div class="equipment-badge-status">${badge}</div>
        <div class="equipment-badge-days">${daysLeft ? daysLeft : ''}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function getMaintenanceBadge(dateString) {
  if (!dateString) return { badge: '<span class="badge badge-primary">À définir</span>', daysLeft: null };
  const date = new Date(dateString);
  const today = new Date(); today.setHours(0,0,0,0);
  const diffTime = date - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { badge: '<span class="badge badge-danger">EXPIRÉ</span>', daysLeft: `${Math.abs(diffDays)}j retard` };
  else if (diffDays <= 30) return { badge: '<span class="badge badge-warning">BIENTÔT</span>', daysLeft: `${diffDays}j` };
  else return { badge: '<span class="badge badge-success">OK</span>', daysLeft: `${diffDays}j restants` };
}

/* ========== MODALES & ACTIONS ========== */
async function openClientModal(id = null) {
  const modal = document.getElementById('client-modal');
  const form = document.getElementById('client-form');
  const historySec = document.getElementById('history-section');
  form.reset();
  document.getElementById('client-id').value = '';
  historySec.style.display = 'none';

  if (id) {
    document.getElementById('modal-title').innerHTML = '<i class="fas fa-edit"></i> Modifier';
    historySec.style.display = 'block';
    try {
      const res = await fetch(`/api/clients/${id}`);
      const c = await res.json();
      document.getElementById('client-id').value = c.id;
      document.getElementById('cabinet-name').value = c.cabinet_name;
      document.getElementById('contact-name').value = c.contact_name;
      document.getElementById('activity').value = c.activity;
      document.getElementById('address').value = c.address;
      document.getElementById('postal-code').value = c.postal_code || '';
      document.getElementById('city').value = c.city;
      document.getElementById('canton').value = c.canton || '';
      document.getElementById('phone').value = c.phone || '';
      document.getElementById('email').value = c.email || '';
      document.getElementById('appointment').value = c.appointment_at || '';
      document.getElementById('technician').value = c.technician_id || '';
      document.getElementById('notes').value = c.notes || '';
      
      // Coordonnées GPS
      document.getElementById('client-lat').value = c.latitude || '';
      document.getElementById('client-lon').value = c.longitude || '';

      await loadAppointmentsHistory(id);
    } catch(e) { console.error(e); }
  } else {
    document.getElementById('modal-title').innerHTML = '<i class="fas fa-plus-circle"></i> Nouveau';
  }
  modal.classList.add('active');
}

function closeClientModal() { document.getElementById('client-modal').classList.remove('active'); }

async function saveClient() {
  const btn = document.getElementById('save-client-btn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
  
  const id = document.getElementById('client-id').value;
  const latVal = document.getElementById('client-lat').value;
  const lonVal = document.getElementById('client-lon').value;

  const data = {
    cabinet_name: document.getElementById('cabinet-name').value,
    contact_name: document.getElementById('contact-name').value,
    activity: document.getElementById('activity').value,
    address: document.getElementById('address').value,
    postal_code: document.getElementById('postal-code').value,
    city: document.getElementById('city').value,
    canton: document.getElementById('canton').value,
    phone: document.getElementById('phone').value,
    email: document.getElementById('email').value,
    appointment_at: document.getElementById('appointment').value,
    technician_id: document.getElementById('technician').value || null,
    notes: document.getElementById('notes').value,
    latitude: latVal ? parseFloat(latVal) : null,
    longitude: lonVal ? parseFloat(lonVal) : null
  };

  try {
    const url = id ? `/api/clients/${id}` : '/api/clients';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
    if(res.ok) { closeClientModal(); loadClients(); showNotification('Enregistré', 'success'); }
    else { const err = await res.json(); showNotification(err.error || 'Erreur', 'error'); }
  } catch(e) { console.error(e); }
  btn.innerHTML = 'Enregistrer'; btn.disabled = false;
}

// ========== GESTION ÉQUIPEMENTS (MODALE) ==========
async function openEquipmentModal(clientId, clientName) {
  currentClientForEquipment = clientId;
  const nameEl = document.getElementById('equipment-client-name');
  if(nameEl) nameEl.textContent = ` - ${clientName}`;
  const idEl = document.getElementById('equipment-client-id');
  if(idEl) idEl.value = clientId;
  
  await loadClientEquipment(clientId);
  
  const select = document.getElementById('equipment-select');
  if(select) {
    select.innerHTML = '<option value="">-- Sélectionner --</option>' + 
      equipmentCatalog.map(eq => `<option value="${eq.id}">${eq.name} - ${eq.brand}</option>`).join('');
  }
  
  hideEquipmentForm();
  document.getElementById('equipment-modal').classList.add('active');
}

function closeEquipmentModal() { document.getElementById('equipment-modal').classList.remove('active'); loadClients(); }

async function loadClientEquipment(id) {
  const res = await fetch(`/api/clients/${id}/equipment`);
  const eq = await res.json();
  const cont = document.getElementById('equipment-list-container');
  
  if(eq.length === 0) { 
    cont.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Aucun équipement installé.</p>'; 
    return; 
  }
  
  cont.innerHTML = eq.map(e => {
    const { badge, daysLeft } = getMaintenanceBadge(e.next_maintenance_date);
    let display = e.final_name || e.name || `${e.final_brand || e.brand || ''} ${e.final_type || e.type || ''}`.trim() || 'Équipement';
    return `
    <div class="equipment-detail-card">
      <div class="equipment-detail-header">
        <div>
          <strong class="equipment-detail-name">${escapeHtml(display)}</strong>
          <div class="equipment-detail-meta">
            <span><i class="fas fa-industry"></i> ${escapeHtml(e.brand || '-')}</span>
            <span><i class="fas fa-th-large"></i> ${escapeHtml(e.type || '-')}</span>
          </div>
        </div>
        <div style="text-align:right;">${badge}${daysLeft ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${daysLeft}</div>` : ''}</div>
      </div>
      <div class="equipment-detail-grid">
        <div class="equipment-detail-item"><small>SÉRIE</small><strong>${escapeHtml(e.serial_number || '-')}</strong></div>
        <div class="equipment-detail-item"><small>INSTALLATION</small><strong>${formatDate(e.installed_at)}</strong></div>
        <div class="equipment-detail-item"><small>DERNIÈRE MAINT.</small><strong>${formatDate(e.last_maintenance_date)}</strong></div>
        <div class="equipment-detail-item"><small>PROCHAINE</small><strong style="color:var(--color-primary)">${formatDate(e.next_maintenance_date)}</strong></div>
      </div>
      <div class="equipment-detail-actions">
        <button class="btn btn-sm btn-secondary" onclick="editEquipmentItem(${e.id})"><i class="fas fa-edit"></i> Modifier</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEquipmentItem(${e.id})"><i class="fas fa-trash"></i> Supprimer</button>
      </div>
    </div>`;
  }).join('');
}

async function editEquipmentItem(itemId) {
  try {
    const res = await fetch(`/api/clients/${currentClientForEquipment}/equipment`);
    const items = await res.json();
    const item = items.find(i => i.id === itemId);
    if (item) {
      document.getElementById('equipment-item-id').value = item.id;
      document.getElementById('equipment-select').value = item.equipment_id;
      document.getElementById('equipment-serial').value = item.serial_number || '';
      document.getElementById('equipment-installed').value = item.installed_at || '';
      document.getElementById('equipment-warranty').value = item.warranty_until || '';
      document.getElementById('last-maintenance').value = item.last_maintenance_date || '';
      document.getElementById('maintenance-interval').value = item.maintenance_interval || '1';
      const next = calculateNextMaintenance(item.last_maintenance_date, item.maintenance_interval || 1);
      const disp = document.getElementById('next-maintenance-display');
      if(disp) disp.textContent = next ? formatDate(next) : 'Saisissez la dernière maintenance';
      showEquipmentForm();
    }
  } catch(e) { console.error(e); showNotification('Erreur chargement', 'error'); }
}

async function saveEquipmentItem() {
  const eqId = document.getElementById('equipment-select').value;
  const itemId = document.getElementById('equipment-item-id').value;
  const clientId = currentClientForEquipment;
  if (!eqId) return showNotification('Sélectionnez un équipement', 'error');
  
  const lastMaint = document.getElementById('last-maintenance').value;
  const interval = document.getElementById('maintenance-interval').value;
  const nextMaint = calculateNextMaintenance(lastMaint, interval);

  const data = {
    equipment_id: eqId,
    serial_number: document.getElementById('equipment-serial').value,
    installed_at: document.getElementById('equipment-installed').value,
    warranty_until: document.getElementById('equipment-warranty').value,
    last_maintenance_date: lastMaint,
    maintenance_interval: interval,
    next_maintenance_date: nextMaint
  };
  
  const url = itemId ? `/api/clients/${clientId}/equipment/${itemId}` : `/api/clients/${clientId}/equipment`;
  const method = itemId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
    if(res.ok) {
        hideEquipmentForm(); 
        loadClientEquipment(clientId); 
        showNotification('Équipement enregistré', 'success');
    } else {
        const err = await res.json();
        showNotification(err.error || 'Erreur lors de l\'enregistrement', 'error');
    }
  } catch (e) { console.error(e); showNotification('Erreur technique', 'error'); }
}

function showEquipmentForm() { document.getElementById('equipment-form-container').classList.remove('hidden'); document.getElementById('add-equipment-item-btn').classList.add('hidden'); }
function hideEquipmentForm() { document.getElementById('equipment-form-container').classList.add('hidden'); document.getElementById('add-equipment-item-btn').classList.remove('hidden'); document.getElementById('equipment-item-form').reset(); document.getElementById('equipment-item-id').value = ''; }
async function deleteEquipmentItem(id) { if(!confirm('Supprimer ?')) return; await fetch(`/api/clients/${currentClientForEquipment}/equipment/${id}`, {method:'DELETE'}); loadClientEquipment(currentClientForEquipment); showNotification('Supprimé', 'success'); }

// ========== FICHE DÉTAILLÉE ==========
async function openClientDetails(id) {
  const res = await fetch(`/api/clients/${id}`); const c = await res.json();
  const req = await fetch(`/api/clients/${id}/equipment`); const eq = await req.json();
  const raph = await fetch(`/api/clients/${id}/appointments`); const hist = await raph.json();
  renderClientDetails(c, eq, hist); 
  document.getElementById('edit-from-details-btn').onclick = () => { closeClientDetailsModal(); openClientModal(id); };
  document.getElementById('client-details-modal').classList.add('active');
}

function closeClientDetailsModal() { document.getElementById('client-details-modal').classList.remove('active'); }

function renderClientDetails(client, equipment, appointments) {
  const content = document.getElementById('client-details-content');
  const nextApt = client.appointment_at ? formatDate(client.appointment_at) : '<span class="text-muted">Aucun</span>';
  const lastApt = appointments.length > 0 ? formatDate(appointments[0].appointment_date) : '<span class="text-muted">Aucun</span>';

  content.innerHTML = `
    <div class="client-details-grid">
      <div class="detail-block">
        <h4 class="detail-block-title"><i class="fas fa-address-card"></i> Coordonnées</h4>
        <div class="detail-row"><span class="detail-label">Contact:</span><span class="detail-value">${escapeHtml(client.contact_name)}</span></div>
        <div class="detail-row"><span class="detail-label">Téléphone:</span><span class="detail-value">${client.phone ? `<a href="tel:${client.phone}">${escapeHtml(client.phone)}</a>` : '-'}</span></div>
        <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${client.email ? `<a href="mailto:${client.email}">${escapeHtml(client.email)}</a>` : '-'}</span></div>
      </div>
      <div class="detail-block">
        <h4 class="detail-block-title"><i class="fas fa-map-marker-alt"></i> Localisation</h4>
        <div class="detail-row"><span class="detail-label">Adresse:</span><span class="detail-value">${escapeHtml(client.address)}</span></div>
        <div class="detail-row"><span class="detail-label">Ville:</span><span class="detail-value">${client.postal_code||''} ${escapeHtml(client.city)}</span></div>
        <div class="detail-row"><span class="detail-label">Canton:</span><span class="detail-value">${escapeHtml(client.canton||'-')}</span></div>
      </div>
      <div class="detail-block">
        <h4 class="detail-block-title"><i class="fas fa-calendar-check"></i> Suivi</h4>
        <div class="detail-row"><span class="detail-label">Activité:</span><span class="detail-value"><span class="badge badge-info">${escapeHtml(client.activity)}</span></span></div>
        <div class="detail-row"><span class="detail-label">Dernier RDV:</span><span class="detail-value">${lastApt}</span></div>
        <div class="detail-row"><span class="detail-label">Prochain:</span><span class="detail-value" style="color:var(--color-primary)">${nextApt}</span></div>
      </div>
    </div>
    
    <div class="form-section">
      <h3 class="form-section-title"><i class="fas fa-tools"></i> Équipements (${equipment.length})</h3>
      ${equipment.length > 0 ? `
        <div style="display: grid; gap: 1rem;">
          ${equipment.map(eq => {
            const { badge, daysLeft } = getMaintenanceBadge(eq.next_maintenance_date);
            let display = eq.final_name || eq.name;
            if (!display || display === 'undefined') {
               display = (eq.final_brand || eq.brand || '') + ' ' + (eq.final_type || eq.type || '');
               if (!display.trim()) display = 'Équipement';
            }
            return `
              <div class="equipment-detail-card">
                <div class="equipment-detail-header">
                  <div>
                    <strong class="equipment-detail-name">${escapeHtml(display)}</strong>
                    <div class="equipment-detail-meta">
                      <span><i class="fas fa-industry"></i> ${escapeHtml(eq.final_brand || eq.brand || '-')}</span>
                      <span><i class="fas fa-th-large"></i> ${escapeHtml(eq.final_type || eq.type || '-')}</span>
                    </div>
                  </div>
                  <div style="text-align:right;">${badge}${daysLeft ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${daysLeft}</div>` : ''}</div>
                </div>
                <div class="equipment-detail-grid">
                  <div class="equipment-detail-item"><small>SÉRIE</small><strong>${escapeHtml(eq.serial_number||'-')}</strong></div>
                  <div class="equipment-detail-item"><small>INSTALLATION</small><strong>${formatDate(eq.installed_at)}</strong></div>
                  <div class="equipment-detail-item"><small>DERNIÈRE MAINT.</small><strong>${formatDate(eq.last_maintenance_date)}</strong></div>
                  <div class="equipment-detail-item"><small>PROCHAINE</small><strong style="color:var(--color-primary)">${formatDate(eq.next_maintenance_date)}</strong></div>
                </div>
              </div>`;
          }).join('')}
        </div>
      ` : '<p class="text-center text-muted">Aucun équipement installé.</p>'}
    </div>
  `;
}

// ========== HELPERS ==========
async function exportCSV() {
  const params = new URLSearchParams({ page: 1, limit: 10000, search: currentFilters.search });
  try {
    const r = await fetch(`/api/clients?${params}`); const d = await r.json();
    const csv = [['Cabinet', 'Contact', 'Ville', 'Téléphone'].join(';'), ...d.clients.map(c => [c.cabinet_name, c.contact_name, c.city, c.phone].map(f => `"${f||''}"`).join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'clients.csv'; link.click();
  } catch { showNotification("Erreur export", 'error'); }
}
async function loadTechnicians() { try { const r = await fetch('/api/admin/users'); technicians = (await r.json()).filter(u => u.is_active); const sel = document.getElementById('technician'); if(sel) sel.innerHTML='<option value="">--</option>'+technicians.map(t=>`<option value="${t.id}">${t.name}</option>`).join(''); } catch{} }
async function loadEquipmentCatalog() { try { const r = await fetch('/api/admin/equipment'); equipmentCatalog = await r.json(); } catch{} }
function calculateNextMaintenance(date, interval) { if(!date)return null; const d=new Date(date); d.setFullYear(d.getFullYear()+parseInt(interval)); return d.toISOString().split('T')[0]; }
function openDeleteModal(id, name) { clientToDelete=id; document.getElementById('delete-client-name').innerText=name; document.getElementById('delete-modal').classList.add('active'); }
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); }
async function confirmDelete() { await fetch(`/api/clients/${clientToDelete}`, {method:'DELETE'}); closeDeleteModal(); loadClients(); }
function toggleActionMenu(e, id) { e.stopPropagation(); document.querySelectorAll('.action-menu-dropdown').forEach(m => m.classList.remove('active')); document.getElementById(`action-menu-${id}`).classList.toggle('active'); }
function handleGlobalSearch(e) { currentFilters.search=e.target.value; currentPage=1; loadClients(); }
function handleEquipmentFilters() { currentFilters.brand=document.getElementById('filter-brand').value; currentPage=1; loadClients(); }
function clearFilters() { document.getElementById('global-search').value=''; document.querySelectorAll('.column-search input').forEach(i=>i.value=''); currentFilters={search:'',columnSearch:{}}; loadClients(); }
function updatePagination(p) { totalPages=p.totalPages; document.getElementById('pagination-info').textContent=`Page ${p.page} / ${totalPages}`; document.getElementById('prev-page').disabled=p.page===1; document.getElementById('next-page').disabled=p.page===totalPages; }
function formatDate(d) { if(!d)return '-'; return new Date(d).toLocaleDateString('fr-CH'); }
function escapeHtml(t) { if(!t)return ''; return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function debounce(f,w) { let t; return function(...a){ clearTimeout(t); t=setTimeout(()=>f.apply(this,a),w); }; }
async function checkAuth() { return fetch('/api/me').then(r=>r.ok?r.json():window.location='/login.html').then(d=>{ const ui=document.getElementById('user-info'); if(ui) ui.innerHTML=`<div class="user-avatar">${d.user.name[0]}</div><div class="user-details"><strong>${d.user.name}</strong><span>${d.user.role}</span></div>`; if(d.user.role==='admin') document.getElementById('admin-link')?.classList.remove('hidden'); }); }
async function logout() { await fetch('/api/logout', {method:'POST'}); window.location='/login.html'; }
function showNotification(msg, type) { const d=document.createElement('div'); d.className=`notification notification-${type} show`; d.innerHTML=`<i class="fas fa-info-circle"></i> ${msg}`; document.body.appendChild(d); setTimeout(()=>d.remove(),3000); }
function handleSort(col) { if(currentSort.column===col) currentSort.order=currentSort.order==='ASC'?'DESC':'ASC'; else {currentSort.column=col; currentSort.order='ASC';} loadClients(); }

// --- HISTORIQUE & INTERVENTIONS ---

async function openHistoryModal() {
  const cid = document.getElementById('client-id').value;
  
  if (!cid) {
    return showNotification('Veuillez d\'abord enregistrer le client', 'warning');
  }
  
  document.getElementById('history-client-id').value = cid;
  document.getElementById('history-form').reset();
  
  // Date du jour par défaut
  document.getElementById('history-date').value = new Date().toISOString().split('T')[0];

  // 1. Charger Techniciens (si pas déjà fait ou refresh)
  const techSelect = document.getElementById('history-technician');
  if (techSelect.options.length <= 1 && technicians.length > 0) {
    techSelect.innerHTML = '<option value="">-- Sélectionner --</option>' + 
      technicians.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  }

  // 2. Charger les Rapports du client
  try {
    // On utilise le filtre search côté serveur ou on filtre ici si pas d'endpoint dédié
    // Pour simplifier, on fetch tout et on filtre (optimisation possible plus tard)
    const repRes = await fetch(`/api/reports?limit=1000`); 
    const repData = await repRes.json();
    
    // Filtrer pour ce client
    const clientReports = repData.reports.filter(r => r.client_id == cid);
    
    const reportSelect = document.getElementById('history-report');
    if (clientReports.length > 0) {
      reportSelect.innerHTML = '<option value="">-- Aucun rapport lié --</option>' + 
        clientReports.map(r => `<option value="${r.id}">${r.report_number} - ${formatDate(r.created_at)} (${r.work_type})</option>`).join('');
    } else {
      reportSelect.innerHTML = '<option value="">Aucun rapport disponible</option>';
    }
  } catch (e) {
    console.error("Erreur chargement rapports", e);
  }

  // 3. Charger les Équipements du client (Checkboxes)
  try {
    const res = await fetch(`/api/clients/${cid}/equipment`);
    const eqs = await res.json();
    const container = document.getElementById('history-equipment-list');
    
    if (eqs.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:10px;">Aucun équipement installé.</p>';
    } else {
      container.innerHTML = eqs.map(e => {
        let display = e.final_name || e.name || 'Équipement';
        return `
          <div class="checkbox-group" style="margin-bottom:5px; padding-bottom:5px; border-bottom:1px dashed #eee;">
            <input type="checkbox" id="heq-${e.id}" value="${e.id}">
            <label for="heq-${e.id}" style="font-size:0.9rem;">
              <strong>${escapeHtml(display)}</strong>
              <span style="color:var(--neutral-500); font-size:0.8rem;"> - ${escapeHtml(e.brand)} (${escapeHtml(e.serial_number||'No S/N')})</span>
            </label>
          </div>
        `;
      }).join('');
    }
  } catch (e) {
    console.error("Erreur chargement équipements", e);
  }

  document.getElementById('history-modal').classList.add('active');
}

function closeHistoryModal() {
  document.getElementById('history-modal').classList.remove('active');
}

async function saveHistoryEntry() {
  const btn = document.getElementById('save-history-btn');
  btn.disabled = true;
  
  const cid = document.getElementById('history-client-id').value;
  const date = document.getElementById('history-date').value;
  const task = document.getElementById('history-task').value;
  const techId = document.getElementById('history-technician').value;
  const reportId = document.getElementById('history-report').value;
  
  if(!date || !task || !techId) {
    showNotification('Veuillez remplir les champs obligatoires (*)', 'error');
    btn.disabled = false;
    return;
  }

  const eqIds = Array.from(document.querySelectorAll('#history-equipment-list input:checked')).map(i => i.value);
  
  const data = { 
    appointment_date: date, 
    task_description: task, 
    technician_id: techId, 
    report_id: reportId || null,
    equipment_ids: eqIds 
  };

  try {
    const res = await fetch(`/api/clients/${cid}/appointments`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(data)
    });
    
    if(res.ok) {
      closeHistoryModal();
      showNotification('Intervention ajoutée', 'success');
      loadAppointmentsHistory(cid); // Rafraîchir la liste
    } else {
      showNotification('Erreur lors de l\'enregistrement', 'error');
    }
  } catch (e) {
    console.error(e);
    showNotification('Erreur serveur', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function loadAppointmentsHistory(cid) {
  const container = document.getElementById('appointments-history');
  container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>';

  try {
    const res = await fetch(`/api/clients/${cid}/appointments`);
    const appts = await res.json();
    
    if(appts.length === 0) { 
      container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">Aucune intervention enregistrée.</p>'; 
      return; 
    }
    
    container.innerHTML = `<div class="history-list">` + appts.map(a => {
      // Badge Technicien
      const techBadge = a.technician_name 
        ? `<span class="badge badge-secondary" style="font-size:0.75rem;"><i class="fas fa-user-hard-hat"></i> ${escapeHtml(a.technician_name)}</span>` 
        : '';
        
      // Lien Rapport
      const reportLink = a.report_id && a.report_number
        ? `<a href="/report-view.html?id=${a.report_id}" target="_blank" class="badge badge-primary" style="text-decoration:none; margin-left:5px;">
             <i class="fas fa-file-alt"></i> ${a.report_number}
           </a>`
        : '';

      return `
        <div class="history-item">
          <div class="history-item-date">
            <span><i class="fas fa-calendar-day"></i> ${formatDate(a.appointment_date)}</span>
            <div style="margin-left:auto;">${techBadge} ${reportLink}</div>
          </div>
          <div class="history-item-content">
            ${escapeHtml(a.task_description)}
          </div>
        </div>
      `;
    }).join('') + `</div>`;
    
  } catch(e) {
    console.error(e);
    container.innerHTML = '<p style="color:red; text-align:center;">Erreur de chargement</p>';
  }
}

// Exports
window.openClientDetails=openClientDetails; window.openClientModal=openClientModal; window.openEquipmentModal=openEquipmentModal; window.openDeleteModal=openDeleteModal; window.toggleActionMenu=toggleActionMenu; window.editEquipmentItem=editEquipmentItem; window.deleteEquipmentItem=deleteEquipmentItem; window.saveEquipmentItem=saveEquipmentItem; window.handleSort=handleSort;