// public/js/clients.js

// --- INJECTION CSS SPECIFIQUE (Modale élargie + Planning coloré) ---
const clientSpecificStyles = `
/* 1. Modale Fiche Client : LARGEUR CORRIGÉE */
.client-sheet-modal {
    width: 90vw !important; /* Force 90% de la largeur de l'écran */
    max-width: 1200px !important; /* Maximum raisonnable */
    height: 85vh;
    max-height: 900px;
    display: flex;
    flex-direction: column;
    padding: 0 !important; /* Le padding est géré par les enfants */
    overflow: hidden;
}

.client-sheet-body { display: flex; flex: 1; overflow: hidden; }

/* 2. Planning : CODE COULEUR RENFORCÉ */
.planning-row-danger { 
    background-color: #fef2f2 !important; 
}
.planning-row-danger td:first-child {
    border-left: 4px solid var(--color-danger);
}

.planning-row-warning { 
    background-color: #fffbeb !important; 
}
.planning-row-warning td:first-child {
    border-left: 4px solid var(--color-warning);
}

.planning-row-success { 
    background-color: #f0fdf4 !important; 
}
.planning-row-success td:first-child {
    border-left: 4px solid var(--color-success);
}

/* Sidebar Fiche */
.sheet-sidebar { width: 300px; background: var(--neutral-50); border-right: 1px solid var(--border-color); padding: 2rem; overflow-y: auto; display: flex; flex-direction: column; flex-shrink: 0; }
.sheet-header-profile { text-align: center; margin-bottom: 2rem; }
.sheet-avatar { width: 80px; height: 80px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: var(--color-primary); border: 1px solid var(--border-color); margin: 0 auto 1rem; box-shadow: var(--shadow-sm); }
.sheet-title { font-size: 1.25rem; font-weight: 700; color: var(--neutral-900); margin: 0; line-height: 1.2; }
.sheet-subtitle { font-size: 0.9rem; color: var(--neutral-500); margin-top: 0.25rem; }

.sheet-info-group { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 2rem; }
.sheet-contact-item { display: flex; align-items: flex-start; gap: 0.75rem; font-size: 0.9rem; color: var(--neutral-700); }
.sheet-contact-item i { color: var(--color-primary); width: 20px; text-align: center; margin-top: 2px; }
.sheet-contact-item.gps { font-size: 0.8rem; color: var(--neutral-500); }

.sheet-actions { display: flex; flex-direction: column; gap: 0.5rem; margin-top: auto; }
.sheet-notes-box { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border-color); }
.sheet-notes-box label { font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--neutral-400); letter-spacing: 0.05em; display: block; margin-bottom: 0.5rem; }
.sheet-notes-box div { font-size: 0.85rem; color: var(--neutral-600); font-style: italic; line-height: 1.5; }

/* Contenu Principal Fiche */
.sheet-main { flex: 1; display: flex; flex-direction: column; background: white; }
.sheet-tabs-nav { display: flex; border-bottom: 1px solid var(--border-color); padding: 0 1.5rem; background: white; }
.sheet-tab { padding: 1rem 1.5rem; background: transparent; border: none; border-bottom: 2px solid transparent; font-weight: 600; color: var(--neutral-500); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem; }
.sheet-tab:hover { color: var(--color-primary); background: var(--neutral-50); }
.sheet-tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }

.sheet-tab-content { padding: 2rem; overflow-y: auto; flex: 1; display: none; opacity: 0; transition: opacity 0.2s ease-in; }
.sheet-tab-content.active { opacity: 1; }

.tab-actions-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.tab-title { font-size: 1.1rem; font-weight: 700; color: var(--neutral-800); margin: 0; }

/* Grille Equipements */
.equipment-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }

/* Tooltip Custom */
#custom-tooltip { position: fixed; background: rgba(15, 23, 42, 0.95); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; z-index: 9999; pointer-events: none; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); opacity: 0; transition: opacity 0.15s; max-width: 300px; line-height: 1.4; }
.tooltip-row { margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; }
.tooltip-row:last-child { border: none; margin: 0; padding: 0; }
.tooltip-model { font-weight: 600; color: #e0e7ff; }
.tooltip-serial { color: #94a3b8; font-size: 0.75rem; }

/* Timeline Historique */
.history-list { position: relative; padding-left: 20px; }
.history-list::before { content: ''; position: absolute; left: 6px; top: 10px; bottom: 10px; width: 2px; background: var(--neutral-200); }
.history-item { position: relative; background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; box-shadow: var(--shadow-sm); transition: transform 0.2s; }
.history-item:hover { transform: translateX(2px); border-color: var(--color-primary-light); }
.history-dot { position: absolute; left: -20px; top: 18px; width: 14px; height: 14px; border-radius: 50%; background: white; border: 3px solid var(--neutral-300); z-index: 2; }
.history-item.type-report .history-dot { border-color: var(--color-primary); }
.history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.history-date { font-weight: 700; color: var(--neutral-800); font-size: 0.9rem; }
.history-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; font-weight: 600; text-transform: uppercase; background: var(--neutral-100); color: var(--neutral-600); }
.badge-report { background: #e0e7ff; color: #4338ca; }
.history-desc { color: var(--neutral-600); font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.5rem; }
.history-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--neutral-50); font-size: 0.75rem; color: var(--neutral-400); }

/* Responsive Mobile */
@media (max-width: 768px) {
    .client-sheet-modal { height: 100vh; max-height: none; border-radius: 0; width: 100% !important; }
    .client-sheet-body { flex-direction: column; overflow-y: auto; }
    .sheet-sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border-color); padding: 1.5rem; flex: none; height: auto; }
    .sheet-main { overflow: visible; }
}
`;

