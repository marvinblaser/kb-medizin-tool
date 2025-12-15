// public/js/clients.js

// --- VARIABLES GLOBALES ---
let currentPage = 1;
let currentLimit = 25;
let currentSort = { col: 'cabinet_name', order: 'ASC' }; // Tri Annuaire
let currentPlanningSort = { col: 'next_maintenance_date', order: 'ASC' }; // Tri Planning
let currentUser = null;
let currentClientId = null; // ID du client actuellement ouvert dans la fiche
let clientIdToDelete = null;
let catalog = [];

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadEquipmentCatalog();
    
    // Chargement initial (Annuaire)
    loadClients(); 

    // --- LISTENERS ANNUAIRE ---
    const searchInput = document.getElementById('global-search');
    if(searchInput) searchInput.addEventListener('input', debounce(() => { currentPage=1; loadClients(); }, 400));
    
    const toggleBtn = document.getElementById('toggle-filters-btn');
    if(toggleBtn) toggleBtn.addEventListener('click', () => { 
        document.getElementById('advanced-filters').classList.toggle('hidden'); 
    });
    
    const clearBtn = document.getElementById('clear-filters-btn');
    if(clearBtn) clearBtn.addEventListener('click', () => { 
        document.querySelectorAll('#advanced-filters input, #advanced-filters select').forEach(i=>i.value=''); 
        if(searchInput) searchInput.value=''; 
        loadClients(); 
    });
    
    ['filter-brand', 'filter-model', 'filter-serial', 'filter-category'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', debounce(() => { currentPage=1; loadClients(); }, 500));
    });

    // --- LISTENERS PLANNING ---
    const togglePlanBtn = document.getElementById('toggle-planning-filters-btn');
    if(togglePlanBtn) togglePlanBtn.addEventListener('click', () => {
        document.getElementById('planning-advanced-filters').classList.toggle('hidden');
    });

    const reloadPlan = () => loadPlanning();
    const planningInputs = ['planning-search', 'plan-filter-status', 'plan-filter-canton', 'plan-filter-category', 'plan-filter-brand', 'plan-filter-model', 'plan-filter-serial', 'plan-filter-year'];
    
    planningInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            if(el.tagName === 'SELECT') el.addEventListener('change', reloadPlan);
            else el.addEventListener('input', debounce(reloadPlan, 500));
        }
    });

    const resetPlanBtn = document.getElementById('plan-reset-btn');
    if(resetPlanBtn) resetPlanBtn.addEventListener('click', () => {
        planningInputs.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        loadPlanning();
    });

    // --- LISTENERS MODALES & ACTIONS ---
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // Fiche Client
    const editSheetBtn = document.getElementById('sheet-edit-btn');
    if(editSheetBtn) editSheetBtn.addEventListener('click', () => { 
        closeClientDetailsModal(); 
        openClientModal(currentClientId); 
    });
    
    const addEquipBtn = document.getElementById('sheet-add-equip-btn');
    if(addEquipBtn) addEquipBtn.addEventListener('click', () => openEquipFormModal());
    
    // Formulaire Équipement
    const saveEquipBtn = document.getElementById('save-equipment-item-btn');
    if(saveEquipBtn) saveEquipBtn.addEventListener('click', saveEquipmentItem);
    
    // Suppression
    const cancelDel = document.getElementById('cancel-delete-btn');
    if(cancelDel) cancelDel.addEventListener('click', closeDeleteModal);
    
    const confirmDel = document.getElementById('confirm-delete-btn');
    if(confirmDel) confirmDel.addEventListener('click', confirmDeleteClient);

    // Pagination
    const prevPage = document.getElementById('prev-page');
    if(prevPage) prevPage.addEventListener('click', () => { if(currentPage>1) { currentPage--; loadClients(); }});
    
    const nextPage = document.getElementById('next-page');
    if(nextPage) nextPage.addEventListener('click', () => { currentPage++; loadClients(); });
});

