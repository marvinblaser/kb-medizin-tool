// public/js/reports.js

// CONFIGURATION
const TRAVEL_ZONES = { 50: ['BS', 'BL'], 75: ['AG', 'SO', 'JU'], 125: ['SH', 'ZH', 'BE', 'LU', 'NE', 'FR', 'ZG', 'UR', 'OW', 'NW', 'SZ'], 200: ['GE', 'VD', 'VS', 'TI', 'GR', 'SG', 'GL', 'TG', 'AI', 'AR'] };
let currentPage = 1;
let currentStatusFilter = 'draft';
let currentUser = null;
let reportToDelete = null;
let clients=[], technicians=[], materials=[];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await updateBadges(); 
    
    // Chargements initiaux
    await Promise.all([loadClients(), loadTechnicians(), loadMaterials()]);
    
    // --- LOGIQUE DE REDIRECTION ---
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    
    if (action === 'create') {
        const clientId = urlParams.get('client');
        const eqId = urlParams.get('eq');
        openReportModal();
        if (clientId) {
            const clientSelect = document.getElementById('client-select');
            clientSelect.value = clientId;
            await handleClientChange(clientId);
            if (eqId) {
                setTimeout(() => {
                    const cb = document.getElementById(`rep-eq-${eqId}`);
                    if (cb) { cb.checked = true; updateInstallationText(); }
                }, 100);
            }
        }
        window.history.replaceState({}, document.title, "/reports.html");
        switchTab('draft', true);

    } else if (urlParams.get('status')) {
        currentStatusFilter = urlParams.get('status');
        window.history.replaceState({}, document.title, "/reports.html");
        switchTab(currentStatusFilter, false); 
    } else {
        switchTab(currentStatusFilter, false); 
    }

    // Event Listeners
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('add-report-btn').addEventListener('click', () => openReportModal());
    // Pas de bouton save global dans la page, seulement dans la modale
    document.getElementById('travel-canton').addEventListener('change', updateTravelCost);
    document.getElementById('report-type').addEventListener('change', updateReportTitleHeader);
    
    document.getElementById('global-search').addEventListener('input', debounce(() => loadReports(), 300));
    document.getElementById('filter-type').addEventListener('change', () => loadReports());
    document.getElementById('prev-page').addEventListener('click', () => { if(currentPage>1) { currentPage--; loadReports(); }});
    document.getElementById('next-page').addEventListener('click', () => { currentPage++; loadReports(); });

    // Navigation Onglets
    ['draft', 'pending', 'validated', 'archived'].forEach(status => {
        document.getElementById(`tab-${status}`).addEventListener('click', () => switchTab(status));
    });

    // Listener Client Select
    document.getElementById('client-select').addEventListener('change', function() { handleClientChange(this.value); });

    document.getElementById('add-technician-btn').addEventListener('click', () => addTechnicianRow());
    document.getElementById('add-material-btn').addEventListener('click', () => addMaterialRow());
    document.getElementById('add-stk-test-btn').addEventListener('click', () => addStkTestRow());
    document.getElementById('add-work-btn').addEventListener('click', () => addWorkRow());
    document.getElementById('cancel-delete-btn').addEventListener('click', closeDeleteModal);
    document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);
    document.getElementById('confirm-reject-btn').addEventListener('click', confirmReject);
    
    if (action !== 'create') await loadReports();
});

// --- FONCTIONS CLIENT ---
async function handleClientChange(clientId) {
    if (!clientId) return;
    const c = clients.find(x => x.id == clientId);
    if(c) {
        ['cabinet_name', 'address', 'city'].forEach(k => document.getElementById(k.replace('_','-')).value = c[k]||'');
        document.getElementById('postal-code').value = c.postal_code||'';
        document.getElementById('interlocutor').value = c.contact_name||'';
        if (c.canton) {
            document.getElementById('travel-canton').value = c.canton;
            document.getElementById('travel-city').value = c.city;
            updateTravelCost();
        }
        await loadClientEquipmentForReport(c.id);
    }
}

function updateInstallationText() {
    const container = document.getElementById('client-equipment-list');
    const selected = Array.from(container.querySelectorAll('.eq-cb:checked')).map(c => c.dataset.txt);
    document.getElementById('installation-text').value = selected.join(', ');
}

