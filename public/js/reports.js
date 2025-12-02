let currentPage = 1;
let currentFilters = { search: '', type: '', status: '' };
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
  
  document.getElementById('prev-page').addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadReports(); } });
  document.getElementById('next-page').addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; loadReports(); } });

  // Changement Client : pré-remplir infos
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
  document.getElementById('add-work-btn').addEventListener('click', () => addWorkRow());
});

// --- LOAD DATA ---

async function loadReports() {
  const params = new URLSearchParams({
    page: currentPage, limit: 25, search: currentFilters.search, type: currentFilters.type, status: currentFilters.status
  });
  try {
    const response = await fetch(`/api/reports?${params}`);
    const data = await response.json();
    renderReports(data.reports);
    updatePagination(data.pagination);
  } catch (error) { console.error(error); }
}

function renderReports(reports) {
  const tbody = document.getElementById('reports-tbody');
  if (reports.length === 0) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Aucun rapport</td></tr>`; return; }

  tbody.innerHTML = reports.map(r => {
    const badges = { draft: 'Brouillon', completed: 'Complété', sent: 'Envoyé' };
    return `
      <tr>
        <td><strong>${escapeHtml(r.report_number)}</strong></td>
        <td>${escapeHtml(r.work_type)}</td>
        <td>${escapeHtml(r.cabinet_name)}</td>
        <td>${formatDate(r.created_at)}</td>
        <td>${r.technicians_count || 0}</td>
        <td><span class="badge ${r.status === 'completed' ? 'badge-success' : r.status === 'sent' ? 'badge-primary' : 'badge-secondary'}">${badges[r.status] || r.status}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn-icon-sm btn-icon-primary" onclick="viewReport(${r.id})" title="Voir PDF"><i class="fas fa-eye"></i></button>
            <button class="btn-icon-sm btn-icon-primary" onclick="openReportModal(${r.id})" title="Modifier"><i class="fas fa-edit"></i></button>
            <button class="btn-icon-sm btn-icon-danger" onclick="openDeleteModal(${r.id}, '${r.report_number}')" title="Supprimer"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
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
  document.getElementById('work-list').innerHTML = '';
  document.getElementById('client-equipment-list').innerHTML = '<p style="color:#999; font-style:italic;">Veuillez sélectionner un client ci-dessus.</p>';

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
      document.getElementById('installation-text').value = report.installation || '';
      document.getElementById('remarks').value = report.remarks || '';

      // Parse Location "Ville (CT)"
      if(report.travel_location) {
         const match = report.travel_location.match(/^(.*)\s\(([A-Z]{2})\)$/);
         if(match) {
             document.getElementById('travel-city').value = match[1];
             document.getElementById('travel-canton').value = match[2];
         } else {
             document.getElementById('travel-city').value = report.travel_location;
         }
      }
      document.getElementById('travel-costs').value = report.travel_costs || 0;
      document.getElementById('travel-incl').checked = report.travel_included || false;

      if(report.technician_signature_date) document.getElementById('tech-signature-date').value = report.technician_signature_date.split('T')[0];
      if(report.technicians && report.technicians[0]) {
         document.getElementById('tech-signature').value = getInitials(report.technicians[0].technician_name);
      }
      
      if (report.client_id) await loadClientEquipmentForReport(report.client_id);
      if (report.technicians) report.technicians.forEach(t => addTechnicianRow(t));
      if (report.stk_tests) report.stk_tests.forEach(t => addStkTestRow(t));
      if (report.materials) report.materials.forEach(m => addMaterialRow(m));
      
      if (report.work_accomplished) {
          report.work_accomplished.split('\n').forEach(line => addWorkRow(line));
      } else {
          addWorkRow();
      }
      updateMaterialsTotal();

    } catch (e) { console.error(e); }
  } else {
    title.innerHTML = '<i class="fas fa-plus-circle"></i> Nouveau rapport';
    addTechnicianRow();
    addWorkRow();
  }
  modal.classList.add('active');
}

// --- DYNAMIC ROWS (CORRIGÉ POUR ALIGNEMENT) ---

function addWorkRow(text = '') {
  const container = document.getElementById('work-list');
  const div = document.createElement('div');
  div.className = 'form-row';
  // Correction alignement : alignItems center pour que le bouton X soit centré avec l'input
  div.style.cssText = 'display:flex; gap:10px; margin-bottom:10px; align-items:center;';
  
  div.innerHTML = `
    <input type="text" class="work-line-input" value="${escapeHtml(text)}" placeholder="Description des travaux..." style="flex:1;" />
    <button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove()" tabindex="-1"><i class="fas fa-times"></i></button>
  `;
  container.appendChild(div);
}