// ==========================================
// 1. AUTH & USER
// ==========================================
async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) throw new Error("Non connecté");
        const data = await res.json();
        currentUser = data.user;

        const ui = document.getElementById('user-info');
        if (ui) {
            ui.innerHTML = `
                <div class="user-avatar">${currentUser.name[0]}</div>
                <div class="user-details">
                    <strong>${escapeHtml(currentUser.name)}</strong>
                    <span>${currentUser.role}</span>
                </div>`;
        }
        if (currentUser.role === 'admin') {
            document.getElementById('admin-link')?.classList.remove('hidden');
        }
    } catch (e) {
        window.location.href = '/login.html';
    }
}

function logout() {
    fetch('/api/logout', { method: 'POST' }).then(() => window.location = '/login.html');
}

async function loadEquipmentCatalog() {
    try { 
        const res = await fetch('/api/admin/equipment'); 
        catalog = await res.json(); 
    } catch(e) { console.error(e); }
}

// ==========================================
// 2. GESTION DU TRI (3 ÉTATS)
// ==========================================
function handleSort(columnName) {
    const headers = document.querySelectorAll('th.sortable[data-col]');
    if (currentSort.col !== columnName) {
        currentSort = { col: columnName, order: 'ASC' };
    } else {
        if (currentSort.order === 'ASC') currentSort.order = 'DESC';
        else if (currentSort.order === 'DESC') currentSort = { col: 'cabinet_name', order: 'ASC' }; 
    }
    updateSortIcons(headers, currentSort, 'data-col');
    loadClients();
}

function handlePlanningSort(columnName) {
    const headers = document.querySelectorAll('th.sortable[data-plan-col]');
    if (currentPlanningSort.col !== columnName) {
        currentPlanningSort = { col: columnName, order: 'ASC' };
    } else {
        if (currentPlanningSort.order === 'ASC') currentPlanningSort.order = 'DESC';
        else if (currentPlanningSort.order === 'DESC') currentPlanningSort = { col: 'next_maintenance_date', order: 'ASC' };
    }
    updateSortIcons(headers, currentPlanningSort, 'data-plan-col');
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

// ==========================================
// 3. ANNUAIRE CLIENTS (LOGIQUE)
// ==========================================
async function loadClients() {
    // Helper safe value
    const getVal = (id) => document.getElementById(id)?.value || '';

    const search = getVal('global-search');
    const brand = getVal('filter-brand');
    const model = getVal('filter-model');
    const serial = getVal('filter-serial');
    const category = getVal('filter-category');

    let url = `/api/clients?page=${currentPage}&limit=${currentLimit}&search=${encodeURIComponent(search)}`;
    url += `&sortBy=${currentSort.col}&sortOrder=${currentSort.order}`;
    if(brand) url += `&brand=${encodeURIComponent(brand)}`;
    if(model) url += `&model=${encodeURIComponent(model)}`;
    if(serial) url += `&serialNumber=${encodeURIComponent(serial)}`;
    if(category) url += `&category=${encodeURIComponent(category)}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        renderClientsTable(data.clients);
        updatePagination(data.pagination);
    } catch(e) { console.error(e); }
}

function renderClientsTable(clients) {
    const tbody = document.getElementById('clients-tbody');
    if(!clients.length) { tbody.innerHTML = `<tr><td colspan="6" class="text-center">Aucun client trouvé.</td></tr>`; return; }
    
    tbody.innerHTML = clients.map(c => {
        // Génération Badges Équipements
        let badgesHtml = '<span style="color:#94a3b8; font-style:italic; font-size:0.85em;">-</span>';
        if (c.equipment_summary) {
            const items = c.equipment_summary.split(';;');
            const maxDisplay = 3;
            const badges = items.slice(0, maxDisplay).map(i => {
                const parts = i.split(':');
                const type = parts[0] || 'Autre';
                
                let icon = 'fa-cogs';
                if(type.toLowerCase().includes('orl')) icon = 'fa-chair';
                else if(type.toLowerCase().includes('gynéco')) icon = 'fa-venus';
                else if(type.toLowerCase().includes('stéril') || type.toLowerCase().includes('autoclave')) icon = 'fa-pump-soap';
                
                return `<span class="eq-badge"><i class="fas ${icon}"></i> ${escapeHtml(type)}</span>`;
            }).join('');
            
            badgesHtml = `<div style="display:flex;flex-wrap:wrap;">${badges}${items.length > maxDisplay ? `<span class="eq-badge eq-badge-more">+${items.length - maxDisplay}</span>` : ''}</div>`;
        }

        return `
        <tr onclick="openClientDetails(${c.id})" style="cursor:pointer;">
            <td>
                <div class="client-name">${escapeHtml(c.cabinet_name)}</div>
                <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.activity)}</div>
            </td>
            <td>
                <div style="font-weight:500;">${escapeHtml(c.city)} <span style="background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:0.75rem;">${c.canton||''}</span></div>
                <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.address)}</div>
            </td>
            <td>
                <div style="font-size:0.85rem; font-weight:500;">${escapeHtml(c.contact_name)}</div>
                <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.phone||'-')}</div>
                <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(c.email||'-')}</div>
            </td>
            <td>${badgesHtml}</td>
            <td>${formatDate(c.appointment_at)}</td>
            <td onclick="event.stopPropagation()">
                <button class="btn-icon-sm btn-icon-primary" onclick="openClientModal(${c.id})" title="Modifier"><i class="fas fa-pen"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ==========================================