// --- BADGES ---
async function updateBadges() {
    try {
        const res = await fetch('/api/reports/stats');
        const stats = await res.json();
        
        // Sidebar Badge
        const sidebarLink = document.querySelector('a[href="/reports.html"]');
        if (sidebarLink) {
            const oldBadge = sidebarLink.querySelector('.sidebar-badge');
            if (oldBadge) oldBadge.remove();
            if (stats.pending > 0) {
                const badge = document.createElement('span');
                badge.className = 'sidebar-badge';
                badge.style.cssText = 'background:var(--color-danger); color:white; font-size:0.75rem; padding:2px 6px; border-radius:10px; margin-left:auto; font-weight:bold;';
                badge.textContent = stats.pending;
                sidebarLink.appendChild(badge);
                sidebarLink.style.display = 'flex'; sidebarLink.style.alignItems = 'center';
            }
        }

        // Toolbar Badges
        const setBadge = (id, count, isAlert) => {
            const el = document.getElementById(`badge-${id}`);
            if(el) {
                el.textContent = count;
                if(isAlert && count > 0) el.classList.add('danger');
                else el.classList.remove('danger');
            }
        };

        setBadge('draft', stats.draft);
        setBadge('pending', stats.pending, true);
        setBadge('validated', stats.validated);
        setBadge('archived', stats.archived);

    } catch(e) { console.error("Err Badges:", e); }
}

// --- ONGLETS & AFFICHAGE ---
function switchTab(status, reload = true) {
    currentStatusFilter = status;
    currentPage = 1;
    
    document.querySelectorAll('.nav-text-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${status}`).classList.add('active');
    
    document.getElementById('add-report-btn').style.display = (status === 'draft') ? 'inline-flex' : 'none';

    const tableView = document.getElementById('table-view-container');
    const archivesView = document.getElementById('archives-container');
    const pagination = document.getElementById('pagination-controls');

    if (status === 'archived') {
        tableView.style.display = 'none';
        archivesView.style.display = 'grid'; // Utilise Grid pour les dossiers
        pagination.style.display = 'none'; 
    } else {
        tableView.style.display = 'block';
        archivesView.style.display = 'none';
        pagination.style.display = 'flex';
    }

    if(reload) loadReports();
}

async function loadReports() {
    const search = document.getElementById('global-search').value;
    const type = document.getElementById('filter-type').value;

    if (currentStatusFilter === 'archived') {
        const container = document.getElementById('archives-container');
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--neutral-400);"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Chargement des archives...</p></div>';
        try {
            const res = await fetch(`/api/reports?page=1&limit=1000&search=${search}&type=${type}&status=archived`);
            const data = await res.json();
            renderArchivedFolders(data.reports);
        } catch(e) { 
            console.error(e); 
            container.innerHTML = '<p class="text-center" style="grid-column:1/-1; color:var(--color-danger);">Erreur de chargement.</p>';
        }
        return; 
    }

    try {
        const res = await fetch(`/api/reports?page=${currentPage}&limit=25&search=${search}&type=${type}&status=${currentStatusFilter}`);
        const data = await res.json();
        renderReports(data.reports);
        updatePagination(data.pagination);
    } catch(e) { console.error(e); }
}

