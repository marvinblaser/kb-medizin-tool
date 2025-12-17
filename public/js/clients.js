// public/js/clients.js

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
    await checkAuth();
    await loadEquipmentCatalog();
    loadClients(); 
    
    // Initialisation tri Planning
    updateSortIcons(document.querySelectorAll('th.sortable[data-plan-col]'), currentPlanningSort, 'data-plan-col');
    loadPlanning();

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
    ['planning-search', 'plan-filter-status', 'plan-filter-canton', 'plan-filter-category', 'plan-filter-brand', 'plan-filter-model', 'plan-filter-serial', 'plan-filter-year', 'plan-filter-device'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            if(el.tagName === 'SELECT') el.addEventListener('change', reloadPlan);
            else el.addEventListener('input', debounce(reloadPlan, 500));
        }
    });

    document.getElementById('plan-reset-btn')?.addEventListener('click', () => {
        ['planning-search', 'plan-filter-status', 'plan-filter-canton', 'plan-filter-category', 'plan-filter-brand', 'plan-filter-model', 'plan-filter-serial', 'plan-filter-year', 'plan-filter-device'].forEach(id => document.getElementById(id).value = '');
        currentPlanningSort = { col: 'next_maintenance_date', order: 'ASC' };
        updateSortIcons(document.querySelectorAll('th.sortable[data-plan-col]'), currentPlanningSort, 'data-plan-col');
        loadPlanning();
    });

    // Actions & Modales
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('sheet-edit-btn')?.addEventListener('click', () => { openClientModal(currentClientId); }); // Garde la fiche ouverte
    // NOUVEAU : Listener pour supprimer depuis la fiche
    document.getElementById('sheet-delete-btn')?.addEventListener('click', () => {
        // On ferme la fiche pour voir la modale de confirmation clairement
        // (optionnel, vous pouvez laisser ouvert si vous préférez)
        // closeClientDetailsModal(); 
        openDeleteModal(currentClientId);
    });
    document.getElementById('sheet-add-equip-btn')?.addEventListener('click', () => openEquipFormModal());
    document.getElementById('save-equipment-item-btn')?.addEventListener('click', saveEquipmentItem);
    document.getElementById('cancel-delete-btn')?.addEventListener('click', closeDeleteModal);
    document.getElementById('confirm-delete-btn')?.addEventListener('click', confirmDeleteClient);
    document.getElementById('prev-page')?.addEventListener('click', () => { if(currentPage>1) { currentPage--; loadClients(); }});
    document.getElementById('next-page')?.addEventListener('click', () => { currentPage++; loadClients(); });

    // --- NOUVEAU : BOUTON GEOLOCALISATION ---
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
        if (ui) ui.innerHTML = `<div class="user-avatar">${currentUser.name[0]}</div><div class="user-details"><strong>${escapeHtml(currentUser.name)}</strong><span>${currentUser.role}</span></div>`;
        if (currentUser.role === 'admin') document.getElementById('admin-link')?.classList.remove('hidden');
    } catch (e) { window.location.href = '/login.html'; }
}
function logout() { fetch('/api/logout', { method: 'POST' }).then(() => window.location = '/login.html'); }
async function loadEquipmentCatalog() { try { const res = await fetch('/api/admin/equipment'); catalog = await res.json(); } catch(e) {} }

// --- TRI ---
function handleSort(col) {
    if (currentSort.col !== col) currentSort = { col, order: 'ASC' };
    else currentSort.order = currentSort.order === 'ASC' ? 'DESC' : 'ASC'; // Annuaire 2 états aussi pour simplifier
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

// --- ANNUAIRE ---
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
    if(!clients.length) { tbody.innerHTML = `<tr><td colspan="6" class="text-center">Aucun client trouvé.</td></tr>`; return; }
    tbody.innerHTML = clients.map(c => {
        let badgesHtml = '<span style="color:#94a3b8; font-style:italic; font-size:0.85em;">-</span>';
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
                let icon = 'fa-cogs'; const t = type.toLowerCase();
                if(t.includes('orl')) icon = 'fa-chair'; else if(t.includes('gynéco')) icon = 'fa-venus'; else if(t.includes('stéril') || t.includes('autoclave')) icon = 'fa-pump-soap'; else if(t.includes('microscope')) icon = 'fa-microscope';
                return `<div class="eq-group-badge" onmouseenter="showTooltip(event, \`${tooltipContent.replace(/"/g, '&quot;')}\`)" onmouseleave="hideTooltip()"><span class="eq-count">${count}</span><i class="fas ${icon} eq-icon"></i> ${escapeHtml(type)}</div>`;
            }).join('');
        }
        return `<tr onclick="openClientDetails(${c.id})" style="cursor:pointer;">
            <td><div class="client-name">${escapeHtml(c.cabinet_name)}</div><div style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.activity)}</div></td>
            <td><div style="font-weight:500;">${escapeHtml(c.city)} <span style="background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:0.75rem;">${c.canton||''}</span></div><div style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.address)}</div></td>
            <td><div style="font-size:0.85rem; font-weight:500;">${escapeHtml(c.contact_name)}</div><div style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.phone||'-')}</div><div style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.email||'-')}</div></td>
            <td>${badgesHtml}</td>
            <td>${formatDate(c.appointment_at)}</td>
            <td onclick="event.stopPropagation()"><button class="btn-icon-sm btn-icon-primary" onclick="openClientModal(${c.id})"><i class="fas fa-pen"></i></button></td>
        </tr>`;
    }).join('');
}

