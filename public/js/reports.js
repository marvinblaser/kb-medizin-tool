let currentPage = 1;
let currentFilters = {
  search: '',
  type: '',
  status: ''
};
let totalPages = 1;
let reportToDelete = null;
let clients = [];
let technicians = [];
let materials = [];

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadClients();
  await loadTechnicians();
  await loadMaterials();
  await loadReports();

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('add-report-btn').addEventListener('click', () => openReportModal());
  document.getElementById('save-report-btn').addEventListener('click', saveReport);
  document.getElementById('cancel-delete-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);
  
  document.getElementById('global-search').addEventListener('input', debounce(handleFilters, 300));
  document.getElementById('filter-type').addEventListener('change', handleFilters);
  document.getElementById('filter-status').addEventListener('change', handleFilters);
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
  
  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadReports();
    }
  });
  
  document.getElementById('next-page').addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadReports();
    }
  });

  // Charger les infos client quand on sélectionne un client
  document.getElementById('client-select').addEventListener('change', async function() {
    const clientId = this.value;
    if (clientId) {
      const client = clients.find(c => c.id == clientId);
      if (client) {
        document.getElementById('cabinet-name').value = client.cabinet_name;
        document.getElementById('address').value = client.address;
        document.getElementById('postal-code').value = client.postal_code || '';
        document.getElementById('city').value = client.city;
        document.getElementById('interlocutor').value = client.contact_name;
        
        await loadClientEquipmentForReport(clientId);
      }
    }
  });

  document.getElementById('add-technician-btn').addEventListener('click', () => addTechnicianRow());
  document.getElementById('add-material-btn').addEventListener('click', () => addMaterialRow());
  document.getElementById('add-stk-test-btn').addEventListener('click', () => addStkTestRow());

  document.getElementById('travel-incl').addEventListener('change', function() {
    document.getElementById('travel-costs').disabled = this.checked;
    if (this.checked) {
      document.getElementById('travel-costs').value = '';
    }
  });
});