// --- RENDER TABLEAU STANDARD ---
function renderReports(reports) {
    const tbody = document.getElementById('reports-tbody');
    if (!reports.length) { tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:2rem; color:var(--neutral-500);">Aucun rapport trouvé.</td></tr>`; return; }

    const badges = { 
        'draft': 'badge badge-secondary', 
        'pending': 'badge badge-warning', 
        'validated': 'badge badge-success', 
        'archived': 'badge badge-info' 
    };
    const names = { 'draft': 'Brouillon', 'pending': 'En attente', 'validated': 'Validé', 'archived': 'Archivé' };

    tbody.innerHTML = reports.map(r => generateReportRow(r, badges, names)).join('');
}

function generateReportRow(r, badges, names) {
    const installationText = r.installation || '-';
    const installationDisplay = installationText.length > 60 ? installationText.substring(0, 60) + '...' : installationText;
    const canDelete = (r.status === 'draft') || (currentUser && currentUser.role === 'admin');

    return `
      <tr>
        <td style="font-weight:600; color:var(--color-primary);">${escapeHtml(r.report_number)}</td>
        <td>${escapeHtml(r.work_type)}</td>
        <td><strong>${escapeHtml(r.cabinet_name)}</strong></td>
        <td title="${escapeHtml(installationText)}">
            <div style="font-size:0.9rem; color:var(--neutral-600);">${escapeHtml(installationDisplay)}</div>
        </td>
        <td>${formatDate(r.created_at)}</td>
        <td><span class="${badges[r.status]}">${names[r.status]}</span></td>
        <td style="text-align:right;">
          <div class="table-actions">
            <button class="btn-icon-sm btn-icon-primary" onclick="window.open('/report-view.html?id=${r.id}','_blank')" title="PDF"><i class="fas fa-file-pdf"></i></button>
            <button class="btn-icon-sm btn-icon-primary" onclick="openReportModal(${r.id})" title="Ouvrir"><i class="fas fa-edit"></i></button>
            ${canDelete ? `<button class="btn-icon-sm btn-icon-danger" onclick="openDeleteModal(${r.id})" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        </td>
      </tr>`;
}

// Remplacez renderArchivedFolders et toggleFolder par ceci :

function renderArchivedFolders(reports) {
    const container = document.getElementById('archives-container');
    if (!reports.length) {
        container.innerHTML = '<div class="text-center" style="padding:40px; color:var(--neutral-500);">Aucune archive trouvée.</div>';
        return;
    }

    const groups = {};
    reports.forEach(r => {
        const name = r.cabinet_name || 'Sans Nom';
        if (!groups[name]) groups[name] = [];
        groups[name].push(r);
    });

    const clientNames = Object.keys(groups).sort();
    let html = '';

    clientNames.forEach((clientName, index) => {
        const clientReports = groups[clientName];
        clientReports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const lastDate = clientReports[0] ? formatDate(clientReports[0].created_at) : '';

        html += `
        <div class="folder-item" id="folder-item-${index}">
            <div class="folder-header" id="header-${index}" onclick="toggleFolder(${index})">
                <div style="display:flex; align-items:center;">
                    <i class="fas fa-folder"></i>
                    <span>${escapeHtml(clientName)}</span>
                </div>
                <div class="folder-meta">
                    <span class="date">${lastDate}</span>
                    <span style="color:#cbd5e1; margin:0 10px;">|</span>
                    <span class="count">${clientReports.length} élément(s)</span>
                    <i class="fas fa-chevron-right" id="arrow-${index}" style="margin-left:10px; transition: transform 0.2s;"></i>
                </div>
            </div>
            
            <div class="folder-content" id="folder-${index}">
                ${clientReports.map(r => {
                    const machineName = r.installation || '';
                    
                    return `
                    <div class="archive-row">
                        <div class="archive-main">
                            <div class="archive-icon"><i class="far fa-file-alt"></i></div>
                            <div class="archive-details">
                                <div class="archive-title">
                                    <span style="color:var(--color-primary);">${escapeHtml(r.report_number)}</span>
                                    <span style="font-weight:400; color:#94a3b8; margin:0 5px;">•</span>
                                    <span>${escapeHtml(r.work_type)}</span>
                                </div>
                                <div class="archive-subtitle">
                                    ${formatDate(r.created_at)}
                                    ${machineName ? `
                                        <div class="archive-machine-badge">
                                            <i class="fas fa-server"></i> ${escapeHtml(machineName)}
                                        </div>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div class="archive-actions">
                            <button class="btn-action-soft" onclick="window.open('/report-view.html?id=${r.id}','_blank')" title="Télécharger PDF">
                                <i class="fas fa-file-pdf"></i>
                            </button>
                            <button class="btn-action-soft" onclick="openReportModal(${r.id})" title="Voir détails">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}

window.toggleFolder = function(index) {
    const targetContent = document.getElementById(`folder-${index}`);
    const targetArrow = document.getElementById(`arrow-${index}`);
    const targetItem = document.getElementById(`folder-item-${index}`);
    
    const isCurrentlyOpen = targetContent.style.display === 'block';
    
    // 1. Fermer tous les dossiers (Mode Accordéon)
    document.querySelectorAll('.folder-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.folder-header .fa-chevron-right').forEach(el => el.style.transform = 'rotate(0deg)');
    document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('open'));
    
    // 2. Ouvrir le dossier cible
    if (!isCurrentlyOpen) {
        targetContent.style.display = 'block';
        targetArrow.style.transform = 'rotate(90deg)';
        targetItem.classList.add('open');
    }
};

// --- MODAL & WORKFLOW ---
async function openReportModal(reportId = null) {
    const modal = document.getElementById('report-modal');
    const form = document.getElementById('report-form');
    const pdfBtn = document.getElementById('header-pdf-btn');
    const metaInfo = document.getElementById('report-meta-info');
    
    form.reset(); resetDynamicLists();
    document.getElementById('rejection-msg-box').style.display = 'none';

    if (reportId) {
        try {
            const res = await fetch(`/api/reports/${reportId}`);
            const r = await res.json();
            fillReportForm(r);
            renderWorkflowButtons(r);
            
            if (r.author_name) metaInfo.innerHTML = `<i class="fas fa-pen-nib"></i> Rédigé par <strong>${escapeHtml(r.author_name)}</strong> le ${formatDate(r.created_at)}`;
            else metaInfo.innerHTML = `<i class="fas fa-clock"></i> Créé le ${formatDate(r.created_at)}`;
            
            pdfBtn.style.display = 'inline-flex';
            pdfBtn.onclick = () => window.open(`/report-view.html?id=${r.id}`, '_blank');
            document.getElementById('report-modal-title').innerText = `Rapport ${r.report_number}`;

        } catch(e) { console.error(e); }
    } else {
        document.getElementById('report-modal-title').innerText = "Nouveau rapport";
        metaInfo.innerHTML = "Création d'un nouveau document";
        document.getElementById('report-id').value = '';
        
        const badge = document.getElementById('current-status-badge');
        badge.className = 'badge badge-secondary';
        badge.innerText = 'Brouillon';
        
        document.getElementById('validator-info').innerText = '';
        pdfBtn.style.display = 'none';
        
        // Bouton Save uniquement
        document.getElementById('workflow-buttons').innerHTML = `<button class="btn btn-primary" onclick="saveReport()"><i class="fas fa-save"></i> Enregistrer Brouillon</button>`;
        
        addTechnicianRow(); addWorkRow();
    }
    modal.classList.add('active');
}

function renderWorkflowButtons(r) {
    const footer = document.getElementById('workflow-buttons');
    const statusLabel = document.getElementById('current-status-badge');
    const validInfo = document.getElementById('validator-info');
    
    const stMap = { 'draft': 'badge badge-secondary', 'pending': 'badge badge-warning', 'validated': 'badge badge-success', 'archived': 'badge badge-info' };
    const stName = { 'draft': 'Brouillon', 'pending': 'En attente', 'validated': 'Validé', 'archived': 'Archivé' };
    
    statusLabel.className = stMap[r.status];
    statusLabel.innerText = stName[r.status];
    
    if(r.validator_name) validInfo.innerHTML = `<i class="fas fa-check-double"></i> Validé par : <strong>${r.validator_name}</strong>`; 
    else validInfo.innerText = '';
    
    if(r.status === 'draft' && r.rejection_reason) {
        document.getElementById('rejection-msg-box').style.display = 'flex';
        document.getElementById('rejection-reason-text').innerText = r.rejection_reason;
    } else {
        document.getElementById('rejection-msg-box').style.display = 'none';
    }

    const role = currentUser.role;
    const isValidator = ['admin', 'validator', 'sales_director'].includes(role);
    const isSecretary = ['admin', 'secretary'].includes(role);
    
    footer.innerHTML = '';
    const canEdit = (r.status === 'draft') || (r.status === 'pending' && isValidator);
    
    // Si éditable, bouton "Enregistrer" standard
    if (canEdit) footer.innerHTML += `<button class="btn btn-secondary" onclick="saveReport()"><i class="fas fa-save"></i> Enregistrer</button>`;

    if (r.status === 'draft') {
        footer.innerHTML += `<button class="btn btn-primary" onclick="changeStatus(${r.id}, 'pending')"><i class="fas fa-paper-plane"></i> Soumettre</button>`;
    } else if (r.status === 'pending') {
        if (isValidator) {
            footer.innerHTML += `<button class="btn btn-danger" onclick="openRejectModal(${r.id})">Refuser</button><button class="btn btn-success" onclick="changeStatus(${r.id}, 'validated')"><i class="fas fa-check"></i> Valider</button>`;
        } else footer.innerHTML += `<span style="color:var(--color-warning); align-self:center; font-weight:600;"><i class="fas fa-clock"></i> En attente de validation...</span>`;
    } else if (r.status === 'validated') {
        if (isSecretary) footer.innerHTML += `<button class="btn btn-dark" style="background:var(--neutral-800); color:white;" onclick="changeStatus(${r.id}, 'archived')"><i class="fas fa-archive"></i> Archiver</button>`;
    }
}

async function changeStatus(id, newStatus) {
    if(!confirm("Confirmer le changement de statut ?")) return;
    try {
        const res = await fetch(`/api/reports/${id}/status`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ status: newStatus }) });
        if(res.ok) { closeReportModal(); loadReports(); updateBadges(); }
    } catch(e) { console.error(e); }
}