// --- PLANNING ---
async function loadPlanning() {
    const getVal = (id) => document.getElementById(id)?.value || '';
    const params = new URLSearchParams({
        search: getVal('planning-search'), status: getVal('plan-filter-status'), canton: getVal('plan-filter-canton'),
        category: getVal('plan-filter-category'), brand: getVal('plan-filter-brand'), model: getVal('plan-filter-model'),
        serial: getVal('plan-filter-serial'), year: getVal('plan-filter-year'), device: getVal('plan-filter-device'),
        sortBy: currentPlanningSort.col, sortOrder: currentPlanningSort.order
    });
    const tbody = document.getElementById('planning-tbody'); if(!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>`;
    try {
        const res = await fetch(`/api/clients/planning?${params.toString()}`);
        const rows = await res.json();
        if(!rows || !rows.length) { tbody.innerHTML = `<tr><td colspan="8" class="text-center">Aucun résultat.</td></tr>`; return; }
        tbody.innerHTML = rows.map(item => {
            const days = item.days_remaining;
            let rowClass = '', daysText = days !== null ? `${days} j` : '-';
            if (days !== null) { if (days < 0) rowClass = 'planning-row-danger'; else if (days < 30) rowClass = 'planning-row-warning'; else rowClass = 'planning-row-success'; }
            return `<tr class="${rowClass}">
                <td style="font-weight:600;">${escapeHtml(item.cabinet_name)}<div style="font-size:0.85em; font-weight:normal; color:#555;">${escapeHtml(item.city)}</div></td>
                <td style="text-align:center;"><span style="background:white; border:1px solid #ccc; padding:1px 5px; border-radius:4px; font-size:0.8em;">${escapeHtml(item.canton || '-')}</span></td>
                <td><strong>${escapeHtml(item.catalog_name || 'Inconnu')}</strong><div style="font-size:0.85em;">${escapeHtml(item.brand || '')} ${escapeHtml(item.model || '')}</div><div style="font-size:0.8em; color:#666;">S/N: ${escapeHtml(item.serial_number || '-')}</div></td>
                <td>${escapeHtml(item.type || '-')}</td>
                <td>${formatDate(item.last_maintenance_date)}</td>
                <td style="font-weight:bold;">${formatDate(item.next_maintenance_date)}</td>
                <td style="text-align:center; font-weight:bold;">${daysText}</td>
                <td style="text-align:center;"><button class="btn-icon-sm btn-icon-success" onclick="window.location.href='/reports.html?action=create&client=${item.client_id}&eq=${item.id}'"><i class="fas fa-file-signature"></i></button></td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erreur.</td></tr>`; }
}

// --- FICHE CLIENT ---
async function openClientDetails(id) {
    currentClientId = id;
    const modal = document.getElementById('client-details-modal');
    try {
        const res = await fetch(`/api/clients/${id}`);
        const c = await res.json();
        document.getElementById('sheet-name').innerText = c.cabinet_name;
        document.getElementById('sheet-activity').innerText = c.activity;
        document.getElementById('sheet-address').innerText = `${c.address}, ${c.postal_code||''} ${c.city} (${c.canton||''})`;
        document.getElementById('sheet-phone').innerText = c.phone || '-';
        document.getElementById('sheet-email').innerText = c.email || '-';
        document.getElementById('sheet-contact').innerText = c.contact_name;
        document.getElementById('sheet-notes').innerText = c.notes || 'Aucune note.';
        
        // Affichage des coordonnées GPS
        const coordsText = (c.latitude && c.longitude) 
            ? `Lat: ${c.latitude} / Lon: ${c.longitude}` 
            : `<span style="color:#ef4444;">Pas de GPS</span>`;
        document.getElementById('sheet-coords').innerHTML = coordsText;

        switchSheetTab('equipment'); loadSheetEquipment(id); loadSheetHistory(id);
        modal.classList.add('active');
    } catch(e) { console.error(e); }
}
function closeClientDetailsModal() { document.getElementById('client-details-modal').classList.remove('active'); }

async function loadSheetEquipment(clientId) {
    const container = document.getElementById('sheet-equipment-list');
    container.innerHTML = '<p class="text-center">Chargement...</p>';
    try {
        const res = await fetch(`/api/clients/${clientId}/equipment`);
        const list = await res.json();
        if(!list.length) { container.innerHTML = '<div class="equipment-empty">Aucun équipement.</div>'; return; }
        container.innerHTML = list.map(eq => {
            const days = eq.days_remaining;
            let statusClass = 'status-ok', pillClass = 'ok', textLabel = 'OK', textClass = 'text-success';
            if(days !== null) { if(days < 0) { statusClass = 'status-expired'; pillClass = 'expired'; textLabel = 'RETARD'; textClass = 'text-danger'; } else if(days < 30) { statusClass = 'status-warning'; pillClass = 'warning'; textLabel = 'BIENTÔT'; textClass = 'text-warning'; } }
            return `<div class="equipment-card ${statusClass}">
                <div class="equipment-info"><div class="equipment-name">${escapeHtml(eq.final_name)}</div><div class="equipment-meta"><span class="equipment-brand">${escapeHtml(eq.final_brand)}</span><span class="equipment-serial">S/N: ${escapeHtml(eq.serial_number||'-')}</span></div></div>
                <div class="equipment-status"><span class="status-pill ${pillClass}">${textLabel}</span><div class="equipment-days ${textClass}">${formatDate(eq.next_maintenance_date)}</div></div>
                <div style="margin-left:1rem; display:flex; flex-direction:column; gap:5px;">
                    <button class="btn-icon-sm btn-icon-primary" onclick='openEquipFormModal(${JSON.stringify(eq)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-icon-sm btn-icon-success" onclick="window.location.href='/reports.html?action=create&client=${clientId}&eq=${eq.id}'"><i class="fas fa-file-signature"></i></button>
                    <button class="btn-icon-sm btn-icon-danger" onclick="deleteEquipment(${clientId}, ${eq.id})"><i class="fas fa-trash"></i></button>
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
        if(!list.length) { container.innerHTML = `<div style="text-align:center; padding:30px; color:#94a3b8; border: 2px dashed #e2e8f0; border-radius:12px;"><i class="far fa-calendar-times" style="font-size:2rem; margin-bottom:10px; display:block;"></i>Aucun historique.</div>`; return; }
        container.innerHTML = list.map(h => {
            const isReport = h.source_type === 'report' || h.report_number;
            const typeClass = isReport ? 'type-report' : 'type-appointment';
            const badgeClass = isReport ? 'badge-report' : 'badge-manual';
            const badgeText = isReport ? (h.report_number ? `Rapport ${h.report_number}` : 'Rapport') : 'Note Manuelle';
            let machineHtml = '';
            if (h.machines) machineHtml = `<div class="history-machine"><i class="fas fa-microchip"></i> ${escapeHtml(h.machines.length > 50 ? h.machines.substring(0, 50) + '...' : h.machines)}</div>`;
            let actionBtn = h.report_id ? `<button class="btn-xs btn-primary" onclick="window.open('/report-view.html?id=${h.report_id}', '_blank')"><i class="fas fa-file-pdf"></i> Voir</button>` : `<button class="btn-xs btn-danger" onclick="deleteHistoryItem(${clientId}, ${h.id})"><i class="fas fa-trash"></i></button>`;
            return `<div class="history-item ${typeClass}">
                <div class="history-dot"></div>
                <div class="history-header"><div class="history-date"><i class="far fa-calendar-alt" style="color:var(--neutral-400); margin-right:5px;"></i> ${formatDate(h.appointment_date)}</div><span class="history-badge ${badgeClass}">${badgeText}</span></div>
                ${machineHtml}
                <div class="history-desc">${escapeHtml(h.task_description)}</div>
                <div class="history-footer"><div class="history-tech"><i class="fas fa-user-circle"></i> ${escapeHtml(h.technician_name || 'Inconnu')}</div><div>${actionBtn}</div></div>
            </div>`;
        }).join('');
    } catch(e){ console.error(e); }
}

