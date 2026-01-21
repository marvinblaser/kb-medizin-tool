// public/js/clients.js

// --- VARIABLES GLOBALES ---
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
    // Note: Le style est maintenant dans le <head> de clients.html

    await checkAuth();
    await loadCatalog();
    loadData();

    // Listeners
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
    // Listener pour l'import Excel
    document.getElementById('import-excel-input')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Petit indicateur visuel (optionnel mais sympa)
        const btn = document.querySelector('button[title="Importer depuis Excel"]');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/clients/import', { method: 'POST', body: formData });
            const result = await res.json();
            
            if (res.ok) {
                alert(`Succès ! ${result.count || '?'} clients traités (actualisation en cours).`);
                loadData(); // Recharge la liste des clients
            } else {
                alert("Erreur lors de l'import : " + (result.error || "Inconnue"));
            }
        } catch (err) {
            console.error(err);
            alert("Erreur technique lors de l'envoi.");
        } finally {
            // On remet le bouton normal et on vide l'input pour permettre de réimporter le même fichier si besoin
            btn.innerHTML = originalContent;
            btn.disabled = false;
            e.target.value = ''; 
        }
    });
});

async function checkAuth() {
    try { const res = await fetch('/api/me'); if(!res.ok) window.location.href='/login.html'; const d=await res.json(); currentUser=d.user; document.getElementById('user-info').innerHTML=`<div class="user-avatar">${d.user.name[0]}</div><div class="user-details"><strong>${escapeHtml(d.user.name)}</strong><span>${d.user.role}</span></div>`; if(d.user.role === 'admin') document.getElementById('admin-link').classList.remove('hidden'); } catch { window.location.href='/login.html'; }
}
async function logout() { await fetch('/api/logout', {method:'POST'}); window.location.href = '/login.html'; }
async function loadCatalog() { try { const r = await fetch('/api/admin/equipment'); catalog = await r.json(); } catch {} }

function switchView(view) {
    currentView = view;
    // Mise à jour des boutons
    document.getElementById('tab-directory').classList.toggle('active', view === 'directory');
    document.getElementById('tab-planning').classList.toggle('active', view === 'planning');
    
    // Mise à jour des contenus
    document.getElementById('view-directory').classList.toggle('active', view === 'directory');
    document.getElementById('view-planning').classList.toggle('active', view === 'planning');
    
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
    if(!list || list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--neutral-400);">Aucun résultat trouvé.</td></tr>'; return; }
    tbody.innerHTML = list.map(c => `
        <tr onclick="openClientDetails(${c.id})">
            <td><strong style="color:var(--color-primary); font-size:0.95rem;">${escapeHtml(c.cabinet_name)}</strong><br><span style="font-size:0.8rem; color:var(--neutral-500);">${escapeHtml(c.activity)}</span></td>
            <td>${escapeHtml(c.city)} <span style="font-size:0.75rem; color:var(--neutral-400);">(${c.canton||''})</span></td>
            <td>${escapeHtml(c.contact_name)}<br><span style="font-size:0.75rem; color:var(--neutral-500);">${escapeHtml(c.phone||'-')}</span></td>
            <td><small style="color:var(--neutral-500);">${c.equipment_summary ? c.equipment_summary.split(';;').length + ' machines installées' : 'Aucune machine'}</small></td>
            <td>${c.appointment_at ? formatDate(c.appointment_at) : '-'}</td>
            <td style="text-align:right;">
                <button class="btn-icon-sm btn-icon-primary" onclick="event.stopPropagation(); openClientModal(${c.id})" title="Éditer"><i class="fas fa-pen"></i></button>
            </td>
        </tr>`).join('');
}