function openDeleteModal(id) { reportToDelete = id; document.getElementById('delete-modal').classList.add('active'); }
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); reportToDelete = null; }
async function confirmDelete() {
    if(!reportToDelete) return;
    try {
        const res = await fetch(`/api/reports/${reportToDelete}`, { method: 'DELETE' });
        if(res.ok) { closeDeleteModal(); loadReports(); updateBadges(); } else { alert("Erreur suppression."); }
    } catch(e) { console.error(e); }
}

let reportToReject = null;
function openRejectModal(id) { reportToReject = id; document.getElementById('reject-reason').value = ''; document.getElementById('reject-modal').classList.add('active'); }
async function confirmReject() {
    const reason = document.getElementById('reject-reason').value.trim();
    if(!reason) { alert("Motif requis."); return; }
    try {
        const res = await fetch(`/api/reports/${reportToReject}/status`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ status: 'draft', reason }) });
        if(res.ok) { document.getElementById('reject-modal').classList.remove('active'); closeReportModal(); loadReports(); updateBadges(); }
    } catch(e) { console.error(e); }
}

async function saveReport() {
    const reportId = document.getElementById('report-id').value;
    const data = getFormData();
    const method = reportId ? 'PUT' : 'POST';
    const url = reportId ? `/api/reports/${reportId}` : '/api/reports';
    
    // Petit feedback visuel
    const btn = document.querySelector('#workflow-buttons button:first-child'); 
    const originalText = btn ? btn.innerHTML : '';
    if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';

    try {
        const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
        if(res.ok) { 
            const json = await res.json(); 
            // Notification sans alert() intrusif si possible, mais ici on garde simple
            // alert("Sauvegardé !"); 
            updateBadges(); 
            await loadReports();

            if(!reportId && json.id) openReportModal(json.id); 
            else if (reportId) renderWorkflowButtons(json); // Rafraichir boutons si statut change (non-probable ici mais bon)
        } else { const err = await res.json(); alert('Erreur: ' + err.error); }
    } catch(e) { console.error(e); }
    
    if(btn) btn.innerHTML = originalText;
}