async function deleteHistoryItem(clientId, histId) {
    if(!confirm("Supprimer cette entrée ?")) return;
    try { await fetch(`/api/clients/${clientId}/appointments/${histId}`, { method: 'DELETE' }); loadSheetHistory(clientId); } catch(e){}
}

// --- FORMS CLIENT & GEOLOCALISATION ---
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

// FONCTION MAGIQUE DE GÉOLOCALISATION
async function searchCoordinates() {
    const address = document.getElementById('address').value;
    const city = document.getElementById('city').value;
    const npa = document.getElementById('postal-code').value;
    const statusDiv = document.getElementById('geo-status');

    if(!address || !city) { statusDiv.innerHTML = '<span style="color:#ef4444;">Adresse et Ville requises.</span>'; return; }

    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recherche...';
    
    // Construction de la requête OpenStreetMap Nominatim
    const query = `${address}, ${npa} ${city}, Switzerland`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.length > 0) {
            const best = data[0];
            document.getElementById('client-lat').value = best.lat;
            document.getElementById('client-lon').value = best.lon;
            statusDiv.innerHTML = '<span style="color:#166534;"><i class="fas fa-check"></i> Trouvé !</span>';
        } else {
            statusDiv.innerHTML = '<span style="color:#ef4444;">Aucun résultat trouvé. Vérifiez l\'adresse.</span>';
        }
    } catch(e) {
        console.error(e);
        statusDiv.innerHTML = '<span style="color:#ef4444;">Erreur réseau.</span>';
    }
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

// --- FORMS EQUIPMENT ---
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
async function confirmDeleteClient() { if(!clientIdToDelete) return; await fetch(`/api/clients/${clientIdToDelete}`, { method: 'DELETE' }); closeDeleteModal(); loadClients(); }

// --- HELPERS ---
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