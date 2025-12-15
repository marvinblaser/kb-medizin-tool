// public/js/clients.js

/**
 * KB Medizin Technik - Clients Logic
 * Version: Complete & Fixed
 */

let currentPage = 1;
let currentSort = { column: 'cabinet_name', order: 'ASC' };
let currentFilters = {
  search: '',
  brand: '',
  model: '',
  serialNumber: '',
  category: '', 
  device: '',   
  columnSearch: {}
};
let totalPages = 1;
let clientToDelete = null;
let currentLimit = 25;

// Variables contextuelles
let currentClientForEquipment = null;
let equipmentCatalog = [];
let technicians = [];

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadTechnicians();
  await loadEquipmentCatalog();
  await loadClients();

  const urlParams = new URLSearchParams(window.location.search);
  const openId = urlParams.get('open');
  if (openId) {
    window.history.replaceState({}, document.title, "/clients.html");
    setTimeout(() => { openClientDetails(parseInt(openId)); }, 500);
  }

  // Event Listeners UI
  safeAdd('logout-btn', 'click', logout);
  safeAdd('add-client-btn', 'click', () => openClientModal());
  safeAdd('cancel-modal-btn', 'click', closeClientModal);
  safeAdd('save-client-btn', 'click', saveClient);
  safeAdd('export-csv-btn', 'click', exportCSV);
  safeAdd('open-geo-tool-btn', 'click', openGeoTool);
  
  const toggleBtn = document.getElementById('toggle-filters-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.getElementById('advanced-filters').classList.toggle('hidden');
      toggleBtn.classList.toggle('active');
    });
  }

  const globalSearch = document.getElementById('global-search');
  if (globalSearch) globalSearch.addEventListener('input', debounce(handleGlobalSearch, 300));

  ['brand', 'model', 'serial', 'category', 'device'].forEach(f => {
    const el = document.getElementById(`filter-${f}`);
    if (el) el.addEventListener('input', debounce(handleEquipmentFilters, 300));
  });

  safeAdd('clear-filters-btn', 'click', clearFilters);

  document.getElementById('limit-select').addEventListener('change', function() {
    currentLimit = parseInt(this.value); currentPage = 1; loadClients();
  });
  safeAdd('prev-page', 'click', () => { if (currentPage > 1) { currentPage--; loadClients(); } });
  safeAdd('next-page', 'click', () => { if (currentPage < totalPages) { currentPage++; loadClients(); } });

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', (e) => {
      if (!e.target.matches('input') && !e.target.matches('select')) {
        handleSort(th.dataset.column);
      }
    });
  });

  document.querySelectorAll('.column-search input, .column-search select').forEach(input => {
    input.addEventListener('click', e => e.stopPropagation());
    const evtType = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(evtType, debounce((e) => {
      let col = e.target.dataset.column || e.target.closest('th').dataset.column;
      currentFilters.columnSearch[col] = e.target.value; 
      currentPage = 1; 
      loadClients();
    }, 300));
  });

  safeAdd('cancel-delete-btn', 'click', closeDeleteModal);
  safeAdd('confirm-delete-btn', 'click', confirmDelete);
  
  safeAdd('add-equipment-item-btn', 'click', showEquipmentForm);
  safeAdd('cancel-equipment-item-btn', 'click', hideEquipmentForm);
  safeAdd('save-equipment-item-btn', 'click', saveEquipmentItem);
  
  safeAdd('add-history-btn', 'click', openHistoryModal);
  safeAdd('cancel-history-btn', 'click', closeHistoryModal);
  safeAdd('save-history-btn', 'click', saveHistoryEntry);

  const lm = document.getElementById('last-maintenance');
  const mi = document.getElementById('maintenance-interval');
  if(lm && mi) {
    const upd = () => {
      const n = calculateNextMaintenance(lm.value, mi.value);
      const d = document.getElementById('next-maintenance-display');
      if(d) d.textContent = n ? formatDate(n) : 'Saisir date';
    };
    lm.addEventListener('change', upd); mi.addEventListener('change', upd);
  }

  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if(e.target === m) m.classList.remove('active'); });
  });
});