function closeReportModal() { 
    document.getElementById('report-modal').classList.remove('active');
    loadReports(); 
}

function getFormData() {
    const tCity = document.getElementById('travel-city').value.trim();
    const tCanton = document.getElementById('travel-canton').value;
    const data = {
      client_id: document.getElementById('client-select').value,
      language: document.getElementById('report-language').value,
      work_type: document.getElementById('report-type').value,
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
      work_accomplished: Array.from(document.querySelectorAll('.work-line-input')).map(i=>i.value.trim()).filter(v=>v).join('\n'),
      equipment_ids: Array.from(document.querySelectorAll('.eq-cb:checked')).map(cb => cb.value)
    };
    data.technicians = Array.from(document.querySelectorAll('#technicians-list .form-row')).map(r => ({ technician_id: r.querySelector('.technician-select').value, technician_name: r.querySelector('.technician-select').selectedOptions[0]?.text, work_date: r.querySelector('.tech-date').value, hours_normal: parseFloat(r.querySelector('.tech-hours-normal').value)||0, hours_extra: parseFloat(r.querySelector('.tech-hours-extra').value)||0 })).filter(t => t.technician_id);
    const prefixSTK = "Test de sécurité électrique obligatoire i.O - ";
    data.stk_tests = Array.from(document.querySelectorAll('#stk-tests-list .form-row')).map(r => { const val = r.querySelector('.stk-input-name').value.trim(); if(!val) return null; return { test_name: prefixSTK + val, price: parseFloat(r.querySelector('.stk-price').value)||0, included: r.querySelector('.stk-incl').checked }; }).filter(t=>t);
    data.materials = Array.from(document.querySelectorAll('#materials-list .form-row')).map(r => ({ material_id: r.querySelector('.material-select').value, material_name: r.querySelector('.material-name-input').value, product_code: r.querySelector('.material-code').value, quantity: parseFloat(r.querySelector('.material-qty').value)||1, unit_price: parseFloat(r.querySelector('.material-price').value)||0, discount: parseFloat(r.querySelector('.material-discount').value)||0, total_price: parseFloat(r.querySelector('.material-total').value)||0 })).filter(m=>m.material_name);
    return data;
}

