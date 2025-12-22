// public/js/clients.js

// --- INJECTION CSS STYLE ERP COMPLET ---
const erpStyles = `
/* Layout Fluide */
.client-container-fluid { width: 100%; height: calc(100vh - 80px); display: flex; flex-direction: column; padding: 1.5rem 2rem !important; background: #f8fafc; overflow: hidden; }

/* TOOLBAR */
.erp-toolbar {
    background: white; border: 1px solid #e2e8f0; border-radius: 12px;
    padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03); margin-bottom: 1.5rem; flex-shrink: 0;
}
.view-selector { display: flex; gap: 0.5rem; background: #f1f5f9; padding: 4px; border-radius: 8px; }
.view-tab {
    border: none; background: transparent; padding: 8px 16px; font-size: 0.9rem; font-weight: 600;
    color: #64748b; cursor: pointer; border-radius: 6px; display: flex; align-items: center; gap: 8px;
    transition: all 0.2s;
}
.view-tab.active { background: white; color: var(--color-primary); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }

/* Recherche & Filtres */
.toolbar-right { display: flex; align-items: center; gap: 0.8rem; }
.search-input-group {
    position: relative; width: 300px;
}
.search-input-group i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
.search-input-group input {
    width: 100%; padding: 0.6rem 1rem 0.6rem 2.4rem; border: 1px solid #e2e8f0; background: #fff;
    border-radius: 8px; font-size: 0.9rem; outline: none; transition: all 0.2s; color: #1e293b;
}
.search-input-group input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.1); }

.filters-inline-group { display: flex; gap: 0.5rem; align-items: center; }
.compact-select {
    border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.5rem 2rem 0.5rem 0.8rem;
    font-size: 0.85rem; background-color: white; cursor: pointer; height: 38px; color: #334155; font-weight: 500;
    outline: none; max-width: 140px;
}
.compact-select:hover { border-color: #cbd5e1; }

.btn-filter-toggle {
    background: white; border: 1px solid #e2e8f0; color: #64748b; cursor: pointer; border-radius: 8px; 
    height: 38px; padding: 0 12px; display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.85rem;
    transition: all 0.2s;
}
.btn-filter-toggle:hover { background: #f1f5f9; color: var(--color-primary); border-color: var(--color-primary); }

/* PANNEAU FILTRES HORIZONTAL */
.filters-panel { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; margin-top: -1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
.filters-row-compact { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end; }
.filter-item { flex: 1; min-width: 150px; }
.filter-item label { display: block; font-size: 0.75rem; color: #64748b; margin-bottom: 4px; font-weight: 600; }
.filter-item input, .filter-item select { width: 100%; border: 1px solid #e2e8f0; padding: 6px; border-radius: 6px; font-size: 0.9rem; }
.filter-actions { flex: 0 0 auto; display: flex; align-items: center; padding-bottom: 4px; }
.btn-link-reset { background: none; border: none; color: #ef4444; font-size: 0.85rem; cursor: pointer; text-decoration: underline; }

/* TABLEAUX */
.view-content { flex: 1; overflow: hidden; display: none; flex-direction: column; }
.view-content.active { display: flex; }
.erp-table-wrapper { flex: 1; overflow: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: white; }
.erp-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; }
.erp-table thead { position: sticky; top: 0; z-index: 10; background: #f8fafc; }
.erp-table th {
    color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em;
    padding: 1rem 1.2rem; border-bottom: 1px solid #e2e8f0; text-align: left; white-space: nowrap; cursor: pointer;
}
.erp-table tbody tr { transition: background 0.1s; cursor: pointer; }
.erp-table tbody tr:hover { background: #f8fafc !important; }
.erp-table td { padding: 0.8rem 1.2rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #1e293b; }

/* CODE COULEUR PLANNING (DEGRADÉ + BORDURE) */
.row-ok { background: linear-gradient(90deg, #f0fdf4 0%, #ffffff 100%) !important; }
.row-ok td:first-child { border-left: 5px solid #22c55e; }
.row-warning { background: linear-gradient(90deg, #fff7ed 0%, #ffffff 100%) !important; }
.row-warning td:first-child { border-left: 5px solid #f97316; }
.row-expired { background: linear-gradient(90deg, #fef2f2 0%, #ffffff 100%) !important; }
.row-expired td:first-child { border-left: 5px solid #ef4444; }

/* BOUTONS ACTIONS (CRAYON/POUBELLE) */
.btn-icon-table {
    background: transparent; border: none; cursor: pointer; color: #94a3b8; 
    width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
}
.btn-icon-table:hover { background: #f1f5f9; color: var(--color-primary); }

/* --- MODALE FICHE CLIENT --- */
.client-sheet-modal {
    width: 95vw !important; max-width: 1200px !important; height: 90vh; display: flex; flex-direction: column; overflow: hidden; border-radius: 12px;
}
.sheet-header {
    padding: 1.5rem 2rem; background: white; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;
}
.sheet-title-box { display: flex; align-items: center; gap: 1.5rem; }
.sheet-icon-box {
    width: 60px; height: 60px; border-radius: 50%; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center;
    font-size: 1.6rem; color: var(--color-primary); background: #f0f9ff;
}
.sheet-actions-row { display: flex; align-items: center; gap: 0.8rem; }
.btn-sheet-action {
    background: white; border: 1px solid #e2e8f0; color: #64748b; padding: 0.5rem 1rem; border-radius: 6px; 
    font-size: 0.9rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;
}
.btn-sheet-action:hover { background: #f8fafc; color: #1e293b; border-color: #cbd5e1; }
.btn-sheet-danger { border-color: #fecaca; color: #ef4444; }
.btn-sheet-danger:hover { background: #fef2f2; border-color: #ef4444; color: #b91c1c; }
.v-sep { width: 1px; height: 24px; background: #e2e8f0; }
.btn-sheet-close { 
    background: transparent; border: none; font-size: 1.2rem; color: #94a3b8; cursor: pointer; 
    width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
}
.btn-sheet-close:hover { background: #f1f5f9; color: #1e293b; }

.sheet-layout { display: flex; flex: 1; overflow: hidden; }
.sheet-sidebar { width: 340px; background: #f8fafc; border-right: 1px solid #e2e8f0; padding: 2.5rem 2rem; overflow-y: auto; flex-shrink: 0; }
.sheet-content { flex: 1; background: white; padding: 0; display: flex; flex-direction: column; overflow: hidden; }

/* Timeline Historique */
.timeline-container { padding: 2rem; }
.timeline-item { position: relative; padding-left: 2rem; margin-bottom: 2rem; border-left: 2px solid #e2e8f0; }
.timeline-item:last-child { border-left: 2px solid transparent; }
.timeline-marker {
    position: absolute; left: -9px; top: 0; width: 16px; height: 16px; border-radius: 50%; background: white; border: 4px solid var(--color-primary);
}
.timeline-date { font-weight: 700; color: #1e293b; font-size: 0.9rem; margin-bottom: 4px; }
.timeline-card {
    background: white; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    display: flex; justify-content: space-between; align-items: flex-start;
}
.timeline-card h4 { margin: 0; font-size: 0.95rem; font-weight: 600; color: #334155; }
.timeline-card p { margin: 4px 0 0; font-size: 0.85rem; color: #64748b; }

/* Autres styles conservés (Pagination, Tabs...) */
.sheet-tabs { display: flex; border-bottom: 1px solid #e2e8f0; margin-bottom: 1.5rem; padding: 0 2rem; }
.sheet-tab { background: transparent; border: none; padding: 1.2rem 0; margin-right: 2.5rem; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.2s; font-size: 0.95rem; }
.sheet-tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
.badge-count { background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px; }
.tab-pane { flex: 1; padding: 0 2rem 2rem; overflow-y: auto; display: none; }
.tab-pane.active { display: block; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
.eq-card-pro { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.2rem; display: flex; justify-content: space-between; align-items: start; box-shadow: 0 1px 2px rgba(0,0,0,0.02); border-left: 4px solid var(--color-primary); transition: transform 0.2s; }
.eq-card-pro:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.erp-pagination { display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; margin-top: 0.5rem; border-top: 1px solid #e2e8f0; }
.pg-btn { width: 36px; height: 36px; border: 1px solid #e2e8f0; background: white; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.pg-btn:hover { background: #f1f5f9; border-color: #cbd5e1; }
.pg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.gps-container { background:#f0fdf4; padding:12px; border-radius:8px; margin-bottom:1.5rem; border:1px solid #bbf7d0; }
.btn-xs-geo { background: #166534; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
`;