function addTechnicianRow(data = null) {
  const container = document.getElementById('technicians-list');
  const div = document.createElement('div');
  div.className = 'form-row';
  // Alignement 'flex-end' car il y a des labels au-dessus des champs
  div.style.cssText = 'display:flex; gap:15px; margin-bottom:15px; align-items:flex-end;';
  
  div.innerHTML = `
    <div class="form-group" style="flex:1; margin-bottom:0;">
        <label>Intervenant</label>
        <select class="technician-select">
            <option value="">--</option>
            ${technicians.map(t => `<option value="${t.id}" ${data && data.technician_id == t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>
    </div>
    <div class="form-group" style="width:160px; margin-bottom:0;">
        <label>Date</label>
        <input type="date" class="tech-date" value="${data ? data.work_date : new Date().toISOString().split('T')[0]}" />
    </div>
    <div class="form-group" style="width:80px; margin-bottom:0;">
        <label>Norm.</label>
        <input type="number" class="tech-hours-normal" step="0.5" value="${data ? data.hours_normal : 0}" />
    </div>
    <div class="form-group" style="width:80px; margin-bottom:0;">
        <label>Sup.</label>
        <input type="number" class="tech-hours-extra" step="0.5" value="${data ? data.hours_extra : 0}" />
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove()" style="height:46px; width:46px;"><i class="fas fa-times"></i></button>
  `;
  container.appendChild(div);
}

function addStkTestRow(data = null) {
  const container = document.getElementById('stk-tests-list');
  const div = document.createElement('div');
  div.className = 'form-row';
  div.style.cssText = 'display:flex; gap:10px; margin-bottom:10px; align-items:center; background:#f9fafb; padding:10px; border-radius:6px; border:1px solid #e5e7eb;';

  const prefix = "Test de sécurité électrique obligatoire i.O - ";
  let val = '';
  if (data && data.test_name && data.test_name.startsWith(prefix)) {
      val = data.test_name.replace(prefix, '');
  } else if (data) {
      val = data.test_name;
  }

  div.innerHTML = `
    <div style="flex:1; display:flex; align-items:center; gap:10px;">
      <span style="font-size:0.85rem; font-weight:600; white-space:nowrap; color:var(--neutral-700);">${prefix}</span>
      <input type="text" class="stk-input-name" value="${escapeHtml(val)}" placeholder="Désignation unité" required style="flex:1;" />
    </div>
    <div style="width:120px; display:flex; align-items:center; gap:5px;">
      <input type="number" class="stk-price" step="0.01" value="${data ? data.price : 75.00}" style="text-align:right;" />
      <span style="font-size:0.8rem;">CHF</span>
    </div>
    <div style="width:80px; text-align:center;">
       <label style="font-size:0.85rem; cursor:pointer;"><input type="checkbox" class="stk-incl" ${data && data.included ? 'checked' : ''}> Incl.</label>
    </div>
    <button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
  `;
  container.appendChild(div);
}

function addMaterialRow(data = null) {
  const container = document.getElementById('materials-list');
  const div = document.createElement('div');
  div.className = 'form-row';
  div.style.cssText = 'display:flex; gap:10px; margin-bottom:10px; align-items:flex-end;';
  
  div.innerHTML = `
    <div class="form-group" style="flex:2; margin-bottom:0;">
      <label>Matériel</label>
      <select class="material-select">
        <option value="">-- Choix --</option>
        ${materials.map(m => `
          <option value="${m.id}" data-price="${m.unit_price}" data-code="${m.product_code}" ${data && data.material_id == m.id ? 'selected' : ''}>
            ${escapeHtml(m.name)}
          </option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="width:100px; margin-bottom:0;"><label>Code</label><input type="text" class="material-code" value="${data ? (data.product_code||'') : ''}" readonly style="background:#f3f4f6;" /></div>
    <div class="form-group" style="width:70px; margin-bottom:0;"><label>Qté</label><input type="number" class="material-qty" min="1" value="${data ? data.quantity : 1}" /></div>
    <div class="form-group" style="width:100px; margin-bottom:0;"><label>Prix</label><input type="number" class="material-price" step="0.01" value="${data ? data.unit_price : 0}" /></div>
    <div class="form-group" style="width:100px; margin-bottom:0;"><label>Total</label><input type="number" class="material-total" step="0.01" value="${data ? data.total_price : 0}" readonly style="background:#f3f4f6; font-weight:bold;" /></div>
    <button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove(); updateMaterialsTotal();" style="height:46px; width:46px;"><i class="fas fa-times"></i></button>
  `;
  container.appendChild(div);

  const sel = div.querySelector('.material-select');
  const codeIn = div.querySelector('.material-code');
  const qtyIn = div.querySelector('.material-qty');
  const priceIn = div.querySelector('.material-price');
  const totalIn = div.querySelector('.material-total');

  const update = () => {
      const q = parseFloat(qtyIn.value)||0;
      const p = parseFloat(priceIn.value)||0;
      totalIn.value = (q * p).toFixed(2);
      updateMaterialsTotal();
  };

  sel.addEventListener('change', function() {
      const opt = this.options[this.selectedIndex];
      if(opt.value) {
          priceIn.value = parseFloat(opt.dataset.price).toFixed(2);
          codeIn.value = opt.dataset.code || '';
      }
      update();
  });
  qtyIn.addEventListener('change', update);
  priceIn.addEventListener('change', update);
}

function updateMaterialsTotal() {
  let total = 0;
  document.querySelectorAll('.material-total').forEach(i => total += parseFloat(i.value)||0);
  document.getElementById('materials-total').innerText = total.toFixed(2);
}

// --- ÉQUIPEMENTS DU CLIENT (FIXÉ POUR AFFICHER LE NOM) ---
async function loadClientEquipmentForReport(clientId) {
  try {
    const res = await fetch(`/api/clients/${clientId}/equipment`);
    const eqs = await res.json();
    const container = document.getElementById('client-equipment-list');
    
    if(eqs.length === 0) { 
        container.innerHTML = '<p style="color:#666; padding:10px;">Aucun équipement installé.</p>'; 
        return; 
    }
    
    container.innerHTML = eqs.map(e => {
      // LOGIQUE DE NOM ROBUSTE (Identique à clients.js)
      let display = e.final_name || e.name;
      if (!display || display === 'undefined') {
         display = (e.final_brand || e.brand || '') + ' ' + (e.final_device_type || e.device_type || e.final_type || e.type || 'Équipement');
      }
      const serial = e.serial_number ? `S/N:${escapeHtml(e.serial_number)}` : '';
      const fullTxt = `${display} ${serial}`.trim();

      return `
      <div style="margin-bottom:8px; display:flex; align-items:center;">
        <input type="checkbox" class="eq-cb" id="rep-eq-${e.id}" value="${e.id}" data-txt="${escapeHtml(fullTxt)}" style="width:18px; height:18px; margin-right:10px;"> 
        <label for="rep-eq-${e.id}" style="cursor:pointer; font-size:0.9rem;">
            <strong>${escapeHtml(display)}</strong> 
            <span style="color:#666; font-size:0.8rem;">${serial}</span>
        </label>
      </div>
    `;
    }).join('');
    
    // Auto-add to text field
    const txt = document.getElementById('installation-text');
    container.querySelectorAll('.eq-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const selected = Array.from(container.querySelectorAll('.eq-cb:checked')).map(c => c.dataset.txt);
            txt.value = selected.join(', ');
        });
    });
  } catch(e) { console.error(e); }
}