async function fillReportForm(report) {
      document.getElementById('report-id').value = report.id;
      document.getElementById('report-type').value = report.work_type;
      document.getElementById('report-language').value = report.language || 'fr';
      document.getElementById('client-select').value = report.client_id || '';
      document.getElementById('cabinet-name').value = report.cabinet_name;
      document.getElementById('address').value = report.address;
      document.getElementById('postal-code').value = report.postal_code || '';
      document.getElementById('city').value = report.city;
      document.getElementById('interlocutor').value = report.interlocutor || '';
      document.getElementById('installation-text').value = report.installation || '';
      document.getElementById('remarks').value = report.remarks || '';
      if(report.travel_location) { const match = report.travel_location.match(/^(.*)\s\(([A-Z]{2})\)$/); if(match) { document.getElementById('travel-city').value = match[1]; document.getElementById('travel-canton').value = match[2]; } else { document.getElementById('travel-city').value = report.travel_location; } }
      updateTravelCost(); if(report.travel_costs) document.getElementById('travel-costs').value = report.travel_costs;
      document.getElementById('travel-incl').checked = report.travel_included || false;
      if(report.technician_signature_date) document.getElementById('tech-signature-date').value = report.technician_signature_date.split('T')[0];
      if (report.client_id) await loadClientEquipmentForReport(report.client_id);
      if (report.equipment_ids) report.equipment_ids.forEach(id => { const cb = document.getElementById(`rep-eq-${id}`); if(cb) cb.checked = true; });
      if (report.technicians) report.technicians.forEach(t => addTechnicianRow(t));
      if (report.stk_tests) report.stk_tests.forEach(t => addStkTestRow(t));
      if (report.materials) report.materials.forEach(m => addMaterialRow(m));
      if (report.work_accomplished) report.work_accomplished.split('\n').forEach(line => addWorkRow(line)); else addWorkRow();
      updateMaterialsTotal();
      const typeText = report.work_type ? "Rapport de " + report.work_type : "Rapport";
      document.getElementById('report-modal-title').innerHTML = `<i class="fas fa-file-alt"></i> ${typeText} <span style="font-size:0.8em; opacity:0.7;">(${report.report_number})</span>`;
}

// Utilitaires de base
async function checkAuth() { try { const res = await fetch('/api/me'); if(!res.ok) throw new Error(); const data = await res.json(); currentUser = data.user; const ui = document.getElementById('user-info'); if(ui) ui.innerHTML=`<div class="user-avatar">${currentUser.name[0]}</div><div class="user-details"><strong>${currentUser.name}</strong><span>${currentUser.role}</span></div>`; if(currentUser.role==='admin') document.getElementById('admin-link')?.classList.remove('hidden'); } catch { window.location.href = '/login.html'; } }
async function loadClients() { const res = await fetch('/api/clients?limit=1000'); const d = await res.json(); clients=d.clients; document.getElementById('client-select').innerHTML='<option value="">-- Client --</option>'+clients.map(c=>`<option value="${c.id}">${escapeHtml(c.cabinet_name)}</option>`).join(''); }
function loadTechnicians() { fetch('/api/admin/users').then(r=>r.json()).then(d=>technicians=d); }
function loadMaterials() { fetch('/api/admin/materials').then(r=>r.json()).then(d=>materials=d); }