function closeReportModal() {
  document.getElementById('report-modal').classList.remove('active');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('active');
  reportToDelete = null;
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

async function loadClients() {
  try {
    const response = await fetch('/api/clients?page=1&limit=1000');
    const data = await response.json();
    clients = data.clients;
    
    const select = document.getElementById('client-select');
    select.innerHTML = '<option value="">-- Sélectionner un client --</option>' +
      clients.map(c => `<option value="${c.id}">${escapeHtml(c.cabinet_name)}</option>`).join('');
  } catch (error) {
    console.error('Erreur chargement clients:', error);
  }
}

async function loadTechnicians() {
  try {
    const response = await fetch('/api/admin/users');
    const users = await response.json();
    technicians = users.filter(u => u.is_active === 1);
  } catch (error) {
    console.error('Erreur chargement techniciens:', error);
  }
}

async function loadMaterials() {
  try {
    const response = await fetch('/api/admin/materials');
    materials = await response.json();
  } catch (error) {
    console.error('Erreur chargement matériaux:', error);
  }
}

async function loadReports() {
  const params = new URLSearchParams({
    page: currentPage,
    limit: 25,
    search: currentFilters.search,
    type: currentFilters.type,
    status: currentFilters.status
  });

  try {
    const response = await fetch(`/api/reports?${params}`);
    const data = await response.json();

    renderReports(data.reports);
    updatePagination(data.pagination);
  } catch (error) {
    console.error('Erreur chargement rapports:', error);
    document.getElementById('reports-tbody').innerHTML = `
      <tr><td colspan="7" style="text-align: center; color: var(--color-danger); padding: 40px">
        <i class="fas fa-exclamation-triangle fa-2x"></i>
        <p style="margin-top: 10px">Erreur de chargement</p>
      </td></tr>
    `;
  }
}

function renderReports(reports) {
  const tbody = document.getElementById('reports-tbody');

  if (reports.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7" class="table-empty">
        <i class="fas fa-inbox"></i>
        <p>Aucun rapport trouvé</p>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = reports.map(report => {
    const statusBadges = {
      draft: '<span class="badge badge-secondary"><i class="fas fa-edit"></i> Brouillon</span>',
      completed: '<span class="badge badge-success"><i class="fas fa-check"></i> Complété</span>',
      sent: '<span class="badge badge-primary"><i class="fas fa-paper-plane"></i> Envoyé</span>'
    };

    return `
      <tr>
        <td data-label="N° Rapport">
          <strong>${escapeHtml(report.report_number)}</strong>
        </td>
        <td data-label="Type">${escapeHtml(report.work_type)}</td>
        <td data-label="Client">${escapeHtml(report.cabinet_name)}</td>
        <td data-label="Date">${formatDate(report.created_at)}</td>
        <td data-label="Intervenants">${report.technicians_count} intervenant(s)</td>
        <td data-label="Statut">${statusBadges[report.status] || report.status}</td>
        <td data-label="Actions">
          <div style="display: flex; gap: var(--space-2);">
            <button class="btn-icon-sm btn-icon-primary" onclick="viewReport(${report.id})" title="Voir">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn-icon-sm btn-icon-primary" onclick="openReportModal(${report.id})" title="Modifier">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon-sm btn-icon-danger" onclick="openDeleteModal(${report.id}, '${escapeHtml(report.report_number).replace(/'/g, "\\'")}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function openReportModal(reportId = null) {
  const modal = document.getElementById('report-modal');
  const title = document.getElementById('report-modal-title');
  const form = document.getElementById('report-form');
  
  form.reset();
  document.getElementById('report-id').value = '';
  document.getElementById('technicians-list').innerHTML = '';
  document.getElementById('materials-list').innerHTML = '';
  document.getElementById('stk-tests-list').innerHTML = '';

  if (reportId) {
    title.innerHTML = '<i class="fas fa-edit"></i> Modifier le rapport';
    
    try {
      const response = await fetch(`/api/reports/${reportId}`);
      const report = await response.json();
      
      document.getElementById('report-id').value = report.id;
      document.getElementById('report-type').value = report.work_type;
      document.getElementById('report-status').value = report.status || 'draft';
      document.getElementById('client-select').value = report.client_id || '';
      document.getElementById('cabinet-name').value = report.cabinet_name;
      document.getElementById('address').value = report.address;
      document.getElementById('postal-code').value = report.postal_code || '';
      document.getElementById('city').value = report.city;
      document.getElementById('interlocutor').value = report.interlocutor || '';
      document.getElementById('work-accomplished').value = report.work_accomplished || '';
      document.getElementById('travel-location').value = report.travel_location || '';
      document.getElementById('travel-costs').value = report.travel_costs || 0;
      document.getElementById('travel-incl').checked = report.travel_included || false;
      document.getElementById('remarks').value = report.remarks || '';
      
      if (report.client_id) {
        await loadClientEquipmentForReport(report.client_id);
      }
      
      if (report.technicians && report.technicians.length > 0) {
        report.technicians.forEach(tech => {
          addTechnicianRow(tech);
        });
      }
      
      if (report.stk_tests && report.stk_tests.length > 0) {
        report.stk_tests.forEach(test => {
          addStkTestRow(test);
        });
      }
      
      if (report.materials && report.materials.length > 0) {
        report.materials.forEach(mat => {
          addMaterialRow(mat);
        });
      }
      
      updateMaterialsTotal();
      
    } catch (error) {
      console.error('Erreur chargement rapport:', error);
      showNotification('Erreur lors du chargement', 'error');
      return;
    }
  } else {
    title.innerHTML = '<i class="fas fa-plus-circle"></i> Nouveau rapport';
    addTechnicianRow();
    addMaterialRow();
    addStkTestRow({ test_name: 'Test de sécurité électrique obligatoire i.O - Unité', price: 75.00 });
    addStkTestRow({ test_name: 'Test de sécurité électrique obligatoire i.O - Microscope', price: 75.00 });
  }

  modal.classList.add('active');
}

function addTechnicianRow(data = null) {
  const container = document.getElementById('technicians-list');
  const index = container.children.length;
  
  const div = document.createElement('div');
  div.className = 'form-row';
  div.style.alignItems = 'flex-end';
  div.innerHTML = `
    <div class="form-group">
      <label>Intervenant</label>
      <select class="technician-select" data-index="${index}">
        <option value="">-- Sélectionner --</option>
        ${technicians.map(t => `
          <option value="${t.id}" ${data && data.technician_id == t.id ? 'selected' : ''}>
            ${escapeHtml(t.name)}
          </option>
        `).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Date</label>
      <input type="date" class="tech-date" value="${data ? data.work_date : ''}" />
    </div>
    <div class="form-group">
      <label>Heures normales</label>
      <input type="number" class="tech-hours-normal" step="0.5" min="0" value="${data ? data.hours_normal : 0}" style="width: 100px;" />
    </div>
    <div class="form-group">
      <label>Heures sup.</label>
      <input type="number" class="tech-hours-extra" step="0.5" min="0" value="${data ? data.hours_extra : 0}" style="width: 100px;" />
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  container.appendChild(div);
}

function addStkTestRow(data = null) {
  const container = document.getElementById('stk-tests-list');
  
  const div = document.createElement('div');
  div.className = 'form-row';
  div.style.alignItems = 'flex-end';
  div.innerHTML = `
    <div class="form-group" style="flex: 2;">
      <label>Nom du test *</label>
      <input type="text" class="stk-test-name" value="${data ? escapeHtml(data.test_name) : ''}" placeholder="ex: Test I.O - Unité" required />
    </div>
    <div class="form-group">
      <label>Prix (CHF)</label>
      <input type="number" class="stk-test-price" step="0.01" min="0" value="${data ? data.price : 75.00}" style="width: 120px;" />
    </div>
    <div class="form-group" style="display: flex; align-items: center; min-height: 36px;">
      <label style="margin: 0;">
        <input type="checkbox" class="stk-test-included" ${data && data.included ? 'checked' : ''} />
        Inclus
      </label>
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove();">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  container.appendChild(div);
  
  const checkbox = div.querySelector('.stk-test-included');
  const priceInput = div.querySelector('.stk-test-price');
  
  checkbox.addEventListener('change', function() {
    priceInput.disabled = this.checked;
    if (this.checked) priceInput.value = '';
  });
  
  if (checkbox.checked) {
    priceInput.disabled = true;
  }
}

function addMaterialRow(data = null) {
  const container = document.getElementById('materials-list');
  
  const div = document.createElement('div');
  div.className = 'form-row';
  div.style.alignItems = 'flex-end';
  div.innerHTML = `
    <div class="form-group" style="flex: 2;">
      <label>Matériel *</label>
      <select class="material-select" style="width: 100%;">
        <option value="">-- Sélectionner --</option>
        ${materials.map(mat => `
          <option 
            value="${mat.id}" 
            data-price="${mat.unit_price}"
            data-code="${mat.product_code}"
            ${data && data.material_id == mat.id ? 'selected' : ''}
          >
            ${escapeHtml(mat.name)} (${mat.product_code})
          </option>
        `).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Qté</label>
      <input type="number" class="material-qty" min="1" value="${data ? data.quantity : 1}" style="width: 80px;" />
    </div>
    <div class="form-group">
      <label>Prix unit. (CHF)</label>
      <input type="number" class="material-price" step="0.01" min="0" value="${data ? data.unit_price : 0}" readonly style="width: 120px; background: var(--neutral-100);" />
    </div>
    <div class="form-group">
      <label>Total (CHF)</label>
      <input type="number" class="material-total" step="0.01" min="0" value="${data ? data.total_price : 0}" readonly style="width: 120px; background: var(--neutral-100);" />
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove(); updateMaterialsTotal();">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  container.appendChild(div);
  
  const select = div.querySelector('.material-select');
  const qtyInput = div.querySelector('.material-qty');
  const priceInput = div.querySelector('.material-price');
  const totalInput = div.querySelector('.material-total');
  
  select.addEventListener('change', function() {
    const selectedOption = this.options[this.selectedIndex];
    const price = parseFloat(selectedOption.dataset.price) || 0;
    priceInput.value = price.toFixed(2);
    updateRowTotal();
  });
  
  qtyInput.addEventListener('change', updateRowTotal);
  
  function updateRowTotal() {
    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const total = qty * price;
    totalInput.value = total.toFixed(2);
    updateMaterialsTotal();
  }
  
  if (data) {
    updateRowTotal();
  }
}

function updateMaterialsTotal() {
  const materials = document.querySelectorAll('.material-total');
  let total = 0;
  materials.forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  document.getElementById('materials-total').textContent = total.toFixed(2);
}

async function loadClientEquipmentForReport(clientId) {
  try {
    const response = await fetch(`/api/clients/${clientId}/equipment`);
    const equipment = await response.json();
    
    const container = document.getElementById('client-equipment-list');
    
    if (equipment.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--neutral-500);">Aucun équipement installé</p>';
      return;
    }
    
    container.innerHTML = equipment.map(eq => `
      <div class="checkbox-group" style="margin-bottom: var(--space-2);">
        <input type="checkbox" id="eq-${eq.id}" value="${eq.id}" class="equipment-checkbox" />
        <label for="eq-${eq.id}" style="flex: 1;">
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

async function saveReport() {
  const btn = document.getElementById('save-report-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  btn.disabled = true;

  try {
    const reportId = document.getElementById('report-id').value;
    const clientId = document.getElementById('client-select').value;
    const reportType = document.getElementById('report-type').value;
    
    // ✅ VALIDATION : client_id obligatoire
    if (!clientId) {
      showNotification('Veuillez sélectionner un client', 'error');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }
    
    // ✅ VALIDATION : work_type obligatoire
    if (!reportType) {
      showNotification('Veuillez sélectionner un type de travail', 'error');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }
    
    const equipmentCheckboxes = document.querySelectorAll('.equipment-checkbox:checked');
    const equipment_ids = Array.from(equipmentCheckboxes).map(cb => cb.value);
    
    const techRows = document.querySelectorAll('#technicians-list .form-row');
    const technicians = Array.from(techRows).map(row => {
      const select = row.querySelector('.technician-select');
      const techId = select.value;
      const techName = select.options[select.selectedIndex]?.text || '';
      
      return {
        technician_id: techId || null,
        technician_name: techName,
        work_date: row.querySelector('.tech-date').value,
        hours_normal: parseFloat(row.querySelector('.tech-hours-normal').value) || 0,
        hours_extra: parseFloat(row.querySelector('.tech-hours-extra').value) || 0
      };
    }).filter(t => t.work_date);
    
    const stkRows = document.querySelectorAll('#stk-tests-list .form-row');
    const stk_tests = Array.from(stkRows).map(row => ({
      test_name: row.querySelector('.stk-test-name').value,
      price: parseFloat(row.querySelector('.stk-test-price').value) || 0,
      included: row.querySelector('.stk-test-included').checked
    })).filter(t => t.test_name.trim());
    
    const matRows = document.querySelectorAll('#materials-list .form-row');
    const materials = Array.from(matRows).map(row => {
      const select = row.querySelector('.material-select');
      return {
        material_id: parseInt(select.value),
        material_name: select.options[select.selectedIndex]?.text || '',
        product_code: select.options[select.selectedIndex]?.dataset.code || '',
        quantity: parseInt(row.querySelector('.material-qty').value) || 1,
        unit_price: parseFloat(row.querySelector('.material-price').value) || 0,
        total_price: parseFloat(row.querySelector('.material-total').value) || 0
      };
    }).filter(m => m.material_id);
    
    const data = {
      client_id: parseInt(clientId), // ✅ AJOUT client_id
      work_type: reportType,
      cabinet_name: document.getElementById('cabinet-name').value.trim(),
      address: document.getElementById('address').value.trim(),
      postal_code: document.getElementById('postal-code').value.trim(),
      city: document.getElementById('city').value.trim(),
      interlocutor: document.getElementById('interlocutor').value.trim(),
      installation: equipment_ids.length > 0 ? equipment_ids.join(', ') : '',
      work_accomplished: document.getElementById('work-accomplished').value.trim(),
      travel_location: document.getElementById('travel-location').value.trim(),
      travel_costs: parseFloat(document.getElementById('travel-costs').value) || 0,
      travel_included: document.getElementById('travel-incl').checked,
      remarks: document.getElementById('remarks').value.trim(),
      status: document.getElementById('report-status').value || 'draft',
      technicians,
      stk_tests,
      materials
    };

    console.log('📦 Données à envoyer:', data);

    if (!data.cabinet_name || !data.address || !data.city) {
      showNotification('Veuillez remplir tous les champs requis', 'error');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    const url = reportId ? `/api/reports/${reportId}` : '/api/reports';
    const method = reportId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeReportModal();
      loadReports();
      showNotification('Rapport enregistré avec succès', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Erreur lors de l\'enregistrement', 'error');
    }
  } catch (error) {
    console.error('❌ Erreur dans saveReport:', error);
    showNotification('Erreur: ' + error.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function viewReport(reportId) {
  window.open(`/report-view.html?id=${reportId}`, '_blank');
}

function openDeleteModal(reportId, reportNumber) {
  reportToDelete = reportId;
  document.getElementById('delete-report-number').textContent = reportNumber;
  document.getElementById('delete-modal').classList.add('active');
}

async function confirmDelete() {
  if (!reportToDelete) return;

  const btn = document.getElementById('confirm-delete-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suppression...';
  btn.disabled = true;

  try {
    const response = await fetch(`/api/reports/${reportToDelete}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      closeDeleteModal();
      loadReports();
      showNotification('Rapport supprimé', 'success');
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

function handleFilters() {
  currentFilters.search = document.getElementById('global-search').value;
  currentFilters.type = document.getElementById('filter-type').value;
  currentFilters.status = document.getElementById('filter-status').value;
  currentPage = 1;
  loadReports();
}

function clearFilters() {
  document.getElementById('global-search').value = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-status').value = '';
  currentFilters = { search: '', type: '', status: '' };
  currentPage = 1;
  loadReports();
}

function updatePagination(pagination) {
  totalPages = pagination.totalPages;
  document.getElementById('pagination-info').textContent = 
    `Page ${pagination.page} sur ${totalPages} (${pagination.total} rapports)`;

  document.getElementById('prev-page').disabled = currentPage === 1;
  document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;
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
    year: 'numeric'
  });
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

window.openReportModal = openReportModal;
window.viewReport = viewReport;
window.openDeleteModal = openDeleteModal;
window.updateMaterialsTotal = updateMaterialsTotal;