// ========== AUTHENTIFICATION & UI ==========
async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) throw new Error('Not authenticated');
    const data = await response.json();
    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
      userInfoEl.innerHTML = `
        <div class="user-avatar">${data.user.name.charAt(0).toUpperCase()}</div>
        <div class="user-details">
          <strong>${escapeHtml(data.user.name)}</strong>
          <span>${data.user.role === 'admin' ? 'Administrateur' : 'Technicien'}</span>
        </div>
      `;
    }
    if (data.user.role === 'admin') {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.classList.remove('hidden');
    }
  } catch (error) {
    window.location.href = '/login.html';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ========== CHARGEMENT DES DONNÉES ==========
async function loadClients() {
  const cleanCols = {};
  for(const [k,v] of Object.entries(currentFilters.columnSearch)) if(v) cleanCols[k]=v;

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
    device: currentFilters.device,     
    columnSearch: JSON.stringify(cleanCols)
  });

  try {
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json();
    
    const clientsWithEq = await Promise.all(data.clients.map(async c => {
      try { 
        const r = await fetch(`/api/clients/${c.id}/equipment`); 
        return { ...c, equipment: await r.json() }; 
      } catch { 
        return { ...c, equipment: [] }; 
      }
    }));

    renderClients(clientsWithEq);
    updatePagination(data.pagination);
  } catch(e) { 
    console.error(e); 
  }
}