async function saveReport() {
  const btn = document.getElementById('save-report-btn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;

  try {
    const reportId = document.getElementById('report-id').value;
    const tCity = document.getElementById('travel-city').value.trim();
    const tCanton = document.getElementById('travel-canton').value;
    
    const data = {
      client_id: document.getElementById('client-select').value,
      work_type: document.getElementById('report-type').value,
      status: document.getElementById('report-status').value,
      cabinet_name: document.getElementById('cabinet-name').value,
      address: document.getElementById('address').value,
      postal_code: document.getElementById('postal-code').value,
      city: document.getElementById('city').value,
      interlocutor: document.getElementById('interlocutor').value,
      installation: document.getElementById('installation-text').value,
      remarks: document.getElementById('remarks').value,
      travel_costs: parseFloat(document.getElementById('travel-costs').value)||0,
      travel_included: document.getElementById('travel-incl').checked,
      travel_location: tCanton ? `${tCity} (${tCanton})` : tCity,
      technician_signature_date: document.getElementById('tech-signature-date').value,
      work_accomplished: Array.from(document.querySelectorAll('.work-line-input')).map(i=>i.value.trim()).filter(v=>v).join('\n')
    };

    data.technicians = Array.from(document.querySelectorAll('#technicians-list .form-row')).map(r => ({
       technician_id: r.querySelector('.technician-select').value,
       technician_name: r.querySelector('.technician-select').selectedOptions[0]?.text,
       work_date: r.querySelector('.tech-date').value,
       hours_normal: parseFloat(r.querySelector('.tech-hours-normal').value)||0,
       hours_extra: parseFloat(r.querySelector('.tech-hours-extra').value)||0
    })).filter(t => t.technician_id);

    const prefixSTK = "Test de sécurité électrique obligatoire i.O - ";
    data.stk_tests = Array.from(document.querySelectorAll('#stk-tests-list .form-row')).map(r => {
        const val = r.querySelector('.stk-input-name').value.trim();
        if(!val) return null;
        return {
            test_name: prefixSTK + val,
            price: parseFloat(r.querySelector('.stk-price').value)||0,
            included: r.querySelector('.stk-incl').checked
        };
    }).filter(t=>t);

    data.materials = Array.from(document.querySelectorAll('#materials-list .form-row')).map(r => ({
       material_id: r.querySelector('.material-select').value,
       material_name: r.querySelector('.material-select').selectedOptions[0]?.text,
       product_code: r.querySelector('.material-code').value,
       quantity: parseFloat(r.querySelector('.material-qty').value)||1,
       unit_price: parseFloat(r.querySelector('.material-price').value)||0,
       total_price: parseFloat(r.querySelector('.material-total').value)||0
    })).filter(m=>m.material_id);

    const method = reportId ? 'PUT' : 'POST';
    const url = reportId ? `/api/reports/${reportId}` : '/api/reports';
    const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    
    if(res.ok) { closeReportModal(); loadReports(); alert('Enregistré !'); }
    else { const err = await res.json(); alert('Erreur: ' + err.error); }

  } catch(e) { console.error(e); }
  btn.innerHTML = 'Enregistrer'; btn.disabled = false;
}

// Helpers
function closeReportModal() { document.getElementById('report-modal').classList.remove('active'); }
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); }