// --- VARIABLES GLOBALES ---
let currentPage = 1;
let currentLimit = 25;
let currentSort = { col: 'cabinet_name', order: 'ASC' }; 
let currentPlanningSort = { col: 'next_maintenance_date', order: 'ASC' }; 
let currentUser = null;
let currentClientId = null; 
let clientIdToDelete = null;
let catalog = [];

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Injection du style
    const styleEl = document.createElement('style');
    styleEl.innerHTML = clientSpecificStyles;
    document.head.appendChild(styleEl);

    await checkAuth();
    await loadEquipmentCatalog();
    loadClients(); 
    
    // Initialisation Planning
    updateSortIcons(document.querySelectorAll('th.sortable[data-plan-col]'), currentPlanningSort, 'data-plan-col');
    
    // Listeners Annuaire
    const searchInput = document.getElementById('global-search');
    if(searchInput) searchInput.addEventListener('input', debounce(() => { currentPage=1; loadClients(); }, 400));
    
    document.getElementById('toggle-filters-btn')?.addEventListener('click', () => { 
        document.getElementById('advanced-filters').classList.toggle('hidden'); 
    });
    
    document.getElementById('clear-filters-btn')?.addEventListener('click', () => { 
        document.querySelectorAll('#advanced-filters input, #advanced-filters select').forEach(i=>i.value=''); 
        if(searchInput) searchInput.value=''; 
        loadClients(); 
    });
    
    ['filter-brand', 'filter-model', 'filter-serial', 'filter-category'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', debounce(() => { currentPage=1; loadClients(); }, 500));
    });

    // Listeners Planning
    document.getElementById('toggle-planning-filters-btn')?.addEventListener('click', () => {
        document.getElementById('planning-advanced-filters').classList.toggle('hidden');
    });

    const reloadPlan = () => loadPlanning();
    ['planning-search', 'plan-filter-status', 'plan-filter-canton', 'plan-filter-category', 'plan-filter-brand', 'plan-filter-model', 'plan-filter-serial', 'plan-filter-device'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            if(el.tagName === 'SELECT') el.addEventListener('change', reloadPlan);
            else el.addEventListener('input', debounce(reloadPlan, 500));
        }
    });

    document.getElementById('plan-reset-btn')?.addEventListener('click', () => {
        ['planning-search', 'plan-filter-status', 'plan-filter-canton', 'plan-filter-category', 'plan-filter-brand', 'plan-filter-model', 'plan-filter-serial', 'plan-filter-device'].forEach(id => document.getElementById(id).value = '');
        currentPlanningSort = { col: 'next_maintenance_date', order: 'ASC' };
        updateSortIcons(document.querySelectorAll('th.sortable[data-plan-col]'), currentPlanningSort, 'data-plan-col');
        loadPlanning();
    });

    // Modales & Actions
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('sheet-edit-btn')?.addEventListener('click', () => { openClientModal(currentClientId); });
    document.getElementById('sheet-delete-btn')?.addEventListener('click', () => { openDeleteModal(currentClientId); });
    document.getElementById('sheet-add-equip-btn')?.addEventListener('click', () => openEquipFormModal());
    document.getElementById('save-equipment-item-btn')?.addEventListener('click', saveEquipmentItem);
    document.getElementById('cancel-delete-btn')?.addEventListener('click', closeDeleteModal);
    document.getElementById('confirm-delete-btn')?.addEventListener('click', confirmDeleteClient);
    document.getElementById('prev-page')?.addEventListener('click', () => { if(currentPage>1) { currentPage--; loadClients(); }});
    document.getElementById('next-page')?.addEventListener('click', () => { currentPage++; loadClients(); });
    document.getElementById('btn-geo-search')?.addEventListener('click', searchCoordinates);
});