function renderClients(clients) {
  const tbody = document.getElementById('clients-tbody');
  if(clients.length === 0) { 
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Aucun client trouvé</td></tr>`; 
    return; 
  }

  tbody.innerHTML = clients.map(c => `
    <tr>
      <td data-label="Cabinet">
        <div class="client-info-cell">
          <strong class="client-name">${escapeHtml(c.cabinet_name)}</strong>
          <div class="client-meta">
            <span><i class="fas fa-user"></i> ${escapeHtml(c.contact_name)}</span>
            ${c.phone ? `<span><i class="fas fa-phone"></i> <a href="tel:${c.phone}">${escapeHtml(c.phone)}</a></span>` : ''}
          </div>
        </div>
      </td>
      <td data-label="Activité"><span class="badge badge-info">${escapeHtml(c.activity)}</span></td>
      <td data-label="Localisation">
        <div class="client-info-cell">
          <div style="font-weight:600;">${escapeHtml(c.address)}</div>
          <div style="color:var(--neutral-500);font-size:0.85rem;">${escapeHtml(c.postal_code||'')} ${escapeHtml(c.city)} ${c.canton ? `(${c.canton})` : ''}</div>
        </div>
      </td>
      <td data-label="Équipements">${renderEquipmentColumn(c)}</td>
      <td data-label="Rendez-vous">${formatDate(c.appointment_at)}</td>
      <td data-label="Actions">
        <div class="action-menu">
          <button class="action-menu-trigger" onclick="toggleActionMenu(event, ${c.id})"><i class="fas fa-ellipsis-v"></i></button>
          <div class="action-menu-dropdown" id="action-menu-${c.id}">
            <button class="action-menu-item" onclick="openClientDetails(${c.id})"><i class="fas fa-folder-open"></i> Voir fiche</button>
            <button class="action-menu-item" onclick="openEquipmentModal(${c.id}, '${escapeHtml(c.cabinet_name).replace(/'/g,"\\'")}')"><i class="fas fa-tools"></i> Équipements</button>
            <button class="action-menu-item" onclick="openClientModal(${c.id})"><i class="fas fa-edit"></i> Modifier</button>
            <button class="action-menu-item danger" onclick="openDeleteModal(${c.id}, '${escapeHtml(c.cabinet_name).replace(/'/g,"\\'")}')"><i class="fas fa-trash"></i> Supprimer</button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderEquipmentColumn(client) {
  // Filtrage visuel strict
  const filteredEq = client.equipment.filter(eq => {
    const f = currentFilters;
    if (!f.brand && !f.model && !f.serialNumber && !f.category && !f.device) return true;

    if (f.brand && !((eq.final_brand || eq.brand || '').toLowerCase().includes(f.brand.toLowerCase()))) return false;
    if (f.model && !((eq.final_name || eq.name || '').toLowerCase().includes(f.model.toLowerCase()))) return false;
    if (f.serialNumber && !((eq.serial_number || '').toLowerCase().includes(f.serialNumber.toLowerCase()))) return false;
    if (f.category && !((eq.final_type || eq.type || '').toLowerCase().includes(f.category.toLowerCase()))) return false;
    if (f.device && !((eq.final_device_type || eq.device_type || '').toLowerCase().includes(f.device.toLowerCase()))) return false;

    return true;
  });

  if (!filteredEq || filteredEq.length === 0) {
    if (client.equipment.length > 0) return '<div class="equipment-empty" style="color:#aaa;">Filtré</div>';
    return '<div class="equipment-empty"><i class="fas fa-box-open"></i> Vide</div>';
  }
  
  return `<div class="equipment-badges">
    ${filteredEq.map(eq => {
      const { badgeText, badgeClass, daysLeftText, statusClass } = getMaintenanceBadge(eq.next_maintenance_date);
      let display = eq.final_name || eq.name;
      if (!display || display === 'undefined') {
         display = (eq.final_brand || eq.brand || '') + ' ' + (eq.final_device_type || eq.device_type || eq.final_type || eq.type || 'Équipement');
      }
      
      let borderClass = 'status-ok';
      if(statusClass.includes('danger')) borderClass = 'status-expired';
      else if(statusClass.includes('warning')) borderClass = 'status-warning';

      return `
        <div class="equipment-card ${borderClass}">
          <div class="equipment-info">
            <span class="equipment-name" title="${escapeHtml(display)}">${escapeHtml(display)}</span>
            <div class="equipment-meta">
              <span class="equipment-brand">${escapeHtml(eq.final_brand || eq.brand || '')}</span>
              ${eq.serial_number ? `<span class="equipment-serial">${escapeHtml(eq.serial_number)}</span>` : ''}
            </div>
          </div>
          <div class="equipment-status">
            <span class="status-pill ${badgeClass}">${badgeText}</span>
            <span class="equipment-days ${statusClass}">${daysLeftText}</span>
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

function getMaintenanceBadge(dateString) {
  if (!dateString) return { badgeText: '?', badgeClass: '', daysLeftText: '-', statusClass: '' };
  
  const diff = Math.ceil((new Date(dateString) - new Date().setHours(0,0,0,0)) / (86400000));
  
  if (diff < 0) {
    return { 
      badgeText: 'EXPIRÉ', 
      badgeClass: 'expired', 
      daysLeftText: `${Math.abs(diff)}j retard`, 
      statusClass: 'text-danger' 
    };
  }
  if (diff <= 30) {
    return { 
      badgeText: 'BIENTÔT', 
      badgeClass: 'warning', 
      daysLeftText: `${diff}j restants`, 
      statusClass: 'text-warning' 
    };
  }
  return { 
    badgeText: 'OK', 
    badgeClass: 'ok', 
    daysLeftText: `${diff}j`, 
    statusClass: 'text-success' 
  };
}

function updatePagination(pagination) {
  totalPages = pagination.totalPages;
  const info = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  if (info) info.textContent = `Page ${pagination.page} / ${totalPages || 1}`;
  if (prevBtn) prevBtn.disabled = pagination.page <= 1;
  if (nextBtn) nextBtn.disabled = pagination.page >= totalPages;
}