let currentView = 'directory';
let clients = [];
let catalog = [];
let currentClientId = null;
let clientIdToDelete = null;
let currentFilters = { search: '', canton: '', sector: '' };
let currentSort = { col: 'cabinet_name', order: 'asc' };
let currentPage = 1;
let itemsPerPage = 25;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = erpStyles;
    document.head.appendChild(styleEl);

    await checkAuth();
    await loadCatalog();
    loadData();

    document.getElementById('global-search')?.addEventListener('input', debounce(e => { currentFilters.search = e.target.value; currentPage = 1; loadData(); }, 300));
    document.getElementById('filter-canton')?.addEventListener('change', e => { currentFilters.canton = e.target.value; currentPage = 1; loadData(); });
    document.getElementById('filter-sector')?.addEventListener('change', e => { currentFilters.sector = e.target.value; currentPage = 1; loadData(); });
    document.getElementById('toggle-advanced-filters')?.addEventListener('click', () => document.getElementById('advanced-filters-panel').classList.toggle('hidden'));
    document.getElementById('clear-filters')?.addEventListener('click', resetFilters);
    
    document.getElementById('prev-page')?.addEventListener('click', () => changePage(-1));
    document.getElementById('next-page')?.addEventListener('click', () => changePage(1));
    document.getElementById('limit-select')?.addEventListener('change', e => { itemsPerPage = parseInt(e.target.value); currentPage = 1; loadData(); });
    
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('confirm-delete-btn')?.addEventListener('click', confirmDeleteClient);
    document.getElementById('btn-geo-search')?.addEventListener('click', searchCoordinates);
});