// GENERATEURS DE LIGNES (AVEC STYLE HARMONISÉ)
function addTechnicianRow(data=null) { 
    const container = document.getElementById('technicians-list'); 
    const div = document.createElement('div'); div.className = 'form-row'; 
    div.style.cssText = 'display:flex; gap:10px; margin-bottom:10px; align-items:flex-end; background:#fff; padding:8px; border:1px solid var(--border-color); border-radius:6px;'; 
    div.innerHTML = `<div class="form-group" style="flex:1; margin-bottom:0;"><label>Nom</label><select class="technician-select"><option value="">--</option>${technicians.map(t => `<option value="${t.id}" ${data && data.technician_id == t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select></div><div class="form-group" style="width:140px; margin-bottom:0;"><label>Date</label><input type="date" class="tech-date" value="${data ? data.work_date : new Date().toISOString().split('T')[0]}" /></div><div class="form-group" style="width:70px; margin-bottom:0;"><label>Norm.</label><input type="number" class="tech-hours-normal" step="0.5" value="${data ? data.hours_normal : 0}" /></div><div class="form-group" style="width:70px; margin-bottom:0;"><label>Sup.</label><input type="number" class="tech-hours-extra" step="0.5" value="${data ? data.hours_extra : 0}" /></div><button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove()" style="height:38px; width:38px;"><i class="fas fa-times"></i></button>`; 
    container.appendChild(div); 
}

function addWorkRow(text='') { 
    const container = document.getElementById('work-list'); 
    const div = document.createElement('div'); div.className = 'form-row'; 
    div.style.cssText = 'display:flex; gap:10px; margin-bottom:8px; align-items:center;'; 
    div.innerHTML = `<input type="text" class="work-line-input" value="${escapeHtml(text)}" placeholder="Description du travail..." style="flex:1;" /><button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove()" tabindex="-1"><i class="fas fa-times"></i></button>`; 
    container.appendChild(div); 
}

function addStkTestRow(data=null) { 
    const container = document.getElementById('stk-tests-list'); 
    const div = document.createElement('div'); div.className = 'form-row'; 
    div.style.cssText = 'display:flex; gap:10px; margin-bottom:10px; align-items:center; background:#f9fafb; padding:10px; border-radius:6px; border:1px solid #e5e7eb;'; 
    const prefix="Test de sécurité électrique obligatoire i.O - "; 
    let val = ''; if(data && data.test_name) val = data.test_name.replace(prefix, ''); 
    div.innerHTML = `<div style="flex:1; display:flex; align-items:center; gap:10px;"><span style="font-size:0.8rem; font-weight:600; white-space:nowrap; color:var(--neutral-600);">${prefix}</span><input type="text" class="stk-input-name" value="${escapeHtml(val)}" placeholder="Désignation appareil" required style="flex:1;" /></div><div style="width:120px; display:flex; align-items:center; gap:5px;"><input type="number" class="stk-price" step="0.01" value="${data ? data.price : 75.00}" style="text-align:right;" /><span style="font-size:0.8rem;">CHF</span></div><div style="width:80px; text-align:center;"><label style="font-size:0.8rem; cursor:pointer;"><input type="checkbox" class="stk-incl" ${data && data.included ? 'checked' : ''}> Incl.</label></div><button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`; 
    container.appendChild(div); 
}

function addMaterialRow(data=null) { 
    const container = document.getElementById('materials-list'); 
    const div = document.createElement('div'); div.className = 'form-row'; 
    div.style.cssText = 'display:flex; gap:8px; margin-bottom:10px; align-items:flex-end; background:#fff; padding:10px; border:1px solid var(--border-color); border-radius:6px; flex-wrap:wrap;'; 
    const discountVal = data ? (data.discount || 0) : 0; 
    const currentName = data ? (data.material_name || '') : ''; 
    div.innerHTML = `<div class="form-group" style="width: 140px; margin-bottom:0;"><label>Catalogue</label><select class="material-select" style="font-size:0.85em;"><option value="">-- Choisir --</option>${materials.map(m => `<option value="${m.id}" data-name="${escapeHtml(m.name)}" data-price="${m.unit_price}" data-code="${m.product_code}" ${data && data.material_id == m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select></div><div class="form-group" style="flex:2; min-width:200px; margin-bottom:0;"><label>Désignation</label><input type="text" class="material-name-input" value="${escapeHtml(currentName)}" /></div><div class="form-group" style="width:80px; margin-bottom:0;"><label>Code</label><input type="text" class="material-code" value="${data ? (data.product_code||'') : ''}" readonly style="background:#f3f4f6; font-size:0.85em;" /></div><div class="form-group" style="width:50px; margin-bottom:0;"><label>Qté</label><input type="number" class="material-qty" min="1" value="${data ? data.quantity : 1}" /></div><div class="form-group" style="width:70px; margin-bottom:0;"><label>Prix</label><input type="number" class="material-price" step="0.01" value="${data ? data.unit_price : 0}" /></div><div class="form-group" style="width:50px; margin-bottom:0;"><label>Rab%</label><input type="number" class="material-discount" min="0" max="100" step="1" value="${discountVal}" /></div><div class="form-group" style="width:80px; margin-bottom:0;"><label>Total</label><input type="number" class="material-total" step="0.01" value="${data ? data.total_price : 0}" readonly style="background:#f3f4f6; font-weight:bold;" /></div><button type="button" class="btn-icon-sm btn-icon-danger" onclick="this.parentElement.remove(); updateMaterialsTotal();" style="height:38px; width:38px;"><i class="fas fa-times"></i></button>`; 
    container.appendChild(div); 
    const sel=div.querySelector('.material-select'), nameIn=div.querySelector('.material-name-input'), codeIn=div.querySelector('.material-code'), qtyIn=div.querySelector('.material-qty'), priceIn=div.querySelector('.material-price'), discountIn=div.querySelector('.material-discount'), totalIn=div.querySelector('.material-total'); 
    const update=()=>{ const q=parseFloat(qtyIn.value)||0, p=parseFloat(priceIn.value)||0, d=parseFloat(discountIn.value)||0; totalIn.value=((q*p)*(1-(d/100))).toFixed(2); updateMaterialsTotal(); }; 
    sel.addEventListener('change', function(){ const opt=this.options[this.selectedIndex]; if(opt.value){ priceIn.value=parseFloat(opt.dataset.price).toFixed(2); codeIn.value=opt.dataset.code||''; nameIn.value=opt.dataset.name||''; } update(); }); 
    [qtyIn,priceIn,discountIn].forEach(e=>{e.addEventListener('change',update);e.addEventListener('input',update);}); 
}

function updateMaterialsTotal() { let total=0; document.querySelectorAll('.material-total').forEach(i => total += parseFloat(i.value)||0); document.getElementById('materials-total').innerText = total.toFixed(2); }
async function loadClientEquipmentForReport(clientId) { try { const res=await fetch(`/api/clients/${clientId}/equipment`); const eqs=await res.json(); const container=document.getElementById('client-equipment-list'); if(eqs.length===0){container.innerHTML='<p style="color:#666;">Aucun équipement.</p>';return;} container.innerHTML=eqs.map(e=>{ let display=e.final_name||e.name; if(!display||display==='undefined') display=(e.final_brand||e.brand||'')+' '+(e.final_device_type||e.device_type||e.type||''); const serial=e.serial_number?`S/N:${escapeHtml(e.serial_number)}`:''; return `<div style="margin-bottom:8px; display:flex; align-items:center;"><input type="checkbox" class="eq-cb" id="rep-eq-${e.id}" value="${e.id}" data-txt="${escapeHtml(display+' '+serial).trim()}" style="width:16px; height:16px; margin-right:10px;"><label for="rep-eq-${e.id}" style="cursor:pointer; font-size:0.9rem;"><strong>${escapeHtml(display)}</strong> <span style="color:#666; font-size:0.8rem;">${serial}</span></label></div>`; }).join(''); container.querySelectorAll('.eq-cb').forEach(cb => { cb.addEventListener('change', updateInstallationText); }); } catch(e){console.error(e);} }
function updateTravelCost(){ const sel=document.getElementById('travel-canton').value; const inp=document.getElementById('travel-costs'); let p=null; for(const[pr,cs] of Object.entries(TRAVEL_ZONES)){if(cs.includes(sel)){p=parseInt(pr);break;}} if(p){inp.value=p.toFixed(2);inp.readOnly=true;inp.style.backgroundColor="#e9ecef";}else{inp.readOnly=false;inp.style.backgroundColor="";} }
function resetDynamicLists() { document.getElementById('technicians-list').innerHTML=''; document.getElementById('work-list').innerHTML=''; document.getElementById('stk-tests-list').innerHTML=''; document.getElementById('materials-list').innerHTML=''; document.getElementById('client-equipment-list').innerHTML=''; }
function logout() { fetch('/api/logout',{method:'POST'}).then(()=>window.location='/login.html'); }
function debounce(f,w){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>f.apply(this,a),w);};}
function escapeHtml(t){if(!t)return '';return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function formatDate(s){return s?new Date(s).toLocaleDateString('fr-CH'):'-';}
function updatePagination(p){document.getElementById('pagination-info').textContent=`Page ${p.page}/${p.totalPages}`; document.getElementById('prev-page').disabled=p.page===1; document.getElementById('next-page').disabled=p.page===p.totalPages;}
function updateReportTitleHeader() {
    const typeSelect = document.getElementById('report-type');
    const titleElement = document.getElementById('report-modal-title');
    const reportId = document.getElementById('report-id').value;
    let typeText = "Rapport";
    if (typeSelect.selectedIndex > 0) typeText = "Rapport de " + typeSelect.options[typeSelect.selectedIndex].text;
    if (reportId) {
         const currentTitle = titleElement.innerText;
         const match = currentTitle.match(/\d{4}-\d{4}/);
         if (match) titleElement.innerHTML = `<i class="fas fa-file-alt"></i> ${typeText} <span style="font-size:0.8em; opacity:0.7;">(${match[0]})</span>`;
         else titleElement.innerHTML = `<i class="fas fa-file-alt"></i> ${typeText}`;
    } else titleElement.innerHTML = `<i class="fas fa-plus-circle"></i> ${typeText}`;
}