async function exportCSV() {
  const cleanCols = {};
  for(const [k,v] of Object.entries(currentFilters.columnSearch)) if(v) cleanCols[k]=v;

  const params = new URLSearchParams({
    page: 1, limit: 10000, 
    search: currentFilters.search,
    brand: currentFilters.brand, model: currentFilters.model,
    serialNumber: currentFilters.serialNumber, category: currentFilters.category,
    device: currentFilters.device,
    columnSearch: JSON.stringify(cleanCols)
  });

  try {
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json();
    if(!data.clients || data.clients.length === 0) { showNotification('Aucune donnée à exporter', 'warning'); return; }

    const headers = ['Cabinet', 'Contact', 'Activité', 'Adresse', 'NPA', 'Ville', 'Canton', 'Téléphone', 'Email', 'Dernier RDV'];
    const rows = data.clients.map(c => [
      c.cabinet_name, c.contact_name, c.activity, c.address, c.postal_code, c.city, c.canton, c.phone, c.email, formatDate(c.appointment_at)
    ]);

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(";") + "\n";
    rows.forEach(row => { csvContent += row.map(cell => `"${(cell||'').toString().replace(/"/g, '""')}"`).join(";") + "\n"; });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "clients_kb.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  } catch(e) { console.error(e); showNotification('Erreur export', 'error'); }
}

function handleGlobalSearch(e) { currentFilters.search = e.target.value; currentPage = 1; loadClients(); }
function handleEquipmentFilters() { 
  currentFilters.brand = document.getElementById('filter-brand').value; 
  currentFilters.model = document.getElementById('filter-model').value;
  currentFilters.serialNumber = document.getElementById('filter-serial').value;
  currentFilters.category = document.getElementById('filter-category').value;
  currentFilters.device = document.getElementById('filter-device').value;
  currentPage = 1; loadClients(); 
}
function clearFilters() { 
  document.querySelectorAll('.table-controls input').forEach(i => i.value = ''); 
  currentFilters = { search:'', brand:'', model:'', serialNumber:'', category:'', device:'', columnSearch:{} }; 
  loadClients(); 
}
function handleSort(col) {
  if (currentSort.column === col) currentSort.order = currentSort.order === 'ASC' ? 'DESC' : 'ASC';
  else { currentSort.column = col; currentSort.order = 'ASC'; }
  loadClients();
}

// ========== ACTIONS ==========
async function openClientModal(id = null) {
  const modal = document.getElementById('client-modal');
  const form = document.getElementById('client-form');
  const historySec = document.getElementById('history-section');
  form.reset(); document.getElementById('client-id').value = ''; historySec.style.display = 'none';

  if (id) {
    document.getElementById('modal-title').innerHTML = '<i class="fas fa-edit"></i> Modifier';
    historySec.style.display = 'block';
    try {
      const res = await fetch(`/api/clients/${id}`); const c = await res.json();
      document.getElementById('client-id').value = c.id;
      ['cabinet-name','contact-name','activity','address','postal-code','city','canton','phone','email','technician','notes'].forEach(k => {
         const el = document.getElementById(k); if(el) el.value = c[k.replace('-','_')]||''; 
      });
      document.getElementById('appointment').value = c.appointment_at ? c.appointment_at.split('T')[0] : '';
      if(c.technician_id) document.getElementById('technician').value = c.technician_id;
      document.getElementById('client-lat').value = c.latitude||''; document.getElementById('client-lon').value = c.longitude||'';
      await loadAppointmentsHistory(id, true); // true = mode édition (avec boutons suppr)
    } catch(e) {}
  } else document.getElementById('modal-title').innerHTML = '<i class="fas fa-plus-circle"></i> Nouveau';
  modal.classList.add('active');
}
function closeClientModal() { document.getElementById('client-modal').classList.remove('active'); }

async function saveClient() {
  const id = document.getElementById('client-id').value;
  const data = {
    cabinet_name: document.getElementById('cabinet-name').value, contact_name: document.getElementById('contact-name').value, activity: document.getElementById('activity').value,
    address: document.getElementById('address').value, postal_code: document.getElementById('postal-code').value, city: document.getElementById('city').value, canton: document.getElementById('canton').value,
    phone: document.getElementById('phone').value, email: document.getElementById('email').value, appointment_at: document.getElementById('appointment').value,
    technician_id: document.getElementById('technician').value || null, notes: document.getElementById('notes').value,
    latitude: parseFloat(document.getElementById('client-lat').value)||null, longitude: parseFloat(document.getElementById('client-lon').value)||null
  };
  await fetch(id ? `/api/clients/${id}` : '/api/clients', { method: id?'PUT':'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
  closeClientModal(); loadClients(); showNotification('Enregistré', 'success');
}

// ========== EQUIPMENT MODAL ==========
async function openEquipmentModal(cid, name) {
  currentClientForEquipment = cid;
  document.getElementById('equipment-client-name').textContent = ` - ${name}`;
  document.getElementById('equipment-client-id').value = cid;
  await loadClientEquipment(cid);
  const select = document.getElementById('equipment-select');
  select.innerHTML = '<option value="">-- Sélectionner --</option>' + equipmentCatalog.map(eq => `<option value="${eq.id}">${eq.name} - ${eq.brand} (${eq.device_type||eq.type})</option>`).join('');
  hideEquipmentForm();
  document.getElementById('equipment-modal').classList.add('active');
}
function closeEquipmentModal() { document.getElementById('equipment-modal').classList.remove('active'); loadClients(); }

async function loadClientEquipment(id) {
  const res = await fetch(`/api/clients/${id}/equipment`); const eq = await res.json();
  const container = document.getElementById('equipment-list-container');
  if(eq.length === 0) { container.innerHTML = '<p class="text-center text-muted p-4">Aucun équipement.</p>'; return; }
  
  // Utilisation du nouveau design "Card" aussi dans la modale d'édition
  container.innerHTML = eq.map(e => {
    const { badgeText, badgeClass } = getMaintenanceBadge(e.next_maintenance_date);
    return `<div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
      <div><strong>${escapeHtml(e.final_name||e.name)}</strong><br><small class="text-muted">${escapeHtml(e.final_brand||e.brand)} - S/N: ${escapeHtml(e.serial_number||'-')}</small></div>
      <div style="text-align:right;"><span class="status-pill ${badgeClass}">${badgeText}</span><div style="margin-top:5px;"><button class="btn-xs btn-secondary" onclick="editEq(${e.id})">Edit</button> <button class="btn-xs btn-danger" onclick="delEq(${e.id})">Del</button></div></div>
    </div>`;
  }).join('');
}
function showEquipmentForm() { document.getElementById('equipment-form-container').classList.remove('hidden'); document.getElementById('add-equipment-item-btn').classList.add('hidden'); }
function hideEquipmentForm() { document.getElementById('equipment-form-container').classList.add('hidden'); document.getElementById('add-equipment-item-btn').classList.remove('hidden'); document.getElementById('equipment-item-form').reset(); document.getElementById('equipment-item-id').value = ''; }
window.editEq = async (id) => {
  const r = await fetch(`/api/clients/${currentClientForEquipment}/equipment`); const items = await r.json(); const item = items.find(i => i.id === id);
  if(item) {
    document.getElementById('equipment-item-id').value = item.id; document.getElementById('equipment-select').value = item.equipment_id;
    document.getElementById('equipment-serial').value = item.serial_number||''; document.getElementById('equipment-installed').value = item.installed_at||'';
    document.getElementById('equipment-warranty').value = item.warranty_until||''; document.getElementById('last-maintenance').value = item.last_maintenance_date||'';
    document.getElementById('maintenance-interval').value = item.maintenance_interval||1;
    document.getElementById('last-maintenance').dispatchEvent(new Event('change'));
    showEquipmentForm();
  }
};
window.delEq = async (id) => { if(confirm('Supprimer?')) { await fetch(`/api/clients/${currentClientForEquipment}/equipment/${id}`, {method:'DELETE'}); loadClientEquipment(currentClientForEquipment); } };
async function saveEquipmentItem() {
  const data = {
    equipment_id: document.getElementById('equipment-select').value, serial_number: document.getElementById('equipment-serial').value,
    installed_at: document.getElementById('equipment-installed').value, warranty_until: document.getElementById('equipment-warranty').value,
    last_maintenance_date: document.getElementById('last-maintenance').value, maintenance_interval: document.getElementById('maintenance-interval').value,
    next_maintenance_date: calculateNextMaintenance(document.getElementById('last-maintenance').value, document.getElementById('maintenance-interval').value)
  };
  const id=document.getElementById('equipment-item-id').value;
  await fetch(`/api/clients/${currentClientForEquipment}/equipment${id?'/'+id:''}`, {method:id?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  hideEquipmentForm(); loadClientEquipment(currentClientForEquipment); showNotification('Enregistré', 'success');
}

// ========== FICHE DÉTAILLÉE (READ-ONLY) ==========
async function openClientDetails(id) {
    const contentDiv = document.getElementById('client-details-content');
    const modal = document.getElementById('client-details-details'); // Correction potentielle selon ton ID exact

    try {
        // 1. Ouvrir la modale
        const modalEl = document.getElementById('client-details-modal');
        if (modalEl) modalEl.classList.add('active');

        // 2. Afficher un chargement
        if (contentDiv) {
            contentDiv.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Chargement...</div>';
        }

        // 3. Récupérer les données
        const [clientResponse, historyResponse] = await Promise.all([
            fetch(`/api/clients/${id}`),
            fetch(`/api/clients/${id}/appointments`)
        ]);

        if (!clientResponse.ok) throw new Error('Client introuvable');

        const client = await clientResponse.json();
        const hist = await historyResponse.json();

        // 4. Configurer le bouton "Modifier" (qui est dans le footer de la modale)
        const editBtn = document.getElementById('edit-from-details-btn');
        if (editBtn) {
            // On clone le bouton pour supprimer les anciens event listeners accumulés
            const newBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newBtn, editBtn);
            
            newBtn.addEventListener('click', () => {
                closeClientDetailsModal();
                // Assure-toi que cette fonction existe pour ouvrir le formulaire d'édition
                if (typeof openClientModal === 'function') {
                    openClientModal(id); 
                } else {
                    console.warn("Fonction d'édition non trouvée");
                }
            });
        }

        // 5. Générer le HTML
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; color: var(--color-primary);">
                            <i class="fas fa-building"></i> Informations
                        </h3>
                        <p><strong>Cabinet :</strong> ${client.cabinet_name || '-'}</p>
                        <p><strong>Contact :</strong> ${client.contact_name || '-'}</p>
                        <p><strong>Activité :</strong> ${client.activity || '-'}</p>
                        <p><strong>Email :</strong> <a href="mailto:${client.email}">${client.email || '-'}</a></p>
                        <p><strong>Tél :</strong> <a href="tel:${client.phone}">${client.phone || '-'}</a></p>
                    </div>
                    <div>
                        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; color: var(--color-primary);">
                            <i class="fas fa-map-marker-alt"></i> Adresse
                        </h3>
                        <p>${client.address || ''}</p>
                        <p>${client.postal_code || ''} ${client.city || ''}</p>
                        <p>${client.canton ? 'Canton : ' + client.canton : ''}</p>
                        ${client.latitude ? `<p style="margin-top:5px; font-size:0.9em; color:#666;"><i class="fas fa-globe"></i> GPS: ${client.latitude}, ${client.longitude}</p>` : ''}
                    </div>
                </div>

                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin-top:0; font-size: 1.1em;"><i class="fas fa-sticky-note"></i> Notes</h3>
                    <p style="white-space: pre-wrap; color: #555;">${client.notes || 'Aucune note.'}</p>
                </div>

                <div>
                    <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; color: var(--color-primary);">
                        <i class="fas fa-history"></i> Historique des interventions
                    </h3>
                    <div class="history-list">
                        ${renderHistoryList(hist)}
                    </div>
                </div>
            `;
        }

    } catch (error) {
        console.error("Erreur openClientDetails:", error);
        if (contentDiv) {
            contentDiv.innerHTML = `<div class="alert alert-danger">Une erreur est survenue : ${error.message}</div>`;
        }
    }
}

// Petite fonction utilitaire pour rendre la liste proprement
function renderHistoryList(hist) {
    // Sécurité anti-crash si le serveur renvoie une erreur
    if (!Array.isArray(hist) || hist.length === 0) {
        return '<p style="color: #888; font-style: italic;">Aucune intervention enregistrée.</p>';
    }

    return hist.map(h => {
        const dateStr = new Date(h.appointment_date).toLocaleDateString('fr-CH');
        return `
            <div style="border-left: 3px solid var(--color-primary); padding-left: 10px; margin-bottom: 10px; background: #fff;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9em;">
                    <span>${dateStr}</span>
                    <span style="background:#eee; padding:2px 6px; border-radius:4px; font-size:0.8em;">${h.technician_name || 'Non assigné'}</span>
                </div>
                <div style="margin-top: 4px;">${h.task_description || 'Pas de description'}</div>
                ${h.report_number ? `<div style="font-size:0.85em; color: green; margin-top:2px;"><i class="fas fa-check"></i> Rapport #${h.report_number}</div>` : ''}
            </div>
        `;
    }).join('');
}

function closeClientDetailsModal() { document.getElementById('client-details-modal').classList.remove('active'); }

// ========== HISTORY LOGIC ==========
async function openHistoryModal() {
  const cid = document.getElementById('client-id').value;
  if(!cid) return showNotification('Sauvegardez d\'abord', 'warning');
  document.getElementById('history-client-id').value = cid; document.getElementById('history-form').reset(); document.getElementById('history-date').value = new Date().toISOString().split('T')[0];
  const techSel = document.getElementById('history-technician');
  techSel.innerHTML = '<option value="">--</option>' + technicians.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  try{const r=await fetch('/api/reports?limit=1000');const d=await r.json();const reps=d.reports.filter(r=>r.client_id==cid);document.getElementById('history-report').innerHTML='<option value="">--</option>'+reps.map(r=>`<option value="${r.id}">${r.report_number}</option>`).join('');}catch{}
  try{const r=await fetch(`/api/clients/${cid}/equipment`);const eqs=await r.json();
    if(eqs.length>0)document.getElementById('history-equipment-list').innerHTML=eqs.map(e=>`<div class="checkbox-group" style="margin-bottom:5px;"><input type="checkbox" id="heq-${e.id}" value="${e.id}"><label for="heq-${e.id}">${escapeHtml(e.final_name||e.name)}</label></div>`).join('');
    else document.getElementById('history-equipment-list').innerHTML='<small class="text-muted">Vide</small>';
  }catch{} 
  document.getElementById('history-modal').classList.add('active');
}
function closeHistoryModal() { document.getElementById('history-modal').classList.remove('active'); }

async function saveHistoryEntry() {
  const cid = document.getElementById('history-client-id').value;
  const data = { 
    appointment_date: document.getElementById('history-date').value, 
    task_description: document.getElementById('history-task').value, 
    technician_id: document.getElementById('history-technician').value,
    report_id: document.getElementById('history-report').value,
    equipment_ids: Array.from(document.querySelectorAll('#history-equipment-list input:checked')).map(i=>i.value)
  };
  await fetch(`/api/clients/${cid}/appointments`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  closeHistoryModal(); loadAppointmentsHistory(cid, true);
  showNotification('Ajouté','success');
}

async function loadAppointmentsHistory(cid, isEditable = false) {
  const container = document.getElementById('appointments-history');
  container.innerHTML = '<p class="text-center">Chargement...</p>';
  try {
    const res = await fetch(`/api/clients/${cid}/appointments`); const appts = await res.json();
    if(appts.length===0) { container.innerHTML='<p class="text-center text-muted">Vide</p>'; return; }
    container.innerHTML = `<div class="history-list">` + appts.map(a => {
      const techName = a.technician_name ? `<span class="history-tech">${escapeHtml(a.technician_name)}</span>` : '';
      const reportLink = a.report_id && a.report_number ? `<a href="/report-view.html?id=${a.report_id}" target="_blank" class="btn btn-xs btn-secondary">Report</a>` : '';
      const deleteBtn = isEditable ? `<button class="btn btn-xs btn-danger" onclick="deleteHistoryItem(${cid}, ${a.id})">Del</button>` : '';
      return `
        <div class="history-item">
          <div class="history-item-header">
            <div class="history-date">${formatDate(a.appointment_date)} ${techName}</div>
            <div class="history-actions">${reportLink} ${deleteBtn}</div>
          </div>
          <div class="history-content">${escapeHtml(a.task_description)}</div>
        </div>`;
    }).join('') + `</div>`;
  } catch(e) {}
}

async function deleteHistoryItem(cid, aid) { if(confirm('Suppr?')) { await fetch(`/api/clients/${cid}/appointments/${aid}`, {method:'DELETE'}); loadAppointmentsHistory(cid, true); } }

// ========== UTILS ==========
function openDeleteModal(id, n) { clientToDelete=id; document.getElementById('delete-client-name').innerText=n; document.getElementById('delete-modal').classList.add('active'); }
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); }
async function confirmDelete() { await fetch(`/api/clients/${clientToDelete}`,{method:'DELETE'}); closeDeleteModal(); loadClients(); }
function toggleActionMenu(e, id) { e.stopPropagation(); document.querySelectorAll('.action-menu-dropdown').forEach(m => m.classList.remove('active')); document.getElementById(`action-menu-${id}`).classList.toggle('active'); }
document.addEventListener('click', () => document.querySelectorAll('.action-menu-dropdown').forEach(m => m.classList.remove('active')));
function openGeoTool() { window.open('/geo-tool.html', 'Geo', 'width=600,height=700'); }
window.receiveCoordinates = function(lat, lon) { document.getElementById('client-lat').value=lat; document.getElementById('client-lon').value=lon; };
function safeAdd(id, ev, fn) { const el = document.getElementById(id); if(el) el.addEventListener(ev, fn); }
function escapeHtml(t) { return t ? t.toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ''; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('fr-CH') : '-'; }
function calculateNextMaintenance(date, interval) { if(!date) return null; const d=new Date(date); d.setFullYear(d.getFullYear()+parseInt(interval)); return d.toISOString().split('T')[0]; }
function showNotification(msg, type='info') { const d=document.createElement('div'); d.className=`notification notification-${type} show`; d.innerText=msg; document.getElementById('notification-container').appendChild(d); setTimeout(()=>d.remove(),3000); }
function debounce(f,w) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>f.apply(this,a),w); }; }
async function loadTechnicians() { try{const r=await fetch('/api/admin/users'); technicians=(await r.json()).filter(u=>u.is_active); const s=document.getElementById('technician'); if(s)s.innerHTML='<option value="">--</option>'+technicians.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');}catch{} }
async function loadEquipmentCatalog() { try{const r=await fetch('/api/admin/equipment'); equipmentCatalog=await r.json();}catch{} }