// 4. PLANNING GLOBAL (CORRECTION CRASH)
// ==========================================
async function loadPlanning() {
    // Fonction Helper sécurisée : Si l'élément n'existe pas, renvoie chaîne vide ''
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };

    const params = new URLSearchParams({
        search: getVal('planning-search'),
        status: getVal('plan-filter-status'),
        canton: getVal('plan-filter-canton'),
        category: getVal('plan-filter-category'),
        brand: getVal('plan-filter-brand'),
        model: getVal('plan-filter-model'),
        serial: getVal('plan-filter-serial'),
        year: getVal('plan-filter-year'),
        sortBy: currentPlanningSort.col,
        sortOrder: currentPlanningSort.order
    });

    const tbody = document.getElementById('planning-tbody');
    if (!tbody) return; // Sécurité si on n'est pas sur la bonne page
    
    tbody.innerHTML = `<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>`;

    try {
        const res = await fetch(`/api/clients/planning?${params.toString()}`);
        const rows = await res.json();

        if(!rows.length) { tbody.innerHTML = `<tr><td colspan="8" class="text-center">Aucun résultat trouvé.</td></tr>`; return; }

        tbody.innerHTML = rows.map(item => {
            const days = item.days_remaining;
            let rowClass = '';
            let daysText = days !== null ? `${days} j` : '-';

            if (days !== null) {
                if (days < 0) rowClass = 'planning-row-danger';     
                else if (days < 30) rowClass = 'planning-row-warning'; 
                else rowClass = 'planning-row-success';            
            }

            return `
            <tr class="${rowClass}">
                <td style="font-weight:600;">
                    ${escapeHtml(item.cabinet_name)}
                    <div style="font-size:0.85em; font-weight:normal; color:#555;">${escapeHtml(item.city)}</div>
                </td>
                <td style="text-align:center;">
                    <span style="background:white; border:1px solid #ccc; padding:1px 5px; border-radius:4px; font-size:0.8em;">${escapeHtml(item.canton || '-')}</span>
                </td>
                <td>
                    <strong>${escapeHtml(item.catalog_name || 'Inconnu')}</strong>
                    <div style="font-size:0.85em;">${escapeHtml(item.brand || '')} ${escapeHtml(item.model || '')}</div>
                    <div style="font-size:0.8em; color:#666;">S/N: ${escapeHtml(item.serial_number || '-')}</div>
                </td>
                <td>${escapeHtml(item.type || '-')}</td>
                <td>${formatDate(item.last_maintenance_date)}</td>
                <td style="font-weight:bold;">${formatDate(item.next_maintenance_date)}</td>
                <td style="text-align:center; font-weight:bold;">${daysText}</td>
                <td style="text-align:center;">
                    <button class="btn-icon-sm btn-icon-success" onclick="window.location.href='/reports.html?action=create&client=${item.client_id}&eq=${item.id}'" title="Créer Rapport"><i class="fas fa-file-signature"></i></button>
                </td>
            </tr>`;
        }).join('');

    } catch(e) { console.error(e); tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erreur chargement</td></tr>`; }
}

// ==========================================
// 5. FICHE CLIENT & ONGLETS
// ==========================================
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
        
        // Reset Onglet
        switchSheetTab('equipment'); // Par défaut
        loadSheetEquipment(id);
        loadSheetHistory(id);
        
        modal.classList.add('active');
    } catch(e) { console.error(e); alert("Impossible de charger le client."); }
}

function closeClientDetailsModal() {
    document.getElementById('client-details-modal').classList.remove('active');
}

// Charge l'onglet "Parc Machines" (Design Cards)
async function loadSheetEquipment(clientId) {
    const container = document.getElementById('sheet-equipment-list');
    container.innerHTML = '<p class="text-center">Chargement...</p>';
    
    try {
        const res = await fetch(`/api/clients/${clientId}/equipment`);
        const list = await res.json();
        
        if(!list.length) { container.innerHTML = '<div class="equipment-empty">Aucun équipement installé.</div>'; return; }
        
        container.innerHTML = list.map(eq => {
            const days = eq.days_remaining;
            let statusClass = 'status-ok';
            let pillClass = 'ok';
            let textClass = 'text-success';
            let textLabel = 'OK';
            
            if(days !== null) {
                if(days < 0) { statusClass = 'status-expired'; pillClass = 'expired'; textClass = 'text-danger'; textLabel = 'RETARD'; }
                else if(days < 30) { statusClass = 'status-warning'; pillClass = 'warning'; textClass = 'text-warning'; textLabel = 'BIENTÔT'; }
            }

            return `
            <div class="equipment-card ${statusClass}">
                <div class="equipment-info">
                    <div class="equipment-name">${escapeHtml(eq.final_name)}</div>
                    <div class="equipment-meta">
                        <span class="equipment-brand">${escapeHtml(eq.final_brand)}</span>
                        <span class="equipment-serial">S/N: ${escapeHtml(eq.serial_number||'-')}</span>
                    </div>
                </div>
                <div class="equipment-status">
                    <span class="status-pill ${pillClass}">${textLabel}</span>
                    <div class="equipment-days ${textClass}">${formatDate(eq.next_maintenance_date)}</div>
                </div>
                <div style="margin-left: 1rem; display:flex; flex-direction:column; gap:5px;">
                    <button class="btn-icon-sm btn-icon-primary" onclick='openEquipFormModal(${JSON.stringify(eq)})' title="Modifier"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon-sm btn-icon-success" onclick="window.location.href='/reports.html?action=create&client=${clientId}&eq=${eq.id}'" title="Rapport"><i class="fas fa-file-signature"></i></button>
                </div>
            </div>`;
        }).join('');
    } catch(e) { console.error(e); container.innerHTML = "Erreur."; }
}

// Charge l'onglet "Historique"
async function loadSheetHistory(clientId) {
    const container = document.getElementById('sheet-history-list');
    container.innerHTML = '<p class="text-center">Chargement...</p>';
    try {
        const res = await fetch(`/api/clients/${clientId}/appointments`);
        const list = await res.json();
        
        if(!list.length) { container.innerHTML = '<div class="equipment-empty">Aucun historique.</div>'; return; }
        
        container.innerHTML = list.map(h => `
            <div class="history-item">
                <div class="history-item-header">
                    <div class="history-date"><i class="far fa-calendar-alt"></i> ${formatDate(h.appointment_date)}</div>
                    <div class="history-tech">${escapeHtml(h.technician_name||'Technicien')}</div>
                </div>
                <div class="history-content">${escapeHtml(h.task_description)}</div>
                ${h.report_number ? `<div style="margin-top:5px;"><a href="/report-view.html?id=${h.report_id}" target="_blank" class="text-sm text-primary"><i class="fas fa-file-pdf"></i> Rapport ${h.report_number}</a></div>` : ''}
            </div>
        `).join('');
    } catch(e){ console.error(e); }
}

// ==========================================
// 6. GESTION FORMULAIRES (CLIENT / MACHINE)
// ==========================================

// --- Formulaire Client (Modification/Création) ---
async function openClientModal(id = null) {
    const modal = document.getElementById('client-modal');
    const form = document.getElementById('client-form');
    form.reset();
    document.getElementById('client-id').value = '';
    
    if (id) {
        try {
            const res = await fetch(`/api/clients/${id}`);
            const data = await res.json();
            document.getElementById('client-id').value = data.id;
            document.getElementById('cabinet-name').value = data.cabinet_name;
            document.getElementById('contact-name').value = data.contact_name;
            document.getElementById('activity').value = data.activity;
            document.getElementById('address').value = data.address;
            document.getElementById('postal-code').value = data.postal_code || '';
            document.getElementById('city').value = data.city;
            document.getElementById('canton').value = data.canton;
            document.getElementById('phone').value = data.phone || '';
            document.getElementById('email').value = data.email || '';
            document.getElementById('notes').value = data.notes || '';
        } catch(e) { console.error(e); }
    }
    modal.classList.add('active');
}

function closeClientModal() { 
    document.getElementById('client-modal').classList.remove('active'); 
}

async function saveClient() {
    const id = document.getElementById('client-id').value;
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
        notes: document.getElementById('notes').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/clients/${id}` : '/api/clients';

    try {
        const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
        if (res.ok) {
            closeClientModal();
            loadClients();
            // Si on éditait depuis la fiche, recharger la fiche
            if(id && id == currentClientId) openClientDetails(id);
        } else alert("Erreur sauvegarde");
    } catch(e) { console.error(e); }
}