async function checkAuth() {
    try { const res = await fetch('/api/me'); if(!res.ok) window.location.href='/login.html'; const d=await res.json(); currentUser=d.user; document.getElementById('user-info').innerHTML=`<div class="user-avatar">${d.user.name[0]}</div><div class="user-details"><strong>${d.user.name}</strong><span>${d.user.role}</span></div>`; if(d.user.role === 'admin') document.getElementById('admin-link').classList.remove('hidden'); } catch { window.location.href='/login.html'; }
}
async function logout() { await fetch('/api/logout', {method:'POST'}); window.location.href = '/login.html'; }
async function loadCatalog() { try { const r = await fetch('/api/admin/equipment'); catalog = await r.json(); } catch {} }

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${view}`).classList.add('active');
    document.querySelectorAll('.view-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    if(view === 'planning') currentSort = { col: 'next_maintenance_date', order: 'asc' };
    else currentSort = { col: 'cabinet_name', order: 'asc' };
    currentPage = 1;
    loadData();
}

async function loadData() {
    const endpoint = currentView === 'directory' ? '/api/clients' : '/api/clients/planning';
    const params = new URLSearchParams({
        page: currentPage, limit: itemsPerPage,
        search: currentFilters.search, canton: currentFilters.canton, category: currentFilters.sector,
        sortBy: currentSort.col, sortOrder: currentSort.order,
        brand: document.getElementById('adv-brand')?.value||'', model: document.getElementById('adv-model')?.value||'', serialNumber: document.getElementById('adv-serial')?.value||'', status: document.getElementById('adv-status')?.value||''
    });
    try {
        const res = await fetch(`${endpoint}?${params}`);
        const data = await res.json();
        if (currentView === 'directory') renderDirectory(data.clients); else renderPlanning(data);
        updatePagination({ page: currentPage, totalPages: data.pagination?.totalPages || 1, totalItems: data.pagination?.totalItems || data.length });
    } catch(e) { console.error(e); }
}

function renderDirectory(list) {
    const tbody = document.getElementById('clients-tbody');
    if(!list || list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:3rem; color:#94a3b8;">Aucun résultat trouvé.</td></tr>'; return; }
    tbody.innerHTML = list.map(c => `
        <tr onclick="openClientDetails(${c.id})">
            <td><strong>${escapeHtml(c.cabinet_name)}</strong><br><span style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.activity)}</span></td>
            <td>${escapeHtml(c.city)} <span style="font-size:0.75rem; color:#94a3b8;">(${c.canton||''})</span></td>
            <td>${escapeHtml(c.contact_name)}<br><span style="font-size:0.75rem; color:#64748b;">${escapeHtml(c.phone||'-')}</span></td>
            <td><small style="color:#64748b;">${c.equipment_summary ? c.equipment_summary.split(';;').length + ' machines' : 'Aucune machine'}</small></td>
            <td>${c.appointment_at ? formatDate(c.appointment_at) : '-'}</td>
            <td style="text-align:right;"><button class="btn-icon-table" onclick="event.stopPropagation(); openClientModal(${c.id})"><i class="fas fa-pen"></i></button></td>
        </tr>`).join('');
}

function renderPlanning(list) {
    const tbody = document.getElementById('planning-tbody');
    const items = Array.isArray(list) ? list : (list.data || []);
    if(items.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:3rem; color:#94a3b8;">Aucune maintenance prévue.</td></tr>'; return; }
    tbody.innerHTML = items.map(r => {
        let rowClass = 'row-ok', badgeHtml = '<span class="status-pill pill-ok">OK</span>';
        if(r.days_remaining < 0) { rowClass = 'row-expired'; badgeHtml = '<span class="status-pill pill-err">Expiré</span>'; }
        else if(r.days_remaining < 30) { rowClass = 'row-warning'; badgeHtml = '<span class="status-pill pill-warn">Bientôt</span>'; }
        return `<tr onclick="openClientDetails(${r.client_id})" class="${rowClass}">
            <td>${badgeHtml}</td>
            <td><strong>${escapeHtml(r.cabinet_name)}</strong></td>
            <td>${escapeHtml(r.city)}</td>
            <td><strong>${escapeHtml(r.catalog_name)}</strong><div style="font-size:0.8rem; color:#64748b;">${r.brand}</div></td>
            <td>${escapeHtml(r.type)}</td>
            <td>${formatDate(r.last_maintenance_date)}</td>
            <td style="font-weight:700;">${formatDate(r.next_maintenance_date)}</td>
            <td style="text-align:right;"><button class="btn-icon-table" onclick="event.stopPropagation(); window.location.href='/reports.html?action=create&client=${r.client_id}&eq=${r.id}'"><i class="fas fa-file-signature"></i></button></td>
        </tr>`;
    }).join('');
}

async function openClientDetails(id) {
    currentClientId = id;
    const modal = document.getElementById('client-details-modal');
    try {
        const res = await fetch(`/api/clients/${id}`);
        const c = await res.json();
        document.getElementById('sheet-name').textContent = c.cabinet_name;
        document.getElementById('sheet-category').textContent = c.activity || 'Autre';
        document.getElementById('sheet-city-header').textContent = c.city;
        document.getElementById('sheet-address').textContent = `${c.address}, ${c.postal_code||''} ${c.city}`;
        document.getElementById('sheet-phone').textContent = c.phone || '-';
        document.getElementById('sheet-email').textContent = c.email || '-';
        document.getElementById('sheet-contact').textContent = c.contact_name;
        document.getElementById('sheet-notes').textContent = c.notes || 'Aucune note renseignée.';
        document.getElementById('sheet-coords').innerHTML = c.latitude ? `<i class="fas fa-check-circle"></i> ${c.latitude}, ${c.longitude}` : 'Non localisé';
        
        switchSheetTab('equipment'); loadClientEquipment(id); loadClientHistory(id);
        modal.classList.add('active');
    } catch {}
}
function closeClientDetailsModal() { document.getElementById('client-details-modal').classList.remove('active'); }

function switchSheetTab(tab) {
    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`button[onclick*="'${tab}'"]`);
    if(btn) btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

async function loadClientEquipment(id) {
    const div = document.getElementById('sheet-equipment-list');
    div.innerHTML = '<p>Chargement...</p>';
    const res = await fetch(`/api/clients/${id}/equipment`);
    const list = await res.json();
    document.getElementById('count-eq').textContent = list.length;
    div.innerHTML = list.map(eq => {
        let color = '#22c55e', text = 'OK';
        if(eq.days_remaining < 0) { color = '#ef4444'; text = 'Expiré'; }
        else if(eq.days_remaining < 30) { color = '#f97316'; text = 'Bientôt'; }
        return `<div class="eq-card-pro" style="border-left-color:${color}">
            <div class="eq-info">
                <h4 class="eq-title">${escapeHtml(eq.final_name)}</h4>
                <p class="eq-sub">${escapeHtml(eq.final_brand)} • S/N: ${escapeHtml(eq.serial_number||'-')}</p>
                <span class="eq-date" style="color:${color}">${text} : ${formatDate(eq.next_maintenance_date)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <button class="btn-icon-table" onclick="openEquipFormModal(${JSON.stringify(eq).replace(/"/g, '&quot;')})"><i class="fas fa-pen"></i></button>
                <button class="btn-icon-table" style="color:#ef4444;" onclick="deleteEquipment(${id}, ${eq.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