async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) { window.location.href = '/login.html'; return; }
    const data = await response.json();
    const ui = document.getElementById('user-info');
    if(ui) ui.innerHTML=`<div class="user-avatar">${data.user.name[0]}</div><div class="user-details"><strong>${data.user.name}</strong><span>${data.user.role}</span></div>`;
    if(data.user.role==='admin') document.getElementById('admin-link')?.classList.remove('hidden');
  } catch { window.location.href = '/login.html'; }
}

function loadClients() { fetch('/api/clients?limit=1000').then(r=>r.json()).then(d=>{ clients=d.clients; document.getElementById('client-select').innerHTML='<option value="">-- Client --</option>'+clients.map(c=>`<option value="${c.id}">${escapeHtml(c.cabinet_name)}</option>`).join(''); }); }
function loadTechnicians() { fetch('/api/admin/users').then(r=>r.json()).then(d=>technicians=d); }
function loadMaterials() { fetch('/api/admin/materials').then(r=>r.json()).then(d=>materials=d); }
function logout() { fetch('/api/logout',{method:'POST'}).then(()=>window.location='/login.html'); }
function openDeleteModal(id, n) { reportToDelete=id; document.getElementById('delete-report-number').innerText=n; document.getElementById('delete-modal').classList.add('active'); }
async function confirmDelete() { await fetch(`/api/reports/${reportToDelete}`,{method:'DELETE'}); closeDeleteModal(); loadReports(); }
function viewReport(id) { window.open(`/report-view.html?id=${id}`, '_blank'); }
function handleFilters() { currentFilters.search=document.getElementById('global-search').value; currentFilters.type=document.getElementById('filter-type').value; currentFilters.status=document.getElementById('filter-status').value; currentPage=1; loadReports(); }
function clearFilters() { document.getElementById('global-search').value=''; document.getElementById('filter-type').value=''; document.getElementById('filter-status').value=''; handleFilters(); }
function updatePagination(p) { totalPages=p.totalPages; document.getElementById('pagination-info').textContent=`Page ${p.page} / ${totalPages}`; document.getElementById('prev-page').disabled=p.page===1; document.getElementById('next-page').disabled=p.page===totalPages; }
function formatDate(s) { return s?new Date(s).toLocaleDateString('fr-CH'):'-'; }
function escapeHtml(t) { if(!t)return ''; return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function debounce(f,w) { let t; return function(...a){ clearTimeout(t); t=setTimeout(()=>f.apply(this,a),w); }; }
function getInitials(n) { return n ? n.split(' ').map(x=>x[0]).join('.').toUpperCase() : ''; }