// --- Formulaire Équipement (Ajout/Edit) ---
function openEquipFormModal(eq = null) {
    const modal = document.getElementById('equipment-form-modal');
    const form = document.getElementById('equipment-item-form');
    form.reset();
    document.getElementById('equipment-item-id').value = '';
    
    // Charger catalogue
    const sel = document.getElementById('equipment-select');
    sel.innerHTML = '<option value="">-- Choisir Modèle --</option>' + 
        catalog.map(c => `<option value="${c.id}">${c.name} (${c.brand})</option>`).join('');

    if(eq) {
        document.getElementById('equipment-item-id').value = eq.id;
        sel.value = eq.equipment_id;
        document.getElementById('equipment-serial').value = eq.serial_number||'';
        if(eq.installed_at) document.getElementById('equipment-installed').value = eq.installed_at;
        if(eq.warranty_until) document.getElementById('equipment-warranty').value = eq.warranty_until;
        if(eq.last_maintenance_date) document.getElementById('last-maintenance').value = eq.last_maintenance_date;
        if(eq.maintenance_interval) document.getElementById('maintenance-interval').value = eq.maintenance_interval;
    }
    
    modal.classList.add('active');
}

function closeEquipFormModal() {
    document.getElementById('equipment-form-modal').classList.remove('active');
}