async function loadClientHistory(id) {
    const div = document.getElementById('sheet-history-list');
    try {
        const res = await fetch(`/api/clients/${id}/appointments`);
        const list = await res.json();
        document.getElementById('count-hist').textContent = list.length;
        if(list.length === 0) { div.innerHTML = '<p style="color:#94a3b8; font-style:italic;">Aucun historique.</p>'; return; }
        
        div.innerHTML = list.map(h => `
        <div class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-date">${formatDate(h.appointment_date)}</div>
            <div class="timeline-card">
                <div>
                    <h4>${h.source_type === 'report' ? 'Rapport Intervention' : 'Rendez-vous'}</h4>
                    <p>${escapeHtml(h.task_description)}</p>
                </div>
                ${h.report_id ? `<button class="btn-icon-table" onclick="window.open('/report-view.html?id=${h.report_id}')"><i class="fas fa-file-pdf"></i></button>` : ''}
            </div>
        </div>`).join('');
    } catch {}
}

function parseDateCH(dateStr) { if(!dateStr) return 0; const [d,m,y] = dateStr.split('.'); return new Date(`${y}-${m}-${d}`).getTime(); }
function handleSort(col) { if(currentSort.col === col) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; else { currentSort.col = col; currentSort.order = 'asc'; } loadData(); }
function handlePlanningSort(col) { if(currentSort.col === col) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; else { currentSort.col = col; currentSort.order = 'asc'; } loadData(); }

async function openClientModal(id = null) {
    const modal = document.getElementById('client-modal');
    document.getElementById('client-form').reset(); document.getElementById('client-id').value = '';
    document.getElementById('geo-status').innerHTML = '';
    if (id) {
        const res = await fetch(`/api/clients/${id}`); const d = await res.json();
        document.getElementById('client-id').value = d.id;
        document.getElementById('client-name').value = d.cabinet_name;
        document.getElementById('client-activity').value = d.activity;
        document.getElementById('client-contact').value = d.contact_name;
        document.getElementById('client-phone').value = d.phone;
        document.getElementById('client-email').value = d.email;
        document.getElementById('client-address').value = d.address;
        document.getElementById('client-npa').value = d.postal_code;
        document.getElementById('client-city').value = d.city;
        document.getElementById('client-canton').value = d.canton;
        document.getElementById('client-notes').value = d.notes;
        document.getElementById('client-lat').value = d.latitude;
        document.getElementById('client-lon').value = d.longitude;
    }
    modal.classList.add('active');
}
function closeClientModal() { document.getElementById('client-modal').classList.remove('active'); }

async function searchCoordinates() {
    const address = document.getElementById('client-address').value;
    const city = document.getElementById('client-city').value;
    const npa = document.getElementById('client-npa').value;
    const statusDiv = document.getElementById('geo-status');
    if(!address || !city) { statusDiv.innerHTML = '<span style="color:#ef4444;">Adresse et Ville requises.</span>'; return; }
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recherche...';
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', ' + npa + ' ' + city + ', Switzerland')}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.length > 0) {
            document.getElementById('client-lat').value = data[0].lat;
            document.getElementById('client-lon').value = data[0].lon;
            statusDiv.innerHTML = '<span style="color:#166534;"><i class="fas fa-check"></i> Trouvé !</span>';
        } else { statusDiv.innerHTML = '<span style="color:#ef4444;">Aucun résultat.</span>'; }
    } catch { statusDiv.innerHTML = '<span style="color:#ef4444;">Erreur réseau.</span>'; }
}

async function saveClient() {
    const id = document.getElementById('client-id').value;
    const data = {
        cabinet_name: document.getElementById('client-name').value, activity: document.getElementById('client-activity').value,
        contact_name: document.getElementById('client-contact').value, phone: document.getElementById('client-phone').value, email: document.getElementById('client-email').value,
        address: document.getElementById('client-address').value, postal_code: document.getElementById('client-npa').value, city: document.getElementById('client-city').value, canton: document.getElementById('client-canton').value,
        notes: document.getElementById('client-notes').value, latitude: document.getElementById('client-lat').value, longitude: document.getElementById('client-lon').value
    };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/clients/${id}` : '/api/clients';
    try { const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        if(res.ok) { closeClientModal(); loadData(); if(id && id == currentClientId) openClientDetails(id); } else alert("Erreur");
    } catch {}
}

function openEquipFormModal(eq = null) {
    const modal = document.getElementById('equipment-form-modal');
    document.getElementById('equip-form').reset();
    document.getElementById('equip-id').value = '';
    const select = document.getElementById('equip-select');
    select.innerHTML = '<option value="">-- Sélectionner --</option>' + catalog.map(c => `<option value="${c.id}">${c.name} (${c.brand})</option>`).join('');
    if(eq) {
        document.getElementById('equip-id').value = eq.id;
        select.value = eq.equipment_id;
        document.getElementById('equip-serial').value = eq.serial_number;
        document.getElementById('equip-install').value = eq.installed_at;
        document.getElementById('equip-last').value = eq.last_maintenance_date;
        document.getElementById('equip-interval').value = eq.maintenance_interval;
    }
    modal.classList.add('active');
}
function closeEquipModal() { document.getElementById('equipment-form-modal').classList.remove('active'); }

async function saveEquipment() {
    if(!currentClientId) return;
    const id = document.getElementById('equip-id').value;
    const data = {
        equipment_id: document.getElementById('equip-select').value, serial_number: document.getElementById('equip-serial').value,
        installed_at: document.getElementById('equip-install').value, last_maintenance_date: document.getElementById('equip-last').value,
        maintenance_interval: document.getElementById('equip-interval').value
    };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/clients/${currentClientId}/equipment/${id}` : `/api/clients/${currentClientId}/equipment`;
    try { const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        if(res.ok) { closeEquipModal(); loadClientEquipment(currentClientId); loadData(); } else alert("Erreur");
    } catch(e) { console.error(e); }
}

async function deleteEquipment(clientId, eqId) {
    if(!confirm("Supprimer la machine ?")) return;
    try { await fetch(`/api/clients/${clientId}/equipment/${eqId}`, { method: 'DELETE' }); loadClientEquipment(clientId); loadData(); } catch {}
}

function openDeleteModal(id) { clientIdToDelete = id; document.getElementById('delete-modal').classList.add('active'); }
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); clientIdToDelete = null; }
async function confirmDeleteClient() {
    if(!clientIdToDelete) return;
    try { const res = await fetch(`/api/clients/${clientIdToDelete}`, { method: 'DELETE' }); if(res.ok) { closeDeleteModal(); if(document.getElementById('client-details-modal').classList.contains('active')) closeClientDetailsModal(); loadData(); } } catch {}
}

function debounce(f,w){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>f.apply(this,a),w);};}
function escapeHtml(t){if(!t)return '';return t.toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function formatDate(s){return s?new Date(s).toLocaleDateString('fr-CH'):'-';}
function updatePagination(p){
    document.getElementById('pagination-info').textContent = `Page ${p.page} sur ${p.totalPages}`;
    document.getElementById('prev-page').disabled = p.page <= 1;
    document.getElementById('next-page').disabled = p.page >= p.totalPages;
}
function changePage(delta) { currentPage += delta; loadData(); }
function resetFilters() { currentFilters = { search:'', canton:'', sector:'' }; document.getElementById('global-search').value=''; document.getElementById('filter-canton').value=''; document.getElementById('filter-sector').value=''; loadData(); }
function exportData() { alert("Fonction d'export CSV à implémenter."); }

window.openClientModal = openClientModal;
window.closeClientModal = closeClientModal;
window.saveClient = saveClient;
window.searchCoordinates = searchCoordinates;