// --- AUTH ---
async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) throw new Error("Non connecté");
        const data = await res.json();
        currentUser = data.user;
        const ui = document.getElementById('user-info');
        if (ui) ui.innerHTML = `<div class="user-avatar">${currentUser.name[0]}</div><div class="user-details"><strong>${escapeHtml(currentUser.name)}</strong><span>${currentUser.role === 'admin' ? 'Admin' : 'Tech'}</span></div>`;
        if (currentUser.role === 'admin') document.getElementById('admin-link')?.classList.remove('hidden');
    } catch (e) { window.location.href = '/login.html'; }
}
function logout() { fetch('/api/logout', { method: 'POST' }).then(() => window.location = '/login.html'); }
async function loadEquipmentCatalog() { try { const res = await fetch('/api/admin/equipment'); catalog = await res.json(); } catch(e) {} }

// --- TRI ---
function handleSort(col) {
    if (currentSort.col !== col) currentSort = { col, order: 'ASC' };
    else currentSort.order = currentSort.order === 'ASC' ? 'DESC' : 'ASC';
    updateSortIcons(document.querySelectorAll('th.sortable[data-col]'), currentSort, 'data-col');
    loadClients();
}
function handlePlanningSort(col) {
    if (currentPlanningSort.col !== col) currentPlanningSort = { col, order: 'ASC' };
    else currentPlanningSort.order = currentPlanningSort.order === 'ASC' ? 'DESC' : 'ASC';
    updateSortIcons(document.querySelectorAll('th.sortable[data-plan-col]'), currentPlanningSort, 'data-plan-col');
    loadPlanning();
}
function updateSortIcons(headers, sortState, attr) {
    headers.forEach(th => {
        const icon = th.querySelector('i');
        if(th) th.classList.remove('active-sort');
        if(icon) icon.className = 'fas fa-sort'; 
        if (th.getAttribute(attr) === sortState.col) {
            th.classList.add('active-sort');
            if(icon) icon.className = sortState.order === 'ASC' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    });
}

// --- ANNUAIRE (Tableau Clients) ---
async function loadClients() {
    const getVal = (id) => document.getElementById(id)?.value || '';
    const params = new URLSearchParams({
        page: currentPage, limit: currentLimit, search: getVal('global-search'),
        sortBy: currentSort.col, sortOrder: currentSort.order,
        brand: getVal('filter-brand'), model: getVal('filter-model'),
        serialNumber: getVal('filter-serial'), category: getVal('filter-category')
    });
    try {
        const res = await fetch(`/api/clients?${params.toString()}`);
        const data = await res.json();
        renderClientsTable(data.clients);
        updatePagination(data.pagination);
    } catch(e) { console.error(e); }
}

function renderClientsTable(clients) {
    const tbody = document.getElementById('clients-tbody');
    if(!clients.length) { tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:3rem; color:var(--neutral-400);">Aucun client trouvé.</td></tr>`; return; }
    
    tbody.innerHTML = clients.map(c => {
        // Badges d'équipement (Version condensée)
        let badgesHtml = '<span class="text-muted" style="font-size:0.85em;">-</span>';
        if (c.equipment_summary) {
            const rawItems = c.equipment_summary.split(';;');
            const groups = {};
            rawItems.forEach(item => {
                const parts = item.split('__');
                const type = parts.length > 1 ? (parts[0] || 'Autre') : 'Autre';
                const brand = parts[1] || ''; const model = parts[2] || ''; const serial = parts[3] || '';
                if (!groups[type]) groups[type] = [];
                groups[type].push({ brand, model, serial });
            });
            badgesHtml = Object.keys(groups).map(type => {
                const count = groups[type].length;
                const tooltipContent = groups[type].map(i => `<div class='tooltip-row'><span class='tooltip-model'>${escapeHtml(i.brand)} ${escapeHtml(i.model)}</span><br><span class='tooltip-serial'>S/N: ${escapeHtml(i.serial || 'N/A')}</span></div>`).join('');
                let icon = 'fa-cogs'; 
                const t = type.toLowerCase();
                if(t.includes('orl')) icon = 'fa-chair'; else if(t.includes('gynéco')) icon = 'fa-venus'; else if(t.includes('stéril') || t.includes('autoclave')) icon = 'fa-pump-soap';
                
                // Style amélioré des badges
                return `<div class="eq-group-badge" onmouseenter="showTooltip(event, \`${tooltipContent.replace(/"/g, '&quot;')}\`)" onmouseleave="hideTooltip()">
                    <span class="eq-count">${count}</span>
                    <i class="fas ${icon} eq-icon"></i> ${escapeHtml(type)}
                </div>`;
            }).join('');
        }

        return `<tr onclick="openClientDetails(${c.id})" style="cursor:pointer;">
            <td>
                <div class="client-name">${escapeHtml(c.cabinet_name)}</div>
                <div style="font-size:0.8rem; color:var(--neutral-500);">${escapeHtml(c.activity)}</div>
            </td>
            <td>
                <div style="font-weight:500;">${escapeHtml(c.city)} <span class="badge badge-neutral" style="font-size:0.7rem; padding:1px 5px;">${c.canton||''}</span></div>
                <div style="font-size:0.8rem; color:var(--neutral-500);">${escapeHtml(c.address)}</div>
            </td>
            <td>
                <div style="font-size:0.85rem; font-weight:600; color:var(--neutral-800);">${escapeHtml(c.contact_name)}</div>
                <div style="font-size:0.8rem; color:var(--neutral-500); display:flex; flex-direction:column;">
                    <span>${c.phone ? '<i class="fas fa-phone-alt" style="font-size:0.7rem; width:12px;"></i> '+escapeHtml(c.phone) : ''}</span>
                    <span>${c.email ? '<i class="fas fa-envelope" style="font-size:0.7rem; width:12px;"></i> '+escapeHtml(c.email) : ''}</span>
                </div>
            </td>
            <td>${badgesHtml}</td>
            <td>${c.appointment_at ? '<span style="font-weight:600; color:var(--color-primary);">'+formatDate(c.appointment_at)+'</span>' : '<span class="text-muted">-</span>'}</td>
            <td onclick="event.stopPropagation()">
                <button class="btn-icon-sm btn-icon-primary" onclick="openClientModal(${c.id})"><i class="fas fa-pen"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// --- PLANNING (Avec code couleur renforcé) ---
async function loadPlanning() {
    const getVal = (id) => document.getElementById(id)?.value || '';
    const params = new URLSearchParams({
        search: getVal('planning-search'), status: getVal('plan-filter-status'), canton: getVal('plan-filter-canton'),
        category: getVal('plan-filter-category'), brand: getVal('plan-filter-brand'), model: getVal('plan-filter-model'),
        serial: getVal('plan-filter-serial'), device: getVal('plan-filter-device'),
        sortBy: currentPlanningSort.col, sortOrder: currentPlanningSort.order
    });
    const tbody = document.getElementById('planning-tbody'); if(!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>`;
    try {
        const res = await fetch(`/api/clients/planning?${params.toString()}`);
        const rows = await res.json();
        if(!rows || !rows.length) { tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:2rem; color:var(--neutral-400);">Aucune maintenance prévue.</td></tr>`; return; }
        
        tbody.innerHTML = rows.map(item => {
            const days = item.days_remaining;
            let statusBadge = '<span class="badge badge-neutral">Indéfini</span>';
            let rowClass = ''; // Classe pour la ligne entière
            
            if (days !== null) {
                if (days < 0) {
                    statusBadge = `<span class="badge badge-danger"><i class="fas fa-exclamation-circle"></i> Retard (${Math.abs(days)}j)</span>`;
                    rowClass = 'planning-row-danger';
                }
                else if (days < 30) {
                    statusBadge = `<span class="badge badge-warning"><i class="fas fa-clock"></i> ${days} jours</span>`;
                    rowClass = 'planning-row-warning';
                }
                else {
                    statusBadge = `<span class="badge badge-success"><i class="fas fa-check"></i> ${days} jours</span>`;
                    rowClass = 'planning-row-success';
                }
            }

            return `<tr class="${rowClass}" style="transition:background 0.2s;">
                <td>
                    <div style="font-weight:600; color:var(--neutral-800);">${escapeHtml(item.cabinet_name)}</div>
                    <div style="font-size:0.8rem; color:var(--neutral-500);"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(item.city)}</div>
                </td>
                <td style="text-align:center;"><span class="badge badge-neutral">${escapeHtml(item.canton || '-')}</span></td>
                <td>
                    <div style="font-weight:600; color:var(--color-primary);">${escapeHtml(item.catalog_name || 'Inconnu')}</div>
                    <div style="font-size:0.8rem; color:var(--neutral-600);">${escapeHtml(item.brand || '')} ${escapeHtml(item.model || '')}</div>
                    <div style="font-size:0.75rem; color:var(--neutral-400); font-family:var(--font-family-mono);">S/N: ${escapeHtml(item.serial_number || '-')}</div>
                </td>
                <td><span style="font-size:0.85rem;">${escapeHtml(item.type || '-')}</span></td>
                <td style="font-size:0.9rem;">${formatDate(item.last_maintenance_date)}</td>
                <td style="font-size:0.9rem; font-weight:600;">${formatDate(item.next_maintenance_date)}</td>
                <td style="text-align:center;">${statusBadge}</td>
                <td style="text-align:center;">
                    <button class="btn-icon-sm btn-icon-success" title="Créer Rapport" onclick="window.location.href='/reports.html?action=create&client=${item.client_id}&eq=${item.id}'">
                        <i class="fas fa-file-signature"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erreur chargement planning.</td></tr>`; }
}

// --- FICHE CLIENT (MODALE DETAILS) ---
async function openClientDetails(id) {
    currentClientId = id;
    const modal = document.getElementById('client-details-modal');
    try {
        const res = await fetch(`/api/clients/${id}`);
        const c = await res.json();
        
        // Remplissage Sidebar
        document.getElementById('sheet-name').innerText = c.cabinet_name;
        document.getElementById('sheet-activity').innerText = c.activity;
        document.getElementById('sheet-address').innerText = `${c.address}, ${c.postal_code||''} ${c.city} (${c.canton||''})`;
        document.getElementById('sheet-phone').innerText = c.phone || '-';
        document.getElementById('sheet-email').innerText = c.email || '-';
        document.getElementById('sheet-contact').innerText = c.contact_name;
        document.getElementById('sheet-notes').innerText = c.notes || 'Aucune note.';
        
        const coordsText = (c.latitude && c.longitude) 
            ? `${c.latitude}, ${c.longitude}` 
            : `<span style="color:var(--color-danger);">Non localisé</span>`;
        document.getElementById('sheet-coords').innerHTML = coordsText;

        // Reset Tabs
        switchSheetTab('equipment'); 
        loadSheetEquipment(id); 
        loadSheetHistory(id);
        
        modal.classList.add('active');
    } catch(e) { console.error(e); }
}
function closeClientDetailsModal() { document.getElementById('client-details-modal').classList.remove('active'); }

// CHARGEMENT EQUIPEMENTS (MODE CARTE MODERNE)
async function loadSheetEquipment(clientId) {
    const container = document.getElementById('sheet-equipment-list');
    container.innerHTML = '<p class="text-center w-100"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';
    try {
        const res = await fetch(`/api/clients/${clientId}/equipment`);
        const list = await res.json();
        if(!list.length) { container.innerHTML = '<div class="equipment-empty w-100 text-center">Aucun équipement installé.</div>'; return; }
        
        container.innerHTML = list.map(eq => {
            const days = eq.days_remaining;
            let statusClass = 'status-ok', pillClass = 'ok', textLabel = 'OK', textClass = 'text-success';
            if(days !== null) { 
                if(days < 0) { statusClass = 'status-expired'; pillClass = 'expired'; textLabel = 'EXPIRÉ'; textClass = 'text-danger'; } 
                else if(days < 30) { statusClass = 'status-warning'; pillClass = 'warning'; textLabel = 'BIENTÔT'; textClass = 'text-warning'; } 
            }
            
            return `<div class="equipment-card ${statusClass}">
                <div class="equipment-info">
                    <div class="equipment-name">${escapeHtml(eq.final_name)}</div>
                    <div class="equipment-meta">
                        <span class="equipment-brand">${escapeHtml(eq.final_brand)}</span>
                        <span class="equipment-serial">S/N: ${escapeHtml(eq.serial_number||'-')}</span>
                    </div>
                </div>
                <div class="equipment-status">
                    <span class="status-pill ${pillClass}">${textLabel}</span>
                    <div class="equipment-days ${textClass}" style="margin-top:4px;">${formatDate(eq.next_maintenance_date)}</div>
                </div>
                <div style="margin-left:1rem; display:flex; flex-direction:column; gap:4px; padding-left:10px; border-left:1px solid var(--neutral-200);">
                    <button class="btn-icon-sm btn-icon-primary" title="Modifier" onclick='openEquipFormModal(${JSON.stringify(eq)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-icon-sm btn-icon-success" title="Rapport" onclick="window.location.href='/reports.html?action=create&client=${clientId}&eq=${eq.id}'"><i class="fas fa-file-signature"></i></button>
                    <button class="btn-icon-sm btn-icon-danger" title="Supprimer" onclick="deleteEquipment(${clientId}, ${eq.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
    } catch(e) { console.error(e); }
}

async function loadSheetHistory(clientId) {
    const container = document.getElementById('sheet-history-list');
    container.innerHTML = '<p class="text-center" style="margin-top:20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';
    try {
        const res = await fetch(`/api/clients/${clientId}/appointments`);
        const list = await res.json();
        if(!list.length) { container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--neutral-400);"><i class="far fa-calendar-times" style="font-size:2rem; margin-bottom:10px; display:block;"></i>Aucun historique.</div>`; return; }
        
        container.innerHTML = list.map(h => {
            const isReport = h.source_type === 'report' || h.report_number;
            const typeClass = isReport ? 'type-report' : 'type-appointment';
            
            let badgeHtml = '<span class="history-badge badge-manual">Note</span>';
            if (isReport) badgeHtml = `<span class="history-badge badge-report"><i class="fas fa-file-alt"></i> Rapport ${h.report_number || ''}</span>`;
            
            let actionBtn = h.report_id 
                ? `<button class="btn-xs btn-primary" onclick="window.open('/report-view.html?id=${h.report_id}', '_blank')">Voir PDF</button>` 
                : `<button class="btn-xs btn-danger" onclick="deleteHistoryItem(${clientId}, ${h.id})"><i class="fas fa-trash"></i></button>`;

            return `<div class="history-item ${typeClass}">
                <div class="history-dot"></div>
                <div class="history-header">
                    <div class="history-date"><i class="far fa-calendar"></i> ${formatDate(h.appointment_date)}</div>
                    ${badgeHtml}
                </div>
                ${h.machines ? `<div class="history-machine"><i class="fas fa-microchip"></i> ${escapeHtml(h.machines)}</div>` : ''}
                <div class="history-desc">${escapeHtml(h.task_description)}</div>
                <div class="history-footer">
                    <div class="history-tech"><i class="fas fa-user-circle"></i> ${escapeHtml(h.technician_name || 'Inconnu')}</div>
                    <div>${actionBtn}</div>
                </div>
            </div>`;
        }).join('');
    } catch(e){ console.error(e); }
}

async function deleteHistoryItem(clientId, histId) {
    if(!confirm("Supprimer cette entrée ?")) return;
    try { await fetch(`/api/clients/${clientId}/appointments/${histId}`, { method: 'DELETE' }); loadSheetHistory(clientId); } catch(e){}
}

// --- MODALES ADDITIONNELLES ---
async function openClientModal(id = null) {
    const modal = document.getElementById('client-modal');
    document.getElementById('client-form').reset(); document.getElementById('client-id').value = '';
    document.getElementById('geo-status').innerText = '';
    if (id) {
        try { 
            const res = await fetch(`/api/clients/${id}`); const d = await res.json(); 
            document.getElementById('client-id').value=d.id; document.getElementById('cabinet-name').value=d.cabinet_name;
            document.getElementById('contact-name').value=d.contact_name; document.getElementById('activity').value=d.activity;
            document.getElementById('address').value=d.address; document.getElementById('postal-code').value=d.postal_code||'';
            document.getElementById('city').value=d.city; document.getElementById('canton').value=d.canton;
            document.getElementById('phone').value=d.phone||''; document.getElementById('email').value=d.email||'';
            document.getElementById('notes').value=d.notes||''; 
            document.getElementById('client-lat').value=d.latitude||''; document.getElementById('client-lon').value=d.longitude||'';
        } catch(e){}
    }
    modal.classList.add('active');
}
function closeClientModal() { document.getElementById('client-modal').classList.remove('active'); }

// GEO SEARCH
async function searchCoordinates() {
    const address = document.getElementById('address').value;
    const city = document.getElementById('city').value;
    const npa = document.getElementById('postal-code').value;
    const statusDiv = document.getElementById('geo-status');
    if(!address || !city) { statusDiv.innerHTML = '<span class="text-danger">Adresse et Ville requises.</span>'; return; }
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recherche...';
    const query = `${address}, ${npa} ${city}, Switzerland`;
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data && data.length > 0) {
            document.getElementById('client-lat').value = data[0].lat;
            document.getElementById('client-lon').value = data[0].lon;
            statusDiv.innerHTML = '<span class="text-success"><i class="fas fa-check"></i> Trouvé !</span>';
        } else { statusDiv.innerHTML = '<span class="text-danger">Aucun résultat.</span>'; }
    } catch(e) { statusDiv.innerHTML = '<span class="text-danger">Erreur réseau.</span>'; }
}

async function saveClient() {
    const id = document.getElementById('client-id').value;
    const data = {
        cabinet_name: document.getElementById('cabinet-name').value, contact_name: document.getElementById('contact-name').value,
        activity: document.getElementById('activity').value, address: document.getElementById('address').value,
        postal_code: document.getElementById('postal-code').value, city: document.getElementById('city').value,
        canton: document.getElementById('canton').value, phone: document.getElementById('phone').value,
        email: document.getElementById('email').value, notes: document.getElementById('notes').value,
        latitude: document.getElementById('client-lat').value, longitude: document.getElementById('client-lon').value
    };
    const method = id ? 'PUT' : 'POST'; const url = id ? `/api/clients/${id}` : '/api/clients';
    try { const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
        if (res.ok) { closeClientModal(); loadClients(); if(id && id == currentClientId) openClientDetails(id); } else alert("Erreur");
    } catch(e) { console.error(e); }
}

// EQUIPMENT MODAL
function openEquipFormModal(eq = null) {
    const modal = document.getElementById('equipment-form-modal');
    document.getElementById('equipment-item-form').reset(); document.getElementById('equipment-item-id').value = '';
    document.getElementById('equipment-select').innerHTML = '<option value="">-- Choisir --</option>' + catalog.map(c => `<option value="${c.id}">${c.name} (${c.brand})</option>`).join('');
    if(eq) {
        document.getElementById('equipment-item-id').value = eq.id; document.getElementById('equipment-select').value = eq.equipment_id;
        document.getElementById('equipment-serial').value = eq.serial_number||'';
        if(eq.installed_at) document.getElementById('equipment-installed').value = eq.installed_at;
        if(eq.warranty_until) document.getElementById('equipment-warranty').value = eq.warranty_until;
        if(eq.last_maintenance_date) document.getElementById('last-maintenance').value = eq.last_maintenance_date;
        if(eq.maintenance_interval) document.getElementById('maintenance-interval').value = eq.maintenance_interval;
    }
    modal.classList.add('active');
}
function closeEquipFormModal() { document.getElementById('equipment-form-modal').classList.remove('active'); }
async function saveEquipmentItem() {
    const id = document.getElementById('equipment-item-id').value;
    const clientId = currentClientId; if(!clientId) return;
    const data = {
        equipment_id: document.getElementById('equipment-select').value, serial_number: document.getElementById('equipment-serial').value,
        installed_at: document.getElementById('equipment-installed').value, warranty_until: document.getElementById('equipment-warranty').value,
        last_maintenance_date: document.getElementById('last-maintenance').value, maintenance_interval: document.getElementById('maintenance-interval').value
    };
    const method = id ? 'PUT' : 'POST'; const url = id ? `/api/clients/${clientId}/equipment/${id}` : `/api/clients/${clientId}/equipment`;
    try { const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        if(res.ok) { closeEquipFormModal(); loadSheetEquipment(clientId); if(document.getElementById('view-planning').classList.contains('active')) loadPlanning(); } else alert("Erreur");
    } catch(e) { console.error(e); }
}
async function deleteEquipment(clientId, eqId) {
    if(!confirm("Supprimer cet équipement ?")) return;
    try { const res = await fetch(`/api/clients/${clientId}/equipment/${eqId}`, { method: 'DELETE' }); if(res.ok) { loadSheetEquipment(clientId); if(document.getElementById('view-planning').classList.contains('active')) loadPlanning(); } } catch(e) {}
}

function openDeleteModal(id) { clientIdToDelete = id; document.getElementById('delete-modal').classList.add('active'); }
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); clientIdToDelete = null; }
async function confirmDeleteClient() {
    if(!clientIdToDelete) return;
    try {
        const res = await fetch(`/api/clients/${clientIdToDelete}`, { method: 'DELETE' });
        if (res.ok) { closeDeleteModal(); if (document.getElementById('client-details-modal').classList.contains('active')) { closeClientDetailsModal(); currentClientId = null; } loadClients(); } else alert("Erreur suppression.");
    } catch(e) { alert("Erreur technique."); }
}

// UTILS
window.showTooltip = function(e, content) {
    const tooltip = document.getElementById('custom-tooltip');
    if(!tooltip) return;
    tooltip.innerHTML = content; tooltip.style.opacity = '1';
    moveTooltip(e); document.addEventListener('mousemove', moveTooltip);
};
window.moveTooltip = function(e) {
    const tooltip = document.getElementById('custom-tooltip');
    if(!tooltip) return;
    const offset = 15; let left = e.clientX + offset; let top = e.clientY + offset;
    if (left + tooltip.offsetWidth > window.innerWidth) left = e.clientX - tooltip.offsetWidth - offset;
    if (top + tooltip.offsetHeight > window.innerHeight) top = e.clientY - tooltip.offsetHeight - offset;
    tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px';
};
window.hideTooltip = function() {
    const tooltip = document.getElementById('custom-tooltip');
    if(tooltip) { tooltip.style.opacity = '0'; document.removeEventListener('mousemove', window.moveTooltip); }
};
function debounce(f,w){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>f.apply(this,a),w);};}
function escapeHtml(t){if(!t)return '';return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function formatDate(s){return s?new Date(s).toLocaleDateString('fr-CH'):'-';}
function updatePagination(p){document.getElementById('pagination-info').textContent=`Page ${p.page}/${p.totalPages}`; document.getElementById('prev-page').disabled=p.page===1; document.getElementById('next-page').disabled=p.page===p.totalPages;}