async function saveEquipmentItem() {
    const id = document.getElementById('equipment-item-id').value;
    const clientId = currentClientId; // On utilise le client de la fiche ouverte
    if(!clientId) return;

    const data = {
        equipment_id: document.getElementById('equipment-select').value,
        serial_number: document.getElementById('equipment-serial').value,
        installed_at: document.getElementById('equipment-installed').value,
        warranty_until: document.getElementById('equipment-warranty').value,
        last_maintenance_date: document.getElementById('last-maintenance').value,
        maintenance_interval: document.getElementById('maintenance-interval').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/clients/${clientId}/equipment/${id}` : `/api/clients/${clientId}/equipment`;

    try {
        const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        if(res.ok) {
            closeEquipFormModal();
            loadSheetEquipment(clientId); // Rafraîchir la fiche
            // Si le planning est visible, le rafraîchir aussi
            if(document.getElementById('view-planning').classList.contains('active')) loadPlanning();
        } else alert("Erreur sauvegarde équipement");
    } catch(e) { console.error(e); }
}

// --- Suppression ---
function openDeleteModal(id) { clientIdToDelete = id; document.getElementById('delete-modal').classList.add('active'); }
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); clientIdToDelete = null; }
async function confirmDeleteClient() {
    if(!clientIdToDelete) return;
    await fetch(`/api/clients/${clientIdToDelete}`, { method: 'DELETE' });
    closeDeleteModal(); loadClients();
}

// ==========================================
// 7. UTILITAIRES
// ==========================================
function debounce(f,w){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>f.apply(this,a),w);};}
function escapeHtml(t){if(!t)return '';return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function formatDate(s){return s?new Date(s).toLocaleDateString('fr-CH'):'-';}
function updatePagination(p){document.getElementById('pagination-info').textContent=`Page ${p.page}/${p.totalPages}`; document.getElementById('prev-page').disabled=p.page===1; document.getElementById('next-page').disabled=p.page===p.totalPages;}