function renderPlanning(list) {
    const tbody = document.getElementById('planning-tbody');
    const items = Array.isArray(list) ? list : (list.data || []);
    if(items.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:3rem; color:var(--neutral-400);">Aucune maintenance prévue.</td></tr>'; return; }
    tbody.innerHTML = items.map(r => {
        let rowClass = 'row-ok', badgeHtml = '<span class="badge badge-success">OK</span>';
        if(r.days_remaining < 0) { rowClass = 'row-expired'; badgeHtml = '<span class="badge badge-danger">Expiré</span>'; }
        else if(r.days_remaining < 30) { rowClass = 'row-warning'; badgeHtml = '<span class="badge badge-warning">Bientôt</span>'; }
        return `<tr onclick="openClientDetails(${r.client_id})" class="${rowClass}">
            <td>${badgeHtml}</td>
            <td><strong>${escapeHtml(r.cabinet_name)}</strong></td>
            <td>${escapeHtml(r.city)}</td>
            <td><strong>${escapeHtml(r.catalog_name)}</strong><div style="font-size:0.8rem; color:var(--neutral-500);">${r.brand}</div></td>
            <td>${escapeHtml(r.type)}</td>
            <td style="color:var(--neutral-500);">${formatDate(r.last_maintenance_date)}</td>
            <td style="font-weight:700; color:var(--neutral-800);">${formatDate(r.next_maintenance_date)}</td>
            <td style="text-align:right;">
                <button class="btn-icon-sm btn-icon-secondary" onclick="event.stopPropagation(); window.location.href='/reports.html?action=create&client=${r.client_id}&eq=${r.id}'" title="Créer rapport"><i class="fas fa-file-signature"></i></button>
            </td>
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
    
    // Sélection par ID pour être plus robuste
    const btn = document.getElementById(`btn-tab-${tab}`);
    if(btn) btn.classList.add('active');
    
    document.getElementById(`tab-${tab}`).classList.add('active');
}

async function loadClientEquipment(id) {
    const div = document.getElementById('sheet-equipment-list');
    div.innerHTML = '<p style="color:var(--neutral-500);">Chargement...</p>';
    const res = await fetch(`/api/clients/${id}/equipment`);
    const list = await res.json();
    document.getElementById('count-eq').textContent = list.length;
    div.innerHTML = list.map(eq => {
        let color = 'var(--color-success)', text = 'OK';
        if(eq.days_remaining < 0) { color = 'var(--color-danger)'; text = 'Expiré'; }
        else if(eq.days_remaining < 30) { color = 'var(--color-warning)'; text = 'Bientôt'; }
        
        return `<div class="eq-card-pro" style="border-left-color:${color}">
            <div class="eq-info">
                <h4 class="eq-title">${escapeHtml(eq.final_name)}</h4>
                <p class="eq-sub">${escapeHtml(eq.final_brand)} • S/N: <code style="background:var(--neutral-100); padding:1px 4px; border-radius:4px;">${escapeHtml(eq.serial_number||'-')}</code></p>
                <span class="eq-date" style="color:${color}">${text} : ${formatDate(eq.next_maintenance_date)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <button class="btn-icon-sm btn-icon-secondary" onclick="openEquipFormModal(${JSON.stringify(eq).replace(/"/g, '&quot;')})" title="Modifier"><i class="fas fa-pen"></i></button>
                <button class="btn-icon-sm btn-icon-danger" onclick="deleteEquipment(${id}, ${eq.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

async function loadClientHistory(id) {
    const div = document.getElementById('sheet-history-list');
    div.innerHTML = '<p style="color:var(--neutral-500); padding-left:20px;">Chargement de l\'historique...</p>';
    
    try {
        const res = await fetch(`/api/clients/${id}/appointments`);
        const list = await res.json();
        document.getElementById('count-hist').textContent = list.length;
        
        if(list.length === 0) { 
            div.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--neutral-400); font-style:italic;"><i class="fas fa-history fa-2x" style="opacity:0.3; margin-bottom:10px;"></i><br>Aucun historique récent.</div>'; 
            return; 
        }
        
        div.innerHTML = list.map(h => {
            const isReport = h.source_type === 'report';
            const typeClass = isReport ? 'type-report' : 'type-rdv';
            const icon = isReport ? 'fa-file-alt' : 'fa-calendar-check';
            const title = isReport ? 'Rapport d\'Intervention' : 'Rendez-vous';
            const tagClass = isReport ? 'tag-report' : 'tag-rdv';
            const tagName = isReport ? (h.report_number || 'Rapport') : 'RDV';
            
            // CORRECTION: L'API renvoie le champ 'machines' (voir server/routes/clients.js)
            const machineName = h.machines || h.installation || h.equipment_name || null;
            
            // On affiche le badge seulement si une machine est trouvée
            const machineHtml = machineName ? 
                `<div class="timeline-machine"><i class="fas fa-server"></i> ${escapeHtml(machineName)}</div>` : '';

            // Formatage date
            const dateObj = new Date(h.appointment_date);
            const dateStr = dateObj.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            
            return `
            <div class="timeline-item ${typeClass}">
                <div class="timeline-marker"><i class="fas ${icon}"></i></div>
                <span class="timeline-date">${dateStr}</span>
                
                <div class="timeline-card">
                    <div class="timeline-header">
                        <h4 class="timeline-title">${title}</h4>
                        <span class="timeline-tag ${tagClass}">${tagName}</span>
                    </div>
                    
                    ${machineHtml}
                    
                    <div class="timeline-desc">
                        ${escapeHtml(h.task_description || 'Aucune description.')}
                    </div>

                    ${h.report_id ? `
                    <div class="timeline-action">
                        <button class="btn-doc-action" onclick="window.open('/report-view.html?id=${h.report_id}', '_blank')">
                            <i class="fas fa-file-pdf"></i> Ouvrir le document
                        </button>
                    </div>` : ''}
                </div>
            </div>`;
        }).join('');
        
    } catch(e) {
        console.error(e);
        div.innerHTML = '<p style="color:var(--color-danger);">Erreur de chargement.</p>';
    }
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

// --- UTILS ---
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

// Fonction appelée par le bouton "Exporter" dans le header
function exportData() {
    // On crée un lien temporaire pour déclencher le téléchargement
    const link = document.createElement('a');
    link.href = '/api/clients/